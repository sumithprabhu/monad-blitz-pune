import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture, defaultPolicy, usdc } from "./helpers/fixture";

describe("AgentVault - multi-tenant users", () => {
  describe("deposit / withdraw isolation", () => {
    it("tracks each user's deposit separately in one shared pool", async () => {
      const { userA, userB, vault, token, vaultAddress } = await deployFixture();

      await expect(vault.connect(userA).deposit(usdc(1000)))
        .to.emit(vault, "Deposited")
        .withArgs(userA.address, usdc(1000));
      await expect(vault.connect(userB).deposit(usdc(400)))
        .to.emit(vault, "Deposited")
        .withArgs(userB.address, usdc(400));

      expect(await vault.userBalance(userA.address)).to.equal(usdc(1000));
      expect(await vault.userBalance(userB.address)).to.equal(usdc(400));
      // One shared pool - the contract's total token balance is the sum of both.
      expect(await token.balanceOf(vaultAddress)).to.equal(usdc(1400));
    });

    it("lets a user withdraw only up to their own tracked balance", async () => {
      const { userA, userB, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault.connect(userB).deposit(usdc(400));

      await expect(vault.connect(userA).withdraw(usdc(1001))).to.be.revertedWith("insufficient balance");
      // Even though the pool holds 1400 total, userA cannot withdraw more than their own 1000.
      await expect(vault.connect(userA).withdraw(usdc(1000)))
        .to.emit(vault, "Withdrawn")
        .withArgs(userA.address, usdc(1000));

      expect(await vault.userBalance(userA.address)).to.equal(0n);
      expect(await vault.userBalance(userB.address)).to.equal(usdc(400));
    });

    it("never lets user A's withdrawal touch user B's balance", async () => {
      const { userA, userB, vault, token } = await deployFixture();
      await vault.connect(userA).deposit(usdc(100));
      await vault.connect(userB).deposit(usdc(5000));

      const beforeA = await token.balanceOf(userA.address);
      // userA tries to withdraw more than they deposited, even though the pool has plenty
      // (thanks to userB's deposit) - must still fail.
      await expect(vault.connect(userA).withdraw(usdc(200))).to.be.revertedWith("insufficient balance");
      expect(await token.balanceOf(userA.address)).to.equal(beforeA);
      expect(await vault.userBalance(userB.address)).to.equal(usdc(5000));
    });
  });

  describe("agent ownership", () => {
    it("records the registering user as the agent's owner", async () => {
      const { userA, agentA1, vault } = await deployFixture();
      await expect(vault.connect(userA).registerAgent(agentA1.address, defaultPolicy()))
        .to.emit(vault, "AgentRegistered")
        .withArgs(userA.address, agentA1.address, usdc(100), usdc(500), usdc(50), 0n, 0n, true);

      expect(await vault.agentOwner(agentA1.address)).to.equal(userA.address);
      expect(await vault.agentExists(agentA1.address)).to.equal(true);
    });

    it("blocks a user from managing another user's agent", async () => {
      const { userA, userB, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy());

      await expect(
        vault.connect(userB).updateAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(1) }))
      ).to.be.revertedWith("not your agent");
      await expect(vault.connect(userB).setRecipient(agentA1.address, recipientX.address, true)).to.be.revertedWith(
        "not your agent"
      );
      await expect(vault.connect(userB).revokeAgent(agentA1.address)).to.be.revertedWith("not your agent");
    });

    it("lets each user register and independently manage their own agents", async () => {
      const { userA, userB, agentA1, agentB1, vault } = await deployFixture();
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy());
      await vault.connect(userB).registerAgent(agentB1.address, defaultPolicy());

      await vault.connect(userA).revokeAgent(agentA1.address);
      expect((await vault.policies(agentA1.address)).active).to.equal(false);
      // userB's agent is untouched by userA's revoke.
      expect((await vault.policies(agentB1.address)).active).to.equal(true);
    });
  });

  describe("blacklist", () => {
    it("blocks a spend to a blacklisted recipient even when whitelistOnly is false", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ whitelistOnly: false, approvalThreshold: 0n }));

      await expect(vault.connect(userA).setBlacklist(recipientX.address, true))
        .to.emit(vault, "RecipientBlacklisted")
        .withArgs(userA.address, recipientX.address, true);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(10), "should be blocked"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(10), "should be blocked", "recipient blacklisted");
    });

    it("blacklist is per-user - blacklisting for userA does not affect userB's agents", async () => {
      const { userA, userB, agentA1, agentB1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault.connect(userB).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ whitelistOnly: false, approvalThreshold: 0n }));
      await vault
        .connect(userB)
        .registerAgent(agentB1.address, defaultPolicy({ whitelistOnly: false, approvalThreshold: 0n }));

      await vault.connect(userA).setBlacklist(recipientX.address, true);

      await expect(vault.connect(agentB1).spend(recipientX.address, usdc(10), "userB, not blacklisted")).to.emit(
        vault,
        "SpendExecuted"
      );
    });

    it("un-blacklisting restores the spend path", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ whitelistOnly: false, approvalThreshold: 0n }));
      await vault.connect(userA).setBlacklist(recipientX.address, true);
      await vault.connect(userA).setBlacklist(recipientX.address, false);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(10), "unblocked now")).to.emit(
        vault,
        "SpendExecuted"
      );
    });

    it("re-checks blacklist at approval time even if it changed after the request was queued", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ whitelistOnly: false, perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "queued before blacklist");

      await vault.connect(userA).setBlacklist(recipientX.address, true);
      await expect(vault.connect(userA).approveRequest(0, usdc(75))).to.be.revertedWith("recipient blacklisted");
    });
  });
});
