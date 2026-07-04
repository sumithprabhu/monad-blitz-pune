import type { Address } from "viem";
import { formatUnits } from "viem";
import { agentVaultAbi } from "./abi.js";
import { publicClient, getAgentAccount, explorerTxUrl } from "./chain.js";
import { requireVaultAddress } from "./config.js";
import { describeOutcome, pollRequestUntilResolved, spend } from "./vaultClient.js";
import { approveRequest, revokeAgent } from "./ownerActions.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function heading(n: number, title: string) {
  console.log(`\n${"=".repeat(60)}\nBEAT ${n}: ${title}\n${"=".repeat(60)}`);
}

/**
 * Runs the four demo beats from README section 7, deterministically (no LLM
 * involved - this exercises the on-chain policy engine directly, not the
 * agent's decision-making). If OWNER_PRIVATE_KEY is set, the script also
 * plays the owner's part (approve + revoke) so the whole arc runs
 * unattended from one CLI invocation; otherwise it pauses and tells you
 * what to click in the dashboard.
 */
export async function runDemo() {
  const vaultAddress = requireVaultAddress();
  const recipient = requireEnv("RECIPIENT_ADDRESS") as Address;
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  const agentAddress = getAgentAccount().address;

  const policy = await publicClient.readContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "policies",
    args: [agentAddress],
  });
  const [active, perTxCap, dailyCap, , , approvalThreshold] = policy;
  if (!active) throw new Error(`Agent ${agentAddress} is not an active, registered agent on this vault`);

  console.log(`Vault:   ${vaultAddress}`);
  console.log(`Agent:   ${agentAddress}`);
  console.log(`Policy:  perTxCap=${formatUnits(perTxCap, 6)} dailyCap=${formatUnits(dailyCap, 6)} approvalThreshold=${formatUnits(approvalThreshold, 6)}`);

  // ---- Beat 1: small in-policy spend -> executes instantly ----
  heading(1, "in-policy spend executes instantly");
  const smallAmount = approvalThreshold > 0n && approvalThreshold < perTxCap ? approvalThreshold / 4n : perTxCap / 10n;
  const beat1 = await spend(recipient, smallAmount, "demo beat 1: small in-policy spend");
  console.log(describeOutcome(beat1));
  if (beat1.kind !== "executed") throw new Error("expected beat 1 to execute - check policy caps");

  // ---- Beat 2: oversized spend -> blocked on-chain ----
  heading(2, "oversized spend is blocked on-chain");
  const oversized = perTxCap + 1n;
  const beat2 = await spend(recipient, oversized, "demo beat 2: deliberately oversized");
  console.log(describeOutcome(beat2));
  if (beat2.kind !== "blocked") throw new Error("expected beat 2 to be blocked - check per-tx cap");

  // ---- Beat 3: big legit spend -> queued, then approved ----
  heading(3, "big legit spend is queued, then approved by the owner");
  if (approvalThreshold === 0n || approvalThreshold > perTxCap) {
    console.log("approvalThreshold is 0 or > perTxCap on this agent's policy - queue is unreachable, skipping beat 3");
  } else {
    const queueAmount = approvalThreshold;
    const beat3 = await spend(recipient, queueAmount, "demo beat 3: big legit spend needing approval");
    console.log(describeOutcome(beat3));
    if (beat3.kind !== "queued") throw new Error("expected beat 3 to be queued - check approvalThreshold");

    if (ownerPrivateKey) {
      console.log(`[owner] approving request #${beat3.requestId}...`);
      const hash = await approveRequest(ownerPrivateKey, beat3.requestId, beat3.amount);
      console.log(`[owner] approved: ${explorerTxUrl(hash)}`);
    } else {
      console.log(
        `Waiting for a human owner to approve request #${beat3.requestId} from the dashboard ` +
          `(or set OWNER_PRIVATE_KEY to automate this step)...`
      );
    }
    const resolved = await pollRequestUntilResolved(beat3.requestId);
    console.log(`request #${beat3.requestId} resolved with status ${resolved.status} (1=executed, 2=rejected, 3=cancelled)`);
  }

  // ---- Beat 4: owner revokes -> agent is bricked ----
  heading(4, "owner revokes the agent - next spend fails");
  if (ownerPrivateKey) {
    console.log(`[owner] revoking agent ${agentAddress}...`);
    const hash = await revokeAgent(ownerPrivateKey, agentAddress);
    console.log(`[owner] revoked: ${explorerTxUrl(hash)}`);
  } else {
    console.log(`Waiting for a human owner to hit Revoke on the dashboard for agent ${agentAddress}...`);
    console.log(`(set OWNER_PRIVATE_KEY to automate this step)`);
    while (true) {
      const p = await publicClient.readContract({
        address: vaultAddress,
        abi: agentVaultAbi,
        functionName: "policies",
        args: [agentAddress],
      });
      if (!p[0]) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const beat4 = await spend(recipient, 1n, "demo beat 4: should fail, agent is revoked");
  console.log(describeOutcome(beat4));
  if (beat4.kind !== "blocked" || beat4.reason !== "agent not active") {
    throw new Error("expected beat 4 to be blocked with reason 'agent not active'");
  }

  console.log("\nAll four demo beats completed.");
}
