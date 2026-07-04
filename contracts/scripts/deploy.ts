import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Canonical ERC-4337 EntryPoint v0.7 — same address on every chain that has it deployed.
// Verify this is actually live on Monad testnet before relying on Door 2; if it isn't,
// set ENTRY_POINT_ADDRESS in .env to a self-deployed EntryPoint instead.
const CANONICAL_ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  const [deployer] = await ethers.getSigners();
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS || CANONICAL_ENTRYPOINT_V07;
  const seedAmount = process.env.SEED_AMOUNT_USDC || "50000";

  console.log("Network:        ", network.name);
  console.log("Deployer:       ", deployer.address);
  console.log("Vault owner:    ", ownerAddress);
  console.log("EntryPoint:     ", entryPointAddress);

  const entryPointCode = await ethers.provider.getCode(entryPointAddress);
  if (entryPointCode === "0x") {
    console.warn(
      `WARNING: no contract code at EntryPoint address ${entryPointAddress} on ${network.name}. ` +
        "Door 2 (ERC-4337) will not work until a valid EntryPoint is deployed there. " +
        "Door 1 (direct call) is unaffected."
    );
  }

  console.log("\nDeploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const token = await MockUSDC.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockUSDC:       ", tokenAddress);

  console.log("\nDeploying AgentVault...");
  const AgentVault = await ethers.getContractFactory("AgentVault");
  const vault = await AgentVault.deploy(tokenAddress, entryPointAddress, ownerAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("AgentVault:     ", vaultAddress);

  // AgentVault is multi-tenant: deposit()/withdraw() are open to anyone, tracked per-caller
  // internally (userBalance[msg.sender]) - there's no "the vault's balance" anymore, only
  // each depositor's own balance within the shared pool. This just gives the deployer a
  // demo starting balance in their own name; it is NOT a global seed for other users.
  console.log(`\nDepositing ${seedAmount} mUSDC into the deployer's own balance (demo starting funds)...`);
  const amount = ethers.parseUnits(seedAmount, 6);
  await (await token.mint(deployer.address, amount)).wait();
  await (await token.approve(vaultAddress, amount)).wait();
  await (await vault.deposit(amount)).wait();
  console.log(
    "Deployer's tracked balance in the vault:",
    ethers.formatUnits(await vault.userBalance(deployer.address), 6)
  );

  const deployment = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    owner: ownerAddress,
    entryPoint: entryPointAddress,
    contracts: {
      MockUSDC: tokenAddress,
      AgentVault: vaultAddress,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log("\nWrote deployment addresses to", outFile);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
