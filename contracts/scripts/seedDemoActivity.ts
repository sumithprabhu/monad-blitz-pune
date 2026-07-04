/**
 * Registers two more agents under the deployer's address and generates a mixed batch of
 * realistic-looking spend activity from each (a couple of in-policy spends, one that queues
 * for approval, one that gets blocked over cap) - so the dashboard has real, varied on-chain
 * activity to show instead of an empty feed.
 *
 * Usage: npx hardhat run scripts/seedDemoActivity.ts --network monadTestnet
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadVaultAddress(): string {
  if (process.env.VAULT_ADDRESS) return process.env.VAULT_ADDRESS;
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")).contracts.AgentVault;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const vaultAddress = loadVaultAddress();
  const vault = await ethers.getContractAt("AgentVault", vaultAddress);

  console.log("Deployer:", deployer.address);
  console.log("Vault:   ", vaultAddress);

  const balance = await vault.userBalance(deployer.address);
  console.log("Deployer's tracked vault balance:", ethers.formatUnits(balance, 6), "mUSDC\n");

  // Two vendor-like recipient addresses, shared across both agents for a believable pattern.
  const recipientAlpha = ethers.Wallet.createRandom().address;
  const recipientBeta = ethers.Wallet.createRandom().address;
  console.log("Recipient Alpha (cloud/compute vendor):", recipientAlpha);
  console.log("Recipient Beta  (data/API vendor):     ", recipientBeta, "\n");

  const agentDefs = [
    {
      name: "Compute-Ops Agent",
      wallet: ethers.Wallet.createRandom().connect(ethers.provider),
      memos: [
        "Compute credits - Vast.ai GPU rental",
        "Cloud hosting - monthly retainer",
        "Infra scale-up - burst capacity",
        "Emergency GPU burst - over budget",
      ],
      amounts: ["5", "12", "35", "80"], // executed, executed, queued(>threshold), blocked(>perTxCap)
    },
    {
      name: "Data-Feed Agent",
      wallet: ethers.Wallet.createRandom().connect(ethers.provider),
      memos: [
        "Data provider - Chainlink feed subscription",
        "API usage - market data pull",
        "Quarterly data license renewal",
        "Unbudgeted data dump - rejected by policy",
      ],
      amounts: ["8", "15", "32", "90"],
    },
  ];

  const policy = {
    perTxCap: ethers.parseUnits("50", 6),
    dailyCap: ethers.parseUnits("500", 6),
    approvalThreshold: ethers.parseUnits("30", 6),
    validAfter: 0n,
    validUntil: 0n,
    whitelistOnly: true,
  };

  for (const def of agentDefs) {
    console.log(`\n=== ${def.name} (${def.wallet.address}) ===`);

    // fund the new agent's EOA with a little MON for its own gas (Door 1: agent pays its own gas)
    const fundTx = await deployer.sendTransaction({ to: def.wallet.address, value: ethers.parseEther("0.5") });
    await fundTx.wait();
    console.log("Funded with 0.5 MON for gas, tx:", fundTx.hash);

    const regTx = await vault.registerAgent(def.wallet.address, policy);
    await regTx.wait();
    console.log("Registered agent, tx:", regTx.hash);

    for (const recipient of [recipientAlpha, recipientBeta]) {
      const wlTx = await vault.setRecipient(def.wallet.address, recipient, true);
      await wlTx.wait();
    }
    console.log("Whitelisted both recipients");

    const vaultAsAgent = vault.connect(def.wallet);
    let queuedRequestId: bigint | null = null;

    for (let i = 0; i < def.amounts.length; i++) {
      const amount = ethers.parseUnits(def.amounts[i], 6);
      const to = i % 2 === 0 ? recipientAlpha : recipientBeta;
      const memo = def.memos[i];
      const tx = await vaultAsAgent.spend(to, amount, memo);
      const receipt = await tx.wait();

      const parsed = receipt!.logs
        .map((log) => {
          try {
            return vault.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((l) => l && ["SpendExecuted", "SpendBlocked", "SpendRequested"].includes(l.name));

      const outcome = parsed?.name ?? "unknown";
      console.log(`  spend ${def.amounts[i]} mUSDC -> ${to.slice(0, 8)}... ("${memo}") => ${outcome}`);
      if (outcome === "SpendRequested") {
        queuedRequestId = parsed!.args.id as bigint;
      }
    }

    // Leave one request queued per agent so the dashboard's Approval Queue panel has
    // something real to show - except approve the first agent's, to also demonstrate the
    // full approve -> executed arc in the live feed.
    if (queuedRequestId !== null && def === agentDefs[0]) {
      const approveTx = await vault.approveRequest(queuedRequestId, ethers.parseUnits("35", 6));
      await approveTx.wait();
      console.log(`  approved queued request #${queuedRequestId}, tx: ${approveTx.hash}`);
    } else if (queuedRequestId !== null) {
      console.log(`  left request #${queuedRequestId} pending in the approval queue`);
    }
  }

  console.log("\nDone. Refresh the dashboard to see the activity.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
