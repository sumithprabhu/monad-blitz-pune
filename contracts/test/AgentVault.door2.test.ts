import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture, defaultPolicy, usdc } from "./helpers/fixture";
import { buildUnsignedUserOp, signUserOpHash } from "./helpers/userOp";

describe("AgentVault - Door 2 (ERC-4337)", () => {
  async function buildAndSignOp(params: {
    vault: any;
    entryPoint: any;
    vaultAddress: string;
    agentSigner: any;
    agentAddress: string;
    to: string;
    amount: bigint;
    memo: string;
    paymaster?: string;
    badSignature?: boolean;
  }) {
    const { vault, entryPoint, vaultAddress, agentSigner, agentAddress, to, amount, memo, paymaster, badSignature } =
      params;

    const callData = vault.interface.encodeFunctionData("executeFromEntryPoint", [
      agentAddress,
      to,
      amount,
      memo,
    ]);
    const nonce = await entryPoint.getNonce(vaultAddress, 0);

    const unsignedOp = buildUnsignedUserOp({
      sender: vaultAddress,
      nonce,
      callData,
      paymaster,
    });

    const userOpHash = await entryPoint.getUserOpHash(unsignedOp);
    const signature = badSignature
      ? await signUserOpHash(agentSigner, ethers.ZeroHash) // wrong hash -> wrong signer recovered
      : await signUserOpHash(agentSigner, userOpHash);

    return { ...unsignedOp, signature };
  }

  it("executes an in-policy spend via a UserOperation, self-funded (no paymaster)", async () => {
    const { deployer, userA, agentA1, recipientX, token, vault, entryPoint, vaultAddress, bundler } =
      await deployFixture();
    await vault.connect(userA).deposit(usdc(1000));
    await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy());
    await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("1") });

    const op = await buildAndSignOp({
      vault,
      entryPoint,
      vaultAddress,
      agentSigner: agentA1,
      agentAddress: agentA1.address,
      to: recipientX.address,
      amount: usdc(10),
      memo: "aa direct-funded spend",
    });

    const before = await token.balanceOf(recipientX.address);
    await expect(entryPoint.connect(bundler).handleOps([op], bundler.address))
      .to.emit(vault, "SpendExecuted")
      .withArgs(agentA1.address, recipientX.address, usdc(10), "aa direct-funded spend");

    expect(await token.balanceOf(recipientX.address)).to.equal(before + usdc(10));
  });

  it("executes a gasless spend sponsored by a paymaster (agent holds zero native balance)", async () => {
    const { userA, recipientX, token, vault, entryPoint, vaultAddress, paymaster, bundler } = await deployFixture();

    // A genuinely fresh wallet - never funded, not one of Hardhat's persistent dev accounts -
    // so there's no balance to sweep and no risk of leaking state into other tests that reuse
    // the same signer indices within this test run.
    const freshAgent = ethers.Wallet.createRandom().connect(ethers.provider);

    await vault.connect(userA).deposit(usdc(1000));
    await vault.connect(userA).registerAgent(freshAgent.address, defaultPolicy());
    await vault.connect(userA).setRecipient(freshAgent.address, recipientX.address, true);

    expect(await ethers.provider.getBalance(freshAgent.address)).to.equal(0n);

    const op = await buildAndSignOp({
      vault,
      entryPoint,
      vaultAddress,
      agentSigner: freshAgent,
      agentAddress: freshAgent.address,
      to: recipientX.address,
      amount: usdc(15),
      memo: "gasless spend",
      paymaster: await paymaster.getAddress(),
    });

    const before = await token.balanceOf(recipientX.address);
    await expect(entryPoint.connect(bundler).handleOps([op], bundler.address))
      .to.emit(vault, "SpendExecuted")
      .withArgs(freshAgent.address, recipientX.address, usdc(15), "gasless spend");

    expect(await token.balanceOf(recipientX.address)).to.equal(before + usdc(15));
    // Agent paid zero gas: its balance is still exactly zero after the op executed.
    expect(await ethers.provider.getBalance(freshAgent.address)).to.equal(0n);
  });

  it("routes through the same policy engine: an over-cap UserOp spend is blocked, not executed", async () => {
    const { deployer, userA, agentA1, recipientX, token, vault, entryPoint, vaultAddress, bundler } =
      await deployFixture();
    await vault.connect(userA).deposit(usdc(1000));
    await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100) }));
    await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("1") });

    const op = await buildAndSignOp({
      vault,
      entryPoint,
      vaultAddress,
      agentSigner: agentA1,
      agentAddress: agentA1.address,
      to: recipientX.address,
      amount: usdc(500),
      memo: "over cap via aa",
    });

    const before = await token.balanceOf(recipientX.address);
    await expect(entryPoint.connect(bundler).handleOps([op], bundler.address))
      .to.emit(vault, "SpendBlocked")
      .withArgs(agentA1.address, recipientX.address, usdc(500), "over cap via aa", "over per-tx cap");

    expect(await token.balanceOf(recipientX.address)).to.equal(before);
  });

  it("queues an approval-threshold UserOp spend exactly like Door 1", async () => {
    const { deployer, userA, agentA1, recipientX, vault, entryPoint, vaultAddress, bundler } = await deployFixture();
    await vault.connect(userA).deposit(usdc(1000));
    await vault
      .connect(userA)
      .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
    await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("1") });

    const op = await buildAndSignOp({
      vault,
      entryPoint,
      vaultAddress,
      agentSigner: agentA1,
      agentAddress: agentA1.address,
      to: recipientX.address,
      amount: usdc(75),
      memo: "aa queued spend",
    });

    await expect(entryPoint.connect(bundler).handleOps([op], bundler.address))
      .to.emit(vault, "SpendRequested")
      .withArgs(0, agentA1.address, recipientX.address, usdc(75), "aa queued spend");

    expect((await vault.getRequest(0)).status).to.equal(0);
  });

  it("rejects a UserOp signed by someone other than the agent named in callData", async () => {
    const { deployer, userA, agentA1, other, recipientX, vault, entryPoint, vaultAddress, bundler } =
      await deployFixture();
    await vault.connect(userA).deposit(usdc(1000));
    await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy());
    await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("1") });

    const op = await buildAndSignOp({
      vault,
      entryPoint,
      vaultAddress,
      agentSigner: other, // wrong signer for the "agent" encoded in callData
      agentAddress: agentA1.address,
      to: recipientX.address,
      amount: usdc(10),
      memo: "impersonation attempt",
    });

    await expect(entryPoint.connect(bundler).handleOps([op], bundler.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOp"
    );
  });

  it("rejects a UserOp for a revoked/inactive agent at the validation stage", async () => {
    const { deployer, userA, agentA1, recipientX, vault, entryPoint, vaultAddress, bundler } = await deployFixture();
    await vault.connect(userA).deposit(usdc(1000));
    await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy());
    await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("1") });
    await vault.connect(userA).revokeAgent(agentA1.address);

    const op = await buildAndSignOp({
      vault,
      entryPoint,
      vaultAddress,
      agentSigner: agentA1,
      agentAddress: agentA1.address,
      to: recipientX.address,
      amount: usdc(10),
      memo: "revoked agent",
    });

    await expect(entryPoint.connect(bundler).handleOps([op], bundler.address)).to.be.revertedWithCustomError(
      entryPoint,
      "FailedOp"
    );
  });

  it("lets the deployer manage the EntryPoint deposit directly", async () => {
    const { deployer, vault, entryPoint, vaultAddress } = await deployFixture();
    await vault.connect(deployer).fundEntryPointDeposit({ value: ethers.parseEther("2") });
    expect(await vault.entryPointDepositBalance()).to.equal(ethers.parseEther("2"));
    expect(await entryPoint.balanceOf(vaultAddress)).to.equal(ethers.parseEther("2"));

    await vault.connect(deployer).withdrawEntryPointDeposit(deployer.address, ethers.parseEther("1"));
    expect(await vault.entryPointDepositBalance()).to.equal(ethers.parseEther("1"));
  });
});
