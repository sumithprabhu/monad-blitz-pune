/**
 * Registers (or updates) an agent's policy on a deployed AgentVault and, optionally,
 * whitelists a recipient in the same run. Reads the deployed vault address from
 * deployments/<network>.json unless VAULT_ADDRESS is set explicitly.
 *
 * Usage (see README for the full demo runbook):
 *   AGENT_ADDRESS=0x... RECIPIENT_ADDRESS=0x... \
 *   PER_TX_CAP=100 DAILY_CAP=500 APPROVAL_THRESHOLD=50 WHITELIST_ONLY=true \
 *   npx hardhat run scripts/registerAgent.ts --network monadTestnet
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadVaultAddress(): string {
  if (process.env.VAULT_ADDRESS) return process.env.VAULT_ADDRESS;
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment file at ${file} and VAULT_ADDRESS not set`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")).contracts.AgentVault;
}

async function main() {
  const [owner] = await ethers.getSigners();
  const vaultAddress = loadVaultAddress();
  const vault = await ethers.getContractAt("AgentVault", vaultAddress);

  const agentAddress = process.env.AGENT_ADDRESS;
  if (!agentAddress) throw new Error("Set AGENT_ADDRESS to the agent's public address");

  const perTxCap = ethers.parseUnits(process.env.PER_TX_CAP || "100", 6);
  const dailyCap = ethers.parseUnits(process.env.DAILY_CAP || "500", 6);
  const approvalThreshold = ethers.parseUnits(process.env.APPROVAL_THRESHOLD || "50", 6);
  const validAfter = BigInt(process.env.VALID_AFTER || "0");
  const validUntilInput = process.env.VALID_UNTIL_HOURS;
  const validUntil = validUntilInput
    ? BigInt(Math.floor(Date.now() / 1000) + Number(validUntilInput) * 3600)
    : 0n;
  const whitelistOnly = (process.env.WHITELIST_ONLY ?? "true").toLowerCase() !== "false";

  const policy = { perTxCap, dailyCap, approvalThreshold, validAfter, validUntil, whitelistOnly };

  console.log("Vault:   ", vaultAddress);
  console.log("Owner:   ", owner.address);
  console.log("Agent:   ", agentAddress);
  console.log("Policy:  ", {
    perTxCap: ethers.formatUnits(perTxCap, 6),
    dailyCap: ethers.formatUnits(dailyCap, 6),
    approvalThreshold: ethers.formatUnits(approvalThreshold, 6),
    validAfter: validAfter.toString(),
    validUntil: validUntil.toString(),
    whitelistOnly,
  });

  const alreadyRegistered = await vault.agentExists(agentAddress);
  const tx = alreadyRegistered
    ? await vault.updateAgent(agentAddress, policy)
    : await vault.registerAgent(agentAddress, policy);
  await tx.wait();
  console.log(alreadyRegistered ? "Updated agent policy." : "Registered new agent.", "tx:", tx.hash);

  const recipient = process.env.RECIPIENT_ADDRESS;
  if (recipient) {
    const rtx = await vault.setRecipient(agentAddress, recipient, true);
    await rtx.wait();
    console.log("Whitelisted recipient:", recipient, "tx:", rtx.hash);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
