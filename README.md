<p align="center">
  <img src="./assets/logo.svg" alt="Leash Protocol" width="420" />
</p>

<p align="center">
  On-chain spend authorization for autonomous AI agents.
</p>

## Description

Leash Protocol gives autonomous agents a cryptographic leash the owner holds. Agents can
execute payments, but they never hold funds themselves. Every spend is checked against an
on-chain policy before anything moves. One vault, one pooled balance, every user's funds and
agents tracked separately, so a leaked or misbehaving agent key is bounded damage instead of
a total, irreversible drain.

## Features

- **Capped, not custodial**: per-transaction and daily caps mean a leaked agent key can only spend up to what you've allowed, never drain your balance.
- **Whitelist-enforced**: recipients are pre-approved per agent, so a compromised key can't redirect funds anywhere else.
- **Human-in-the-loop for big spends**: anything above the approval threshold queues for your sign-off instead of executing automatically.
- **Vault-wide circuit breaker**: a rolling velocity cap auto-pauses an agent's activity on abnormal spend patterns, no human needed to notice first.
- **Killable in one transaction**: revoking an agent freezes it and cancels its pending requests atomically.
- **Full on-chain audit trail**: every executed, blocked, and queued spend is an event; the dashboard is reconstructed straight from logs, no database.

## Contract addresses

Monad Testnet (chain ID `10143`)

| Contract | Address |
|---|---|
| AgentVault | `0x1aFd84580730D88Dc52fE2AE04c006a5d002f861` |
| MockUSDC | `0x506AD0B4b5eFeBc33ca2501fBCF1C8c2fFEFD599` |

---

Full technical documentation (architecture, setup, deployment) lives in [`docs/TECHNICAL.md`](./docs/TECHNICAL.md).
