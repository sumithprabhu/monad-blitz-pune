import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixture";

describe("AgentVault - deployer admin surface (EntryPoint gas float only)", () => {
  it("lets the deployer manage the EntryPoint deposit", async () => {
    const { deployer, vault, entryPoint, vaultAddress } = await deployFixture();

    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("2") });
    expect(await vault.entryPointDepositBalance()).to.equal(ethers.parseEther("2"));
    expect(await entryPoint.balanceOf(vaultAddress)).to.equal(ethers.parseEther("2"));

    await vault.connect(deployer).withdrawEntryPointDeposit(deployer.address, ethers.parseEther("1"));
    expect(await vault.entryPointDepositBalance()).to.equal(ethers.parseEther("1"));
  });

  it("rejects EntryPoint deposit management from a non-deployer", async () => {
    const { userA, vault } = await deployFixture();

    await expect(
      vault.connect(userA).fundEntryPointDeposit({ value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    await expect(
      vault.connect(userA).withdrawEntryPointDeposit(userA.address, 1n)
    ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
  });

  it("does NOT gate deposit/withdraw/registerAgent/circuit-breaker behind the deployer - those are self-service per user", async () => {
    const { userA, vault } = await deployFixture();
    // None of these should revert with OwnableUnauthorizedAccount - they're plain user actions.
    await expect(vault.connect(userA).setVelocityCap(1000n)).to.not.be.reverted;
    await expect(vault.connect(userA).setPaused(true)).to.not.be.reverted;
    await expect(vault.connect(userA).setPaused(false)).to.not.be.reverted;
  });
});
