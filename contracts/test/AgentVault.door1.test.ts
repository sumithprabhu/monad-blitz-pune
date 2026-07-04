import { expect } from "chai";
import { ethers, network } from "hardhat";
import { deployFixture, defaultPolicy, usdc, ONE_DAY } from "./helpers/fixture";

describe("AgentVault - Door 1 (direct call) policy engine", () => {
  describe("happy path", () => {
    it("executes an in-policy spend instantly, debiting the owning user's balance", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy());
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      const before = await token.balanceOf(recipientX.address);
      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(10), "coffee run"))
        .to.emit(vault, "SpendExecuted")
        .withArgs(agentA1.address, recipientX.address, usdc(10), "coffee run");

      expect(await token.balanceOf(recipientX.address)).to.equal(before + usdc(10));
      expect(await vault.userBalance(userA.address)).to.equal(usdc(990));
      expect((await vault.policies(agentA1.address)).spentToday).to.equal(usdc(10));
    });
  });

  describe("insufficient user balance", () => {
    it("blocks a spend that exceeds the owning user's pooled balance, even within policy caps", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(5)); // less than perTxCap/dailyCap
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), dailyCap: usdc(500), approvalThreshold: 0n }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      const before = await token.balanceOf(recipientX.address);
      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(10), "not enough funds"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(10), "not enough funds", "insufficient user balance");
      expect(await token.balanceOf(recipientX.address)).to.equal(before);
    });
  });

  describe("per-tx cap", () => {
    it("blocks (without reverting) a spend over the per-tx cap", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      const before = await token.balanceOf(recipientX.address);
      const tx = vault.connect(agentA1).spend(recipientX.address, usdc(150), "too big");
      await expect(tx)
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(150), "too big", "over per-tx cap");
      await expect(tx).to.not.be.reverted;

      expect(await token.balanceOf(recipientX.address)).to.equal(before);
    });
  });

  describe("daily cap", () => {
    it("blocks once the rolling daily cap is exhausted, then resets after a day", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), dailyCap: usdc(150), approvalThreshold: 0n }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      await vault.connect(agentA1).spend(recipientX.address, usdc(100), "spend 1");
      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(60), "spend 2"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(60), "spend 2", "over daily cap");

      await network.provider.send("evm_increaseTime", [ONE_DAY + 1]);
      await network.provider.send("evm_mine");

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(60), "spend after reset"))
        .to.emit(vault, "SpendExecuted")
        .withArgs(agentA1.address, recipientX.address, usdc(60), "spend after reset");
    });

    it("perTxCap=0 and dailyCap=0 hard-deny all spend (safe default)", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: 0n, dailyCap: 0n, approvalThreshold: 0n }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "nope"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(1), "nope", "over per-tx cap");
    });
  });

  describe("whitelist", () => {
    it("blocks spends to non-whitelisted recipients when whitelistOnly=true", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy({ whitelistOnly: true }));

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "not whitelisted"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(1), "not whitelisted", "recipient not whitelisted");
    });

    it("allows any recipient when whitelistOnly=false", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ whitelistOnly: false, approvalThreshold: 0n }));

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "any recipient ok")).to.emit(
        vault,
        "SpendExecuted"
      );
    });
  });

  describe("expiry window", () => {
    it("blocks spends before validAfter", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      const future = BigInt((await ethers.provider.getBlock("latest"))!.timestamp) + BigInt(ONE_DAY);
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy({ validAfter: future }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "too early"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(1), "too early", "policy not yet valid");
    });

    it("blocks spends after validUntil", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      const soon = BigInt((await ethers.provider.getBlock("latest"))!.timestamp) + 10n;
      await vault.connect(userA).registerAgent(agentA1.address, defaultPolicy({ validUntil: soon }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      await network.provider.send("evm_increaseTime", [20]);
      await network.provider.send("evm_mine");

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "expired"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(1), "expired", "policy expired");
    });
  });

  describe("approval queue", () => {
    it("queues a spend >= approvalThreshold instead of executing it", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      const before = await token.balanceOf(recipientX.address);
      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend"))
        .to.emit(vault, "SpendRequested")
        .withArgs(0, agentA1.address, recipientX.address, usdc(75), "big legit spend");

      expect(await token.balanceOf(recipientX.address)).to.equal(before);
      const req = await vault.getRequest(0);
      expect(req.status).to.equal(0);
      expect(req.amount).to.equal(usdc(75));
    });

    it("the owning user can approve at the full requested amount", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend");

      const before = await token.balanceOf(recipientX.address);
      await expect(vault.connect(userA).approveRequest(0, usdc(75)))
        .to.emit(vault, "RequestApproved")
        .withArgs(0, usdc(75))
        .and.to.emit(vault, "SpendExecuted")
        .withArgs(agentA1.address, recipientX.address, usdc(75), "big legit spend");

      expect(await token.balanceOf(recipientX.address)).to.equal(before + usdc(75));
      expect((await vault.getRequest(0)).status).to.equal(1);
      expect(await vault.userBalance(userA.address)).to.equal(usdc(1000) - usdc(75));
    });

    it("a different user cannot approve or reject someone else's request", async () => {
      const { userA, userB, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend");

      await expect(vault.connect(userB).approveRequest(0, usdc(75))).to.be.revertedWith("not your agent");
      await expect(vault.connect(userB).rejectRequest(0)).to.be.revertedWith("not your agent");
    });

    it("the owning user can approve at a reduced amount", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend");

      const before = await token.balanceOf(recipientX.address);
      await vault.connect(userA).approveRequest(0, usdc(40));

      expect(await token.balanceOf(recipientX.address)).to.equal(before + usdc(40));
      expect(await vault.userBalance(userA.address)).to.equal(usdc(1000) - usdc(40));
    });

    it("rejects approving above the originally requested amount", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend");

      await expect(vault.connect(userA).approveRequest(0, usdc(76))).to.be.revertedWith("invalid finalAmount");
    });

    it("owner can reject a pending request", async () => {
      const { userA, agentA1, recipientX, token, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend");

      const before = await token.balanceOf(recipientX.address);
      await expect(vault.connect(userA).rejectRequest(0)).to.emit(vault, "RequestRejected").withArgs(0);

      expect((await vault.getRequest(0)).status).to.equal(2);
      expect(await token.balanceOf(recipientX.address)).to.equal(before);
    });

    it("cannot approve or reject a request twice", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(100), approvalThreshold: usdc(50) }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(agentA1).spend(recipientX.address, usdc(75), "big legit spend");
      await vault.connect(userA).approveRequest(0, usdc(75));

      await expect(vault.connect(userA).approveRequest(0, usdc(75))).to.be.revertedWith("not pending");
      await expect(vault.connect(userA).rejectRequest(0)).to.be.revertedWith("not pending");
    });

    it("approvalThreshold=0 means every spend auto-executes (no queue)", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(agentA1.address, defaultPolicy({ perTxCap: usdc(1000), dailyCap: usdc(1000), approvalThreshold: 0n }));
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(900), "large but auto")).to.emit(
        vault,
        "SpendExecuted"
      );
    });
  });

  describe("circuit breaker (per user)", () => {
    it("auto-pauses only the tripping user's agents, not other users", async () => {
      const { userA, userB, agentA1, agentB1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(1000));
      await vault.connect(userB).deposit(usdc(1000));
      await vault
        .connect(userA)
        .registerAgent(
          agentA1.address,
          defaultPolicy({ perTxCap: usdc(1000), dailyCap: usdc(1000), approvalThreshold: 0n })
        );
      await vault
        .connect(userB)
        .registerAgent(
          agentB1.address,
          defaultPolicy({ perTxCap: usdc(1000), dailyCap: usdc(1000), approvalThreshold: 0n })
        );
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);
      await vault.connect(userB).setRecipient(agentB1.address, recipientX.address, true);
      await vault.connect(userA).setVelocityCap(usdc(100));

      await vault.connect(agentA1).spend(recipientX.address, usdc(80), "under cap");
      expect(await vault.userPaused(userA.address)).to.equal(false);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(50), "trips breaker"))
        .to.emit(vault, "CircuitBreakerTripped")
        .withArgs(userA.address, usdc(80), usdc(100))
        .and.to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(50), "trips breaker", "circuit breaker tripped");

      expect(await vault.userPaused(userA.address)).to.equal(true);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "userA still paused"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(1), "userA still paused", "vault paused");

      // userB was never touched by userA's circuit breaker trip.
      expect(await vault.userPaused(userB.address)).to.equal(false);
      await expect(vault.connect(agentB1).spend(recipientX.address, usdc(500), "userB unaffected")).to.emit(
        vault,
        "SpendExecuted"
      );

      await vault.connect(userA).setPaused(false);
      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "works again")).to.emit(
        vault,
        "SpendExecuted"
      );
    });

    it("userVelocityCap=0 disables that user's circuit breaker", async () => {
      const { userA, agentA1, recipientX, vault } = await deployFixture();
      await vault.connect(userA).deposit(usdc(100000));
      await vault
        .connect(userA)
        .registerAgent(
          agentA1.address,
          defaultPolicy({ perTxCap: usdc(100000), dailyCap: usdc(100000), approvalThreshold: 0n })
        );
      await vault.connect(userA).setRecipient(agentA1.address, recipientX.address, true);

      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(9999), "huge but breaker off")).to.emit(
        vault,
        "SpendExecuted"
      );
    });
  });

  describe("unregistered / inactive agents", () => {
    it("blocks spend from an address that was never registered", async () => {
      const { agentA1, recipientX, vault } = await deployFixture();
      await expect(vault.connect(agentA1).spend(recipientX.address, usdc(1), "ghost agent"))
        .to.emit(vault, "SpendBlocked")
        .withArgs(agentA1.address, recipientX.address, usdc(1), "ghost agent", "agent not active");
    });
  });
});
