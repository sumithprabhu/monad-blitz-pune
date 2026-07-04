# AgentVault (dashboard-branded "Leash Protocol") — On-Chain Spend Authorization for AI Agents

> Agents can execute but can't be trusted with money. AgentVault gives them a cryptographic
> leash their owner holds — funds never leave a tracked balance the owner controls, every
> spend is policy-checked on-chain, visible, and killable in one tx.

**One contract, one pooled ERC-20 balance, many independent users.** Anyone can deposit into
the shared pool — but the contract tracks each depositor's balance separately, so no user can
ever withdraw, spend, or touch another user's funds. Each user registers their own agents and
gives each a policy — spend caps, an allowed-recipient whitelist, an expiry, an approval
threshold, plus a user-wide blacklist that blocks specific recipients across all of that
user's agents regardless of whitelist. An agent spends by calling the vault directly; **the
contract itself** enforces the policy — and draws only from its owning user's tracked balance
— on every spend, not a trusted off-chain server. Each user can freeze or revoke their own
agents in one transaction, and pause their own circuit breaker independently of everyone else.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Contract core (multi-tenant policy engine, Door 1) | **Done**, fully tested (40 tests) |
| 2 | Deploy to Monad testnet | **Done** — live and verified, see [addresses below](#3-monad-testnet-config) |
| 3 | Node/TS agent (Door 1) + demo harness | **Done**, verified end-to-end against a local chain. Registration/approval scripts are unaffected by the multi-tenant rewrite — same function signatures, the caller just becomes "the user" for whatever they register/approve instead of needing to be a single global owner. |
| 4 | Dashboard | **Done** — Next.js app, wallet-connect auth (RainbowKit: MetaMask, Coinbase Wallet, Rainbow, WalletConnect), light theme, sidebar-nav console (Dashboard / Agents / Treasury / Settings), scoped to whichever user is connected, every contract function reachable from the UI. Build verified (typecheck, production build); connected to the live deployed vault. |
| 5 | Hardening / polish | Caps + whitelist + expiry + approval queue + per-user circuit breaker + per-user blacklist all implemented and tested. |
| 6 | Door 2 (ERC-4337, bonus) | Contract side **done and tested** (real EntryPoint v0.7 + a test paymaster, gasless flow proven in Hardhat). Agent-side bundler client is written but **unverified against a live Pimlico endpoint** — see [Door 2 caveats](#door-2--erc-4337-bonus). |

**Multi-tenant rewrite (post-review):** the original design had one global owner; it was
rewritten to a proper multi-tenant model — see [Architecture](#1-architecture--multi-tenant-one-engine-two-doors)
and [Design decisions](#7-design-decisions) for what changed and why.

## 1. Architecture — multi-tenant, one engine, two doors

```
        user A ──┐                          user B ──┐
                  │  deposit/withdraw                  │  deposit/withdraw
                  │  (own balance only)                │  (own balance only)
                  ▼                                     ▼
              ┌──────────────────────────────────────────────┐
              │                  AgentVault                  │
              │  userBalance[A], userBalance[B], ...          │  one pooled mUSDC
              │  agentOwner[agent] = the registering user     │  balance, tracked
              │  _authorizeAndSpend() ← policy engine, ONCE   │  per-depositor
              └───────────────┬────────────────┬──────────────┘
                              │                │
                Door 1        │                │        Door 2 (bonus)
             direct call       │                │     ERC-4337 UserOperation
                              │                │
                      spend(to,amt,memo)         │  validateUserOp() → executeFromEntryPoint()
                              │                │
                    agent's own EOA             │   agent signs off-chain, a bundler submits,
                    pays its own gas            │   a paymaster can sponsor gas
```

Both doors call into the same internal `_authorizeAndSpend`. An agent's spend debits **only
its owning user's** `userBalance` — never the pool total, never another user's share.

### Policy engine rules (checked in order, per spend)

1. That agent's owning user hasn't paused their own circuit breaker
2. Agent policy `active`
3. Recipient is not on the owning user's blacklist (hard block, independent of whitelist)
4. `now >= validAfter` and (`validUntil == 0` or `now < validUntil`)
5. If `whitelistOnly`: recipient is in the agent's whitelist
6. `amount <= perTxCap` (hard ceiling — nothing bypasses this, not even the approval queue)
7. Rolling daily window: `spentToday + amount <= dailyCap`
8. The owning user's tracked `userBalance` covers the amount
9. That user's circuit breaker: rolling velocity window vs their own `userVelocityCap`; if
   exceeded, *only that user's* agents auto-pause (`userPaused[user] = true`)
10. If `amount >= approvalThreshold` (and threshold != 0): queued as a `PendingRequest` instead
    of executing — the owning user approves (optionally at a reduced amount) or rejects
11. Otherwise: executes immediately, `token.safeTransfer(to, amount)`, debited from
    `userBalance[owningUser]`

**Design choice — non-reverting policy engine.** A blocked spend does **not** revert the
transaction. It emits `SpendBlocked(agent, to, amount, memo, reason)` and returns normally.
This means a leaked agent key's blocked attempts still land on-chain as a visible event for
the dashboard, instead of disappearing as a reverted tx with only a private trace. Access
control (`nonReentrant`, agent-ownership checks) still reverts normally — only the *policy*
checks inside `_authorizeAndSpend` are non-reverting.

**Zero-value convention**, applied consistently:

| Field | `0` means |
|---|---|
| `perTxCap` / `dailyCap` | agent may spend nothing (safe-by-default deny) |
| `validAfter` | valid immediately |
| `validUntil` | never expires |
| `approvalThreshold` | no human-approval gate (always auto-execute, still capped) |
| `userVelocityCap` (per user) | that user's circuit breaker is disabled (opt-in) |

## 2. Repo layout

```
contracts/    Foundry-spec project built with Hardhat (per request) + TypeScript tests
  contracts/AgentVault.sol      the vault: multi-tenant policy engine + both doors
  contracts/MockUSDC.sol        6-decimal mock ERC-20 used as the demo settlement asset
  contracts/test/TestPaymaster.sol   "sponsor everything" paymaster, for Door 2 tests only
  contracts/test/DeployableEntryPoint.sol  pulls the reference EntryPoint v0.7 into the
                                 compilation graph so Hardhat can deploy it locally for tests
  test/           40 passing tests: deployer admin surface, Door 1 policy engine,
                    Door 2 ERC-4337 flow, multi-tenant isolation (deposits/withdrawals,
                    agent ownership, blacklist) - see AgentVault.users.test.ts
  scripts/deploy.ts          deploys MockUSDC + AgentVault, gives the deployer a demo
                              starting balance in their own name, writes deployments/<network>.json
  scripts/registerAgent.ts   registers/updates an agent + whitelists a recipient from the CLI
                              (whoever runs it becomes that agent's owning user)

agent/        Node/TS standalone agent (viem + @anthropic-ai/sdk)
  src/agent.ts       task loop: LLM decides a spend, submits via Door 1, handles all 3
                      on-chain outcomes (executed / blocked / queued)
  src/llm.ts         Claude Opus 4.8 tool-forced spend decision, with an offline
                      deterministic fallback when ANTHROPIC_API_KEY is unset
  src/demo.ts        deterministic four-beat demo harness (see below)
  src/ownerActions.ts   approve/reject/revoke, used by the demo harness so all four beats
                      can run unattended - functionally unchanged by the multi-tenant
                      rewrite (same call signatures; the caller is now "the user" for
                      whatever it's registering/approving, not a required global owner)
  src/door2/         ERC-4337 UserOperation builder + Pimlico bundler JSON-RPC client
                      (bonus, unverified against a live endpoint — see caveats below)

dashboard/    Next.js (App Router), branded "Leash Protocol" — landing page + dashboard
  app/page.tsx           landing page (no auth, no wallet code), light theme
  app/dashboard/         gated behind wallet connection (RainbowKit); sidebar-nav shell with 4 sections:
                          Dashboard (overview+approvals+feed) / Agents / Treasury / Settings
  lib/vaultEvents.tsx    one shared event subscription (getContractEvents backfill +
                          watchContractEvent live) that the whole dashboard is derived from
  lib/derive.ts          pure functions: logs -> agent-ownership map, live feed, approval
                          queue, whitelist, blacklist — all scoped to the connected user,
                          no backend, no database
  components/dashboard/  Sidebar, Overview, AgentsPanel (+ AgentCard, AddAgentForm,
                          EditPolicyForm), ApprovalQueuePanel, LiveFeedPanel,
                          TreasuryBalance + DepositCard + WithdrawCard, CircuitBreakerPanel,
                          BlacklistPanel, EntryPointAdminPanel
```

## 3. Monad testnet config

```
Chain ID:       10143  (0x279f)
RPC URL:        https://testnet-rpc.monad.xyz
Currency:       MON (gas only)
Block Explorer: https://testnet.monadexplorer.com  (redirects to testnet.monadvision.com)
Faucet:         Monad testnet faucet
```

`testnet.monadexplorer.com` now 308-redirects to `testnet.monadvision.com` — confirmed live.
The canonical ERC-4337 EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) **is
deployed on Monad testnet** — confirmed by reading its bytecode on-chain (16KB of code at that
address), so Door 2 is viable there. Pimlico's bundler endpoint is still unverified — see
[Door 2 caveats](#door-2--erc-4337-bonus).

### Deployed (Monad testnet) — multi-tenant version, current

| Contract | Address |
|---|---|
| MockUSDC | [`0x506AD0B4b5eFeBc33ca2501fBCF1C8c2fFEFD599`](https://testnet.monadvision.com/address/0x506AD0B4b5eFeBc33ca2501fBCF1C8c2fFEFD599) |
| AgentVault | [`0x1aFd84580730D88Dc52fE2AE04c006a5d002f861`](https://testnet.monadvision.com/address/0x1aFd84580730D88Dc52fE2AE04c006a5d002f861) |

Deployer (Ownable, EntryPoint gas-float admin only — **not** a treasury owner in this version):
`0xe701C317d677F9C54ACf59b5a5dbaDCfAa0AF2e0`. That address also deposited 50,000 mUSDC into
*its own* `userBalance` as demo starting funds — it does not belong to the contract or to any
other user. Deployment was read back and sanity-checked on-chain after the fact (`vault.owner()`,
`vault.token()`, `vault.entryPoint()`, `vault.userBalance(deployer)`, `vault.userPaused(deployer)`,
and the pool total all matched expectations).

> Superseded single-owner deployment (kept for reference, do not use):
> AgentVault `0xC3bE1ae23F558011b4d58a6075c86d74f2178217` / MockUSDC
> `0x6EBc97dcd489Ab0F7395fb164367beCfE12978C2`.

**Source verified** on [Sourcify](https://sourcify.dev) (Monad's own explorer sits behind a
Cloudflare bot-challenge that blocks the standard Etherscan-style `hardhat verify` flow —
Sourcify is chain-agnostic and lists Monad Testnet as supported, so that's the verification
path `hardhat.config.ts` is wired to):
- MockUSDC: https://repo.sourcify.dev/contracts/full_match/10143/0x506AD0B4b5eFeBc33ca2501fBCF1C8c2fFEFD599/
- AgentVault: https://repo.sourcify.dev/contracts/full_match/10143/0x1aFd84580730D88Dc52fE2AE04c006a5d002f861/

To redeploy or verify again: `contracts/deployments/monadTestnet.json` has the full record;
`npx hardhat verify --network monadTestnet <address> [constructorArgs...]` re-runs verification.

## 4. Setup

### Contracts

```bash
cd contracts
npm install
npm run compile
npm test              # 40 tests, both doors + multi-tenant isolation, should all pass
```

### Deploy to Monad testnet (tomorrow)

```bash
cd contracts
cp .env.example .env  # fill in DEPLOYER_PRIVATE_KEY (needs MON from the faucet)
npm run deploy:monad
# writes contracts/deployments/monadTestnet.json with the deployed addresses
```

Register an agent:

```bash
AGENT_ADDRESS=0x... RECIPIENT_ADDRESS=0x... \
PER_TX_CAP=100 DAILY_CAP=500 APPROVAL_THRESHOLD=50 WHITELIST_ONLY=true \
npx hardhat run scripts/registerAgent.ts --network monadTestnet
```

### Agent

```bash
cd agent
npm install
cp .env.example .env  # fill in VAULT_ADDRESS, TOKEN_ADDRESS, AGENT_PRIVATE_KEY, ...
npm run demo                          # runs the four demo beats deterministically
npm run spend -- "pay this month's cloud invoice"   # LLM-driven single spend
```

Both commands were run and verified end-to-end against a real chain (a local Hardhat node
standing in for Monad testnet) during development — see the demo runbook below for the actual
output shape.

### Dashboard

```bash
cd dashboard
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (optional), NEXT_PUBLIC_VAULT_ADDRESS, NEXT_PUBLIC_TOKEN_ADDRESS
npm run dev
```

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is only needed for RainbowKit's WalletConnect
(mobile/QR) connector — get a free one at [cloud.reown.com](https://cloud.reown.com). MetaMask,
Coinbase Wallet, Rainbow, and any other browser-extension wallet work via the injected
connector even without a real value there. Everything else works against any deployed vault,
local or Monad testnet.

**Verified so far:** `tsc --noEmit` clean, `next build` succeeds (production build), wired to
the live Monad testnet deployment above. **Not yet verified:** an actual MetaMask connect
round-trip and watching the feed/queue populate from real agent activity against this specific
deployment (it has no registered agents yet) — worth a pass once agents are registered against it.

## Dashboard

Branded **Leash Protocol** in the UI (text wordmark, Space Grotesk — no logo image). Light
theme throughout (both `/` and `/dashboard`), Monad's violet (`#836EF9`/`#5B3FD9`) as the one
accent color, Geist Sans/Mono for everything else. `/` is a static marketing page with zero
wallet code — hero + a 6-card security-model grid + a one-line footer; everything wallet- and
vault-related lives under `/dashboard`, gated behind a connected wallet (RainbowKit), laid out
as a sidebar-nav app rather than one long stacked page:

| Section | Route | What's there |
|---|---|---|
| Dashboard | `/dashboard` | Your stats (balance / agent count / circuit breaker), your approval queue, your live feed |
| Agents | `/dashboard/agents` | Register, edit policy, manage whitelist, revoke — only agents *you* registered |
| Treasury | `/dashboard/treasury` | Your tracked balance + the pool total, Deposit, Withdraw |
| Settings | `/dashboard/settings` | Your circuit breaker, your blacklist, and the deployer-only EntryPoint gas-float panel |

Every write function on the contract has a UI control — including `updateAgent` (Edit policy
on each agent card) and the new `setBlacklist` (Blacklist panel) that weren't in the original
single-owner build, plus a panel for the deployer-only `fundEntryPointDeposit` /
`withdrawEntryPointDeposit` pair (visible to everyone for discoverability; only functions if
you're connected as the deployer — see [Design decisions](#7-design-decisions)).

- **Auth**: RainbowKit (`lib/providers.tsx`, `lib/wagmi.ts`) — MetaMask, Coinbase Wallet,
  Rainbow, WalletConnect, and any other detected browser-extension wallet, wired through
  wagmi's `getDefaultConfig`. No email/social login or embedded wallets — this is a
  bring-your-own-wallet dashboard, which also sidesteps the "which chain is my wallet on"
  ambiguity a hosted-auth SIWE flow has (see the chain-pinning note below).
- **Chain access**: plain `wagmi`/`viem` throughout (`useAccount`, `useReadContract`,
  `useWriteContract`, `useWatchContractEvent`) — RainbowKit only supplies the connectors and
  the connect-button UI. Every write call is wrapped through `useVaultWriteContract`
  (`lib/useContractAction.ts`), which pins `chainId: monadTestnet.id` on each call so the
  wallet is forced to switch to (and add, if unknown) Monad Testnet before submitting, rather
  than silently sending on whatever chain the wallet last happened to be on. A persistent
  `NetworkGuard` banner also surfaces a wrong-network wallet immediately, not just on submit.
- **No backend, by design**: `lib/vaultEvents.tsx` opens one shared subscription per session
  (historical backfill via `getContractEvents` + live `watchContractEvent`, deduped and sorted).
  `lib/derive.ts` is pure functions over that log array — `deriveAgentOwnerMap` reconstructs
  which agents belong to the connected user from `AgentRegistered` events, and every other
  view (live feed, approval queue, whitelist, blacklist, agent list) filters through that map.
  No database, matching the same principle the contract's own events were designed around.
  Reads that need current on-chain state (policy caps, `userBalance`, `userPaused`) poll every
  4s via wagmi's `refetchInterval` instead — simple over precise, good enough for a live dashboard.
- **No admin gating on user actions**: there's no single "owner" anymore, so there's nothing to
  gate — deposit/withdraw/register/revoke/approve/blacklist buttons are always visible to
  whoever's connected, exactly matching the contract's own access model (per-agent-owner
  checks happen on-chain, not in the UI). The one exception is the EntryPoint admin panel,
  which stays visible to everyone but only succeeds for the deployer.

## 5. Demo runbook (four beats, ~2 min)

Opening line: *"Agents can execute but can't be trusted with money. We give them a
cryptographic leash the owner holds — funds never leave the owner's vault, every spend is
policy-checked on-chain, visible, and killable in one tx."*

`agent/src/demo.ts` (`npm run demo` in `agent/`) drives all four beats from the CLI. If
`OWNER_PRIVATE_KEY` is set it also plays the registering user's part (approve + revoke) so the
whole arc runs unattended; otherwise it pauses and tells you what to click on the dashboard.
(That env var name predates the multi-tenant rewrite — functionally it's just whichever
address registered the demo agent, since `approveRequest`/`revokeAgent` now check
`agentOwner[agent] == msg.sender` rather than a single global owner.)

1. **In-policy spend** — agent spends a small amount under both caps → `SpendExecuted`,
   dashboard feed lights up green.
2. **Oversized spend** — agent attempts more than `perTxCap` → `SpendBlocked` with reason
   `"over per-tx cap"`, grey on the dashboard. No revert, no gas wasted on a failed tx.
3. **Big legit spend** — amount `>= approvalThreshold` → `SpendRequested`, queued; the owning
   user approves from the dashboard (optionally at a reduced amount) → `RequestApproved` +
   `SpendExecuted` fire together.
4. **Revoke** — the owning user hits Revoke → agent's next `spend()` call returns
   `SpendBlocked` with reason `"agent not active"`. The agent is bricked in one transaction;
   any of its pending requests were auto-cancelled (`RequestCancelled`) at revoke time.

## 6. Security model

A leaked agent private key is **bounded damage by design** — contrast with a leaked normal
wallet key, which is a total, irreversible drain:

- **Capped** — `perTxCap` and `dailyCap` mean an attacker with the agent's key still can't
  drain its owning user's balance, only spend up to the configured limits.
- **Isolated by construction** — even a fully compromised agent key can only ever touch the
  `userBalance` of whichever user registered it. It cannot see or reach any other user's
  deposit in the same pooled contract — there's no code path from one user's agent to another
  user's funds.
- **Whitelist-required by default** (`whitelistOnly: true`) — funds can only reach
  pre-approved recipients, so an attacker can't redirect funds to themselves. This is the
  linchpin of the whole model.
- **Blacklist as a second, independent net** — a user-wide blacklist blocks specific
  recipients across *all* of that user's agents, even ones with `whitelistOnly: false`, and is
  re-checked at approval time in case something changes after a request is queued.
- **Approval queue** — spends above `approvalThreshold` never auto-execute; they surface to
  the owning user as an anomaly before any funds move.
- **Auto-expiry** — `validUntil` bounds how long a compromised key stays useful even if nobody
  notices.
- **Instant revocation** — one `revokeAgent` tx freezes the agent and cancels its pending
  requests atomically. Only that agent's owning user can call it.
- **Circuit breaker, scoped to the blast radius** — a per-user velocity cap auto-pauses *only
  that user's* agents on abnormal spend velocity — one compromised user's incident can't even
  theoretically affect another user sharing the same contract, turning "owner must notice and
  act" into "system auto-trips, and only within the affected user's own footprint."

### Anticipated questions

- **"Isn't this just ERC-4337 session keys?"** Session keys are the primitive — *who* can
  spend. The control plane on top (required memos and an on-chain audit trail, a human
  approval queue, per-agent caps, a vault-wide circuit breaker) is the product, and it's
  transport-agnostic: it works via a direct call today (Door 1) and drops straight into 4337
  session keys + a paymaster for gasless spends (Door 2) without touching the policy engine.
- **"Leak detection relies on the owner noticing."** Bounded by caps + whitelist + user
  isolation regardless of whether anyone's watching; the circuit breaker auto-pauses on
  velocity spikes without any human in the loop, and it only ever affects the one user whose
  agent tripped it.
- **"Why not give the agent its own wallet?"** Then a leaked key drains everything the wallet
  holds. AgentVault keeps funds in a balance the user controls; the agent only ever holds
  *permission*, never funds.
- **"Since it's multi-tenant, can one user's activity affect another's?"** No — by
  construction, not just by convention. Every check in the policy engine (`userBalance`,
  `userPaused`, `userVelocityCap`, `blacklisted`) is keyed by `agentOwner[agent]`, resolved
  fresh on every call. There's no shared mutable state between users except the token balance
  the pool holds in total, which no single withdraw/spend path can ever read or move on
  another user's behalf. This is directly tested — see `AgentVault.users.test.ts`.
- **"Key storage?"** Standard secrets hygiene is the operator's responsibility, same as any
  hot wallet — but the blast radius of a leak is small and user-scoped by design, which is the
  actual point.

## 7. Design decisions

A few places where this implementation is more specific than the loose spec it was built
from, worth knowing about:

- **Multi-tenant rewrite.** The original build had one global `owner` (Ownable) controlling
  everything. After review, it was rewritten so that `deposit`/`withdraw`/`registerAgent`/
  `updateAgent`/`setRecipient`/`revokeAgent`/`approveRequest`/`rejectRequest`/`setVelocityCap`/
  `setPaused`/`setBlacklist` have **no admin gate at all** — each is self-service, scoped to
  `msg.sender` (as a depositor) or to `agentOwner[agent] == msg.sender` (as an agent manager).
  `Ownable` survives only for `fundEntryPointDeposit`/`withdrawEntryPointDeposit`, which manage
  this contract's own MON gas float for Door 2 — an infra concern, not user treasury, and
  specifically the one function pair where a fully-open ACL would let anyone drain the shared
  gas deposit to an arbitrary address. This is a judgment call, not a requirement from any
  spec — flagged here in case a different tradeoff is wanted later.
- **`registerAgent`/`updateAgent` take a `PolicyParams` struct**, not the full `AgentPolicy`
  storage struct. `AgentPolicy` includes live counters (`spentToday`, `windowStart`) and
  `active` that a caller shouldn't be able to directly overwrite via a policy edit — those
  are managed internally (`revokeAgent` is the only way to deactivate; `updateAgent` never
  resets counters).
- **`approvalThreshold` is checked *after* `perTxCap`** in the policy engine, meaning
  `perTxCap` is an absolute ceiling nothing can cross, and only spends in the band
  `[approvalThreshold, perTxCap]` ever reach the queue. `registerAgent`/`updateAgent` reject a
  config where `approvalThreshold > perTxCap` (queue would be unreachable) as a sanity check.
- **Streaming/token-bucket daily budgets and approval-queue escalation** (mentioned as
  possible Phase 5 "depth" features in the original spec) were intentionally not built — the
  spec gave no concrete algorithm for either, and the explicitly-specified hard-reset rolling
  window + approval queue + circuit breaker are fully implemented and tested instead. Flagging
  this rather than silently guessing at an algorithm.
- **The engine's policy checks are non-reverting** (see architecture section above) — a
  deliberate, single consistent choice instead of a per-case mix of revert/non-revert, because
  the demo and dashboard both depend on blocked attempts being visible on-chain events rather
  than disappearing as reverted transactions.

## 8. Door 2 — ERC-4337 (bonus)

**Design.** Rather than deploying a separate ERC-4337 smart account per agent, `AgentVault`
itself acts as the single shared "account" for every registered agent. `validateUserOp`
recovers the signer of the UserOperation and requires it to equal the `agent` address encoded
as the first argument of `executeFromEntryPoint` in the UserOp's `callData`. Because
`callData` is part of what `userOpHash` commits to, the EntryPoint only ever calls
`executeFromEntryPoint` with the exact `(agent, to, amount, memo)` tuple that was signed and
validated — the signature-to-call binding is enforced at validation time, not trusted blindly
at execution time.

**What's tested (`contracts/test/AgentVault.door2.test.ts`, all passing):**
- A full UserOperation round-trip through a real, locally-deployed EntryPoint v0.7 —
  `validateUserOp` → `executeFromEntryPoint` → the same `_authorizeAndSpend` engine as Door 1.
- A gasless spend sponsored by a `TestPaymaster`, with the agent's account swept to zero MON
  first, proving the agent genuinely needs no funds.
- Policy blocks and the approval queue both work identically through Door 2 as through Door 1.
- Signature/agent mismatch and revoked-agent UserOps are rejected at validation
  (`FailedOp` from the EntryPoint).

**What's not verified:** `agent/src/door2/bundlerClient.ts` and `spend.ts` implement the
client side (build the UserOp, get a nonce and hash from the EntryPoint, sign, ask a paymaster
to sponsor it, submit via `eth_sendUserOperation`, poll for a receipt) against Pimlico's
documented v0.7 bundler JSON-RPC shape, but there was no network access to a live bundler
during development to exercise it. Before using Door 2 in the actual demo: confirm Pimlico's
current Monad-testnet bundler URL, confirm the RPC method names (`eth_sendUserOperation`,
`eth_estimateUserOperationGas`, `pimlico_getUserOperationGasPrice`, `pm_sponsorUserOperation`)
against their current docs, and run one UserOperation through end-to-end before relying on it
live. **Door 1 is the load-bearing demo path regardless** — Door 2 is presented as "the same
policy engine, gasless" on top of an already-proven baseline.

## 9. Test token

`MockUSDC` — 6 decimals, named `mUSDC`. Anyone can `mint()` on testnet (open faucet, not for
production) so the demo is self-serve. Native MON is only ever used for gas.
