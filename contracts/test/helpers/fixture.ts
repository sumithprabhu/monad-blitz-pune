import { ethers } from "hardhat";
import { AgentVault__factory, MockUSDC__factory } from "../../typechain-types";

export const ONE_DAY = 24 * 60 * 60;

/**
 * `deployer` is the Ownable admin - relevant ONLY for the EntryPoint gas-float functions.
 * `userA` / `userB` are two independent protocol users who each deposit their own funds
 * and register their own agents, to exercise cross-user isolation.
 */
export async function deployFixture() {
  const [deployer, userA, userB, agentA1, agentA2, agentB1, recipientX, recipientY, bundler, other] =
    await ethers.getSigners();

  const MockUSDC = (await ethers.getContractFactory("MockUSDC")) as unknown as MockUSDC__factory;
  const token = await MockUSDC.deploy(deployer.address);
  await token.waitForDeployment();

  const EntryPointFactory = await ethers.getContractFactory(
    "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint"
  );
  const entryPoint = await EntryPointFactory.deploy();
  await entryPoint.waitForDeployment();

  const AgentVault = (await ethers.getContractFactory("AgentVault")) as unknown as AgentVault__factory;
  const vault = await AgentVault.deploy(await token.getAddress(), await entryPoint.getAddress(), deployer.address);
  await vault.waitForDeployment();

  const TestPaymaster = await ethers.getContractFactory("TestPaymaster");
  const paymaster = await TestPaymaster.deploy(await entryPoint.getAddress());
  await paymaster.waitForDeployment();
  await paymaster.connect(deployer).deposit({ value: ethers.parseEther("5") });

  const vaultAddress = await vault.getAddress();

  // Fund each user with mUSDC and pre-approve the vault so tests can just call deposit().
  for (const user of [userA, userB]) {
    await token.connect(deployer).mint(user.address, usdc(100000));
    await token.connect(user).approve(vaultAddress, ethers.MaxUint256);
  }

  return {
    deployer,
    userA,
    userB,
    agentA1,
    agentA2,
    agentB1,
    recipientX,
    recipientY,
    bundler,
    other,
    token,
    entryPoint,
    vault,
    paymaster,
    vaultAddress,
  };
}

export function usdc(amount: number | string): bigint {
  return ethers.parseUnits(amount.toString(), 6);
}

export const defaultPolicy = (overrides: Partial<{
  perTxCap: bigint;
  dailyCap: bigint;
  approvalThreshold: bigint;
  validAfter: bigint;
  validUntil: bigint;
  whitelistOnly: boolean;
}> = {}) => ({
  perTxCap: overrides.perTxCap ?? usdc(100),
  dailyCap: overrides.dailyCap ?? usdc(500),
  approvalThreshold: overrides.approvalThreshold ?? usdc(50),
  validAfter: overrides.validAfter ?? 0n,
  validUntil: overrides.validUntil ?? 0n,
  whitelistOnly: overrides.whitelistOnly ?? true,
});
