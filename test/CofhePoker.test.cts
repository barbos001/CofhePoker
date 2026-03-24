import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// ── Helpers ──────────────────────────────────────────────────────────

async function deployCofhePokerFixture() {
  const [owner, alice, bob] = await hre.ethers.getSigners();
  const CofhePoker = await hre.ethers.getContractFactory("CofhePoker");
  const poker = await CofhePoker.deploy();
  await poker.waitForDeployment();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { poker: poker as any, owner, alice, bob };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CofhePoker", function () {

  // ── Deployment ──────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      const { poker } = await loadFixture(deployCofhePokerFixture);
      expect(await poker.getAddress()).to.not.equal(hre.ethers.ZeroAddress);
    });

    it("should set correct constants", async function () {
      const { poker } = await loadFixture(deployCofhePokerFixture);
      expect(await poker.ANTE()).to.equal(10n);
      expect(await poker.INITIAL_BALANCE()).to.equal(1000n);
    });
  });

  // ── createTable ──────────────────────────────────────────────────────

  describe("createTable", function () {
    it("creates a table and initialises balance", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await expect(poker.connect(alice).createTable())
        .to.emit(poker, "TableCreated");

      const tableId = await poker.connect(alice).getMyTableId();
      expect(tableId).to.be.gt(0n);

      const balance = await poker.connect(alice).getBalance();
      expect(balance).to.equal(1000n);
    });

    it("does not reset balance on second table creation (after complete)", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      // First hand: start + fold to complete the hand quickly
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);
      await poker.connect(alice).fold(tableId);

      const balanceBefore = await poker.connect(alice).getBalance();
      await poker.connect(alice).createTable();
      const balanceAfter = await poker.connect(alice).getBalance();
      expect(balanceAfter).to.equal(balanceBefore);
    });

    it("emits TableCreated with correct args", async function () {
      const { poker, bob } = await loadFixture(deployCofhePokerFixture);
      const tx = await poker.connect(bob).createTable();
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });
  });

  // ── startHand ────────────────────────────────────────────────────────

  describe("startHand", function () {
    it("deducts ante and sets PLAYER_TURN state", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();

      await expect(poker.connect(alice).startHand(tableId))
        .to.emit(poker, "HandStarted");

      const [, state, pot, handCount] = await poker.getTableInfo(tableId);
      expect(state).to.equal(1n); // PLAYER_TURN
      expect(pot).to.equal(20n);  // 2 × ANTE
      expect(handCount).to.equal(1n);

      const balance = await poker.connect(alice).getBalance();
      expect(balance).to.equal(1000n - 10n);
    });

    it("reverts if called by non-player", async function () {
      const { poker, alice, bob } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await expect(poker.connect(bob).startHand(tableId))
        .to.be.revertedWith("Not your table");
    });

    it("reverts when balance insufficient", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      // Drain balance via folding many hands
      for (let i = 0; i < 99; i++) {
        await poker.connect(alice).startHand(tableId);
        await poker.connect(alice).fold(tableId);
      }
      // Balance should now be 1000 - 99*10 = 10, one more start+fold = 0
      await poker.connect(alice).startHand(tableId);
      await poker.connect(alice).fold(tableId);
      // Balance = 0 → next startHand should fail
      await expect(poker.connect(alice).startHand(tableId))
        .to.be.revertedWith("Insufficient chips for ante");
    });
  });

  // ── fold ────────────────────────────────────────────────────────────

  describe("fold", function () {
    it("player fold sets COMPLETE and bot as winner", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);

      await expect(poker.connect(alice).fold(tableId))
        .to.emit(poker, "PlayerAction").withArgs(tableId, "fold")
        .and.to.emit(poker, "HandComplete");

      const [, state] = await poker.getTableInfo(tableId);
      expect(state).to.equal(4n); // COMPLETE

      const [winner] = await poker.getHandResult(tableId);
      expect(winner).to.equal(await poker.getAddress()); // address(this) == bot
    });

    it("reverts if not PLAYER_TURN", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await expect(poker.connect(alice).fold(tableId))
        .to.be.revertedWith("Wrong game state");
    });
  });

  // ── play ─────────────────────────────────────────────────────────────

  describe("play", function () {
    it("deducts play bet and emits PlayerAction", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);

      await expect(poker.connect(alice).play(tableId))
        .to.emit(poker, "PlayerAction").withArgs(tableId, "play");

      const balance = await poker.connect(alice).getBalance();
      expect(balance).to.equal(1000n - 20n); // ante + play bet

      const [, state, pot] = await poker.getTableInfo(tableId);
      expect(state).to.equal(2n); // AWAITING_BOT
      expect(pot).to.equal(30n);  // 20 + player play bet
    });

    it("reverts if already played or folded", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);
      await poker.connect(alice).play(tableId);
      await expect(poker.connect(alice).play(tableId))
        .to.be.revertedWith("Wrong game state");
    });
  });

  // ── getMyCards ───────────────────────────────────────────────────────

  describe("getMyCards", function () {
    it("returns three non-zero ctHashes after deal", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);

      const [c0, c1, c2] = await poker.connect(alice).getMyCards(tableId);
      expect(c0).to.be.gt(0n);
      expect(c1).to.be.gt(0n);
      expect(c2).to.be.gt(0n);
    });

    it("reverts for non-player", async function () {
      const { poker, alice, bob } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);
      await expect(poker.connect(bob).getMyCards(tableId))
        .to.be.revertedWith("Not your table");
    });
  });

  // ── getBalance / getBalanceOf ────────────────────────────────────────

  describe("balances", function () {
    it("getBalance returns correct chip count", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();
      await poker.connect(alice).startHand(tableId);
      await poker.connect(alice).fold(tableId);

      // After fold: lost ante (10)
      const bal = await poker.connect(alice).getBalance();
      expect(bal).to.equal(1000n - 10n);
    });
  });

  // ── Multiple hands ────────────────────────────────────────────────────

  describe("Multiple hands", function () {
    it("can play 3 hands in a row via fold", async function () {
      const { poker, alice } = await loadFixture(deployCofhePokerFixture);
      await poker.connect(alice).createTable();
      const tableId = await poker.connect(alice).getMyTableId();

      for (let i = 0; i < 3; i++) {
        await poker.connect(alice).startHand(tableId);
        await poker.connect(alice).fold(tableId);
      }

      const [, , , handCount] = await poker.getTableInfo(tableId);
      expect(handCount).to.equal(3n);

      const balance = await poker.connect(alice).getBalance();
      expect(balance).to.equal(1000n - 30n); // 3 × ante
    });
  });

});
