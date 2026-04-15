/**
 * Vault.test.cts — full-cycle integration tests for the Vault contract.
 *
 * Covers:
 *   v ETH deposit -> lock -> settle -> withdraw (win + loss scenarios)
 *   v USDT deposit -> lock -> settle -> withdraw (win + loss scenarios)
 *   v Zero-sum invariant enforcement
 *   v Rake (2%) distribution
 *   v Pause / unpause -- deposits/locks blocked, withdraw always works
 *   v Non-custodial: owner cannot access user funds
 *   v Revert on insufficient balance
 *   v Revert on unsupported token
 *   v Price staleness flag (1-hour threshold)
 *   v getEthUsdPrice reads from Chainlink-compatible MockOracle (8-dec -> 18-dec)
 *   v setPriceImmediate updates MockOracle price
 */

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect }            from 'chai';
import hre                   from 'hardhat';

// --- Constants ----------------------------------------------------------------

// MockOracle stores price in 8-decimal format (matching Chainlink ETH/USD feeds).
// e.g. $3 000.00 = 300_000_000_00 (3000 * 10^8)
const INITIAL_PRICE_8DEC = 300_000_000_00n; // 3000e8

// Vault.getEthUsdPrice() multiplies 8-dec answer by 1e10 -> 18-dec
const INITIAL_ETH_USD = INITIAL_PRICE_8DEC * 10n ** 10n; // 3000e18

const ETH_TOKEN        = '0x0000000000000000000000000000000000000000';
const ANTE_USD         = hre.ethers.parseUnits('10', 18); // $10 ante in 18-dec USD
// $10 at $3000/ETH = 0.003333... ETH
const ANTE_ETH         = (ANTE_USD * hre.ethers.parseUnits('1', 18)) / INITIAL_ETH_USD;
const ANTE_USDT        = ANTE_USD / BigInt(1e12); // $10 -> 10_000_000 (6-dec USDT)

const RAKE_BPS         = 200n; // 2%

// --- Fixture -----------------------------------------------------------------

async function deployVaultFixture() {
  const [owner, player1, player2, poker, rakeWallet] =
    await hre.ethers.getSigners();

  // MockUSDT
  const MockUSDT = await hre.ethers.getContractFactory('MockUSDT');
  const usdt: any = await MockUSDT.deploy();
  const usdtAddr  = await usdt.getAddress();

  // MockOracle -- Chainlink-compatible, stores price in 8-decimal format
  const MockOracle = await hre.ethers.getContractFactory('MockOracle');
  const mockOracle: any = await MockOracle.deploy(INITIAL_PRICE_8DEC);
  const mockOracleAddr  = await mockOracle.getAddress();

  // Vault -- reads price live from priceFeed (MockOracle)
  const Vault      = await hre.ethers.getContractFactory('Vault');
  const vault: any = await Vault.deploy(usdtAddr, mockOracleAddr);
  const vaultAddr  = await vault.getAddress();

  // Authorize the mock poker contract (poker signer acts as the PokerTable)
  await vault.connect(owner).setPokerAuthorized(poker.address, true);

  // Mint USDT to players for testing
  const USDT_MINT = hre.ethers.parseUnits('10000', 6); // 10 000 USDT
  await usdt.mint(player1.address, USDT_MINT);
  await usdt.mint(player2.address, USDT_MINT);

  return {
    vault, vaultAddr, usdt, usdtAddr, mockOracle, mockOracleAddr,
    owner, player1, player2, poker, rakeWallet,
  };
}

// --- Helpers -----------------------------------------------------------------

/** Deposit ETH to vault on behalf of player. */
async function depositETH(vault: any, player: any, ethAmount: bigint) {
  return vault.connect(player).depositETH({ value: ethAmount });
}

/** Deposit USDT to vault (approve + deposit). */
async function depositUSDT(vault: any, usdt: any, player: any, amount: bigint, vaultAddr: string) {
  await usdt.connect(player).approve(vaultAddr, amount);
  return vault.connect(player).depositUSDT(amount);
}

// --- Test suites -------------------------------------------------------------

describe('Vault — deployment', () => {
  it('sets correct constructor values', async () => {
    const { vault, usdtAddr, mockOracleAddr } = await loadFixture(deployVaultFixture);
    expect(await vault.USDT()).to.equal(usdtAddr);
    expect(await vault.priceFeed()).to.equal(mockOracleAddr);
    expect(await vault.MAX_RAKE()).to.equal(500n);
  });

  it('getEthUsdPrice returns 18-decimal price from MockOracle', async () => {
    const { vault } = await loadFixture(deployVaultFixture);
    // MockOracle stores 3000e8; Vault scales to 3000e18
    const price = await vault.getEthUsdPrice();
    expect(price).to.equal(INITIAL_ETH_USD);
  });

  it('owner is set correctly, not zero', async () => {
    const { vault, owner } = await loadFixture(deployVaultFixture);
    expect(await vault.owner()).to.equal(owner.address);
  });

  it('poker contract is authorized after setPokerAuthorized', async () => {
    const { vault, poker } = await loadFixture(deployVaultFixture);
    expect(await vault.authorizedPoker(poker.address)).to.be.true;
  });
});

// -----------------------------------------------------------------------------

describe('Vault — ETH deposit & withdraw', () => {
  it('depositETH credits balance and emits Deposit', async () => {
    const { vault, player1 } = await loadFixture(deployVaultFixture);
    const amount = hre.ethers.parseEther('0.5');

    await expect(depositETH(vault, player1, amount))
      .to.emit(vault, 'Deposit')
      .withArgs(player1.address, ETH_TOKEN, amount);

    expect(await vault.getFreeBalance(player1.address, ETH_TOKEN)).to.equal(amount);
  });

  it('plain ETH transfer (receive) also credits balance', async () => {
    const { vault, vaultAddr, player1 } = await loadFixture(deployVaultFixture);
    const amount = hre.ethers.parseEther('0.1');
    await player1.sendTransaction({ to: vaultAddr, value: amount });
    expect(await vault.getFreeBalance(player1.address, ETH_TOKEN)).to.equal(amount);
  });

  it('withdraw returns ETH and decrements balance', async () => {
    const { vault, player1 } = await loadFixture(deployVaultFixture);
    const dep = hre.ethers.parseEther('1');
    await depositETH(vault, player1, dep);

    const half = dep / 2n;
    await expect(vault.connect(player1).withdraw(ETH_TOKEN, half))
      .to.emit(vault, 'Withdraw')
      .withArgs(player1.address, ETH_TOKEN, half);

    expect(await vault.getFreeBalance(player1.address, ETH_TOKEN)).to.equal(dep - half);
  });

  it('reverts withdraw when amount > free balance', async () => {
    const { vault, player1 } = await loadFixture(deployVaultFixture);
    await depositETH(vault, player1, hre.ethers.parseEther('0.01'));
    await expect(
      vault.connect(player1).withdraw(ETH_TOKEN, hre.ethers.parseEther('1'))
    ).to.be.revertedWith('Vault: insufficient free balance');
  });

  it('reverts withdraw on unsupported token', async () => {
    const { vault, player1, player2 } = await loadFixture(deployVaultFixture);
    await expect(
      vault.connect(player1).withdraw(player2.address, 1n)
    ).to.be.revertedWith('Vault: unsupported token');
  });
});

// -----------------------------------------------------------------------------

describe('Vault — USDT deposit & withdraw', () => {
  it('depositUSDT requires approve, credits balance', async () => {
    const { vault, vaultAddr, usdt, usdtAddr, player1 } = await loadFixture(deployVaultFixture);
    const amount = hre.ethers.parseUnits('100', 6);

    await expect(depositUSDT(vault, usdt, player1, amount, vaultAddr))
      .to.emit(vault, 'Deposit')
      .withArgs(player1.address, usdtAddr, amount);

    expect(await vault.getFreeBalance(player1.address, usdtAddr)).to.equal(amount);
  });

  it('depositUSDT reverts without prior approve', async () => {
    const { vault, player1 } = await loadFixture(deployVaultFixture);
    await expect(
      vault.connect(player1).depositUSDT(100n)
    ).to.be.revertedWith('Vault: ERC20 transferFrom failed');
  });

  it('withdraw USDT returns tokens', async () => {
    const { vault, vaultAddr, usdt, usdtAddr, player1 } = await loadFixture(deployVaultFixture);
    const amount = hre.ethers.parseUnits('50', 6);
    await depositUSDT(vault, usdt, player1, amount, vaultAddr);

    const before = await usdt.balanceOf(player1.address);
    await vault.connect(player1).withdraw(usdtAddr, amount);
    const after  = await usdt.balanceOf(player1.address);

    expect(after - before).to.equal(amount);
    expect(await vault.getFreeBalance(player1.address, usdtAddr)).to.equal(0n);
  });
});

// -----------------------------------------------------------------------------

describe('Vault — ETH: full cycle (deposit -> lock -> settle -> withdraw)', () => {
  async function setupTwoPlayers() {
    const fix = await loadFixture(deployVaultFixture);
    const DEP = hre.ethers.parseEther('1');
    await depositETH(fix.vault, fix.player1, DEP);
    await depositETH(fix.vault, fix.player2, DEP);
    return { ...fix, DEP };
  }

  it('lockForGame moves funds to locked balance and emits Locked', async () => {
    const { vault, player1, poker } = await setupTwoPlayers();

    await expect(vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN))
      .to.emit(vault, 'Locked')
      .withArgs(player1.address, ETH_TOKEN, ANTE_ETH);

    expect(await vault.getFreeBalance(player1.address, ETH_TOKEN))
      .to.be.closeTo(hre.ethers.parseEther('1') - ANTE_ETH, 10n);
    expect(await vault.getLockedBalance(player1.address, ETH_TOKEN))
      .to.be.closeTo(ANTE_ETH, 10n);
  });

  it('lockForGame reverts if free balance insufficient', async () => {
    const { vault, player1, poker } = await loadFixture(deployVaultFixture);
    await depositETH(vault, player1, hre.ethers.parseEther('0.001')); // far less than ante
    await expect(
      vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN)
    ).to.be.revertedWith('Vault: insufficient balance - deposit more');
  });

  it('lockForGame reverts for non-authorized caller', async () => {
    const { vault, player1, player2 } = await setupTwoPlayers();
    await expect(
      vault.connect(player2).lockForGame(player1.address, ANTE_USD, ETH_TOKEN)
    ).to.be.revertedWith('Vault: caller not authorized poker contract');
  });

  it('settleGame: player1 wins, zero-sum, no rake', async () => {
    const { vault, player1, player2, poker } = await setupTwoPlayers();

    // Both players bet the ante
    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN);
    await vault.connect(poker).lockForGame(player2.address, ANTE_USD, ETH_TOKEN);

    const p1FreeBefore = await vault.getFreeBalance(player1.address, ETH_TOKEN);
    const p2FreeBefore = await vault.getFreeBalance(player2.address, ETH_TOKEN);

    // player1 wins $10, player2 loses $10 -- zero-sum
    await expect(vault.connect(poker).settleGame(
      [player1.address, player2.address],
      [ANTE_USD, -ANTE_USD],
      ETH_TOKEN,
      hre.ethers.ZeroAddress,
      0n,
    )).to.emit(vault, 'GameSettled');

    const p1FreeAfter = await vault.getFreeBalance(player1.address, ETH_TOKEN);
    const p2FreeAfter = await vault.getFreeBalance(player2.address, ETH_TOKEN);

    // player1: got back their lock + won player2's lock -> +2xANTE_ETH net
    expect(p1FreeAfter - p1FreeBefore).to.be.closeTo(ANTE_ETH * 2n, 100n);
    // player2: lost their lock -> 0 net
    expect(p2FreeAfter).to.equal(p2FreeBefore);
    // Locked balances zeroed
    expect(await vault.getLockedBalance(player1.address, ETH_TOKEN)).to.equal(0n);
    expect(await vault.getLockedBalance(player2.address, ETH_TOKEN)).to.equal(0n);
  });

  it('settleGame: player1 loses, can withdraw remaining balance', async () => {
    const { vault, player1, player2, poker } = await setupTwoPlayers();
    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN);
    await vault.connect(poker).lockForGame(player2.address, ANTE_USD, ETH_TOKEN);

    // player1 loses
    await vault.connect(poker).settleGame(
      [player1.address, player2.address],
      [-ANTE_USD, ANTE_USD],
      ETH_TOKEN, hre.ethers.ZeroAddress, 0n,
    );

    // player1 can still withdraw their remaining free balance (1 ETH - ante)
    const free = await vault.getFreeBalance(player1.address, ETH_TOKEN);
    expect(free).to.be.closeTo(hre.ethers.parseEther('1') - ANTE_ETH, 100n);
    await expect(vault.connect(player1).withdraw(ETH_TOKEN, free))
      .to.not.be.reverted;
  });

  it('settleGame: 2% rake distributed to rakeWallet', async () => {
    const { vault, player1, player2, poker, rakeWallet } = await setupTwoPlayers();

    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN);
    await vault.connect(poker).lockForGame(player2.address, ANTE_USD, ETH_TOKEN);

    const totalLocked = ANTE_ETH * 2n;
    const expectedRake = (totalLocked * 200n) / 10_000n; // 2%

    const rakeBalBefore = await hre.ethers.provider.getBalance(rakeWallet.address);

    // sum(deltas) < 0 by the rake amount
    const rakeUSD = (ANTE_USD * 2n * 200n) / 10_000n;
    await vault.connect(poker).settleGame(
      [player1.address, player2.address],
      [ANTE_USD - rakeUSD, -ANTE_USD],
      ETH_TOKEN,
      rakeWallet.address,
      200n,
    );

    const rakeBalAfter = await hre.ethers.provider.getBalance(rakeWallet.address);
    expect(rakeBalAfter - rakeBalBefore).to.be.closeTo(expectedRake, 1000n);
  });

  it('settleGame reverts if delta sum is positive (fund creation)', async () => {
    const { vault, player1, player2, poker } = await setupTwoPlayers();
    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN);
    await vault.connect(poker).lockForGame(player2.address, ANTE_USD, ETH_TOKEN);

    await expect(vault.connect(poker).settleGame(
      [player1.address, player2.address],
      [ANTE_USD * 2n, ANTE_USD], // positive sum -- more out than in
      ETH_TOKEN, hre.ethers.ZeroAddress, 0n,
    )).to.be.revertedWith('Vault: delta sum positive - funds created from nowhere');
  });

  it('settleGame reverts if rake exceeds 5%', async () => {
    const { vault, player1, poker } = await setupTwoPlayers();
    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN);
    await expect(vault.connect(poker).settleGame(
      [player1.address], [-ANTE_USD],
      ETH_TOKEN, hre.ethers.ZeroAddress, 600n, // 6% > MAX_RAKE
    )).to.be.revertedWith('Vault: rake exceeds 5%');
  });
});

// -----------------------------------------------------------------------------

describe('Vault — USDT: full cycle', () => {
  async function setupUSDT() {
    const fix = await loadFixture(deployVaultFixture);
    const DEP = hre.ethers.parseUnits('100', 6); // 100 USDT
    await depositUSDT(fix.vault, fix.usdt, fix.player1, DEP, fix.vaultAddr);
    await depositUSDT(fix.vault, fix.usdt, fix.player2, DEP, fix.vaultAddr);
    return { ...fix, DEP };
  }

  it('lock + settle + withdraw (USDT, player2 wins)', async () => {
    const { vault, usdt, usdtAddr, player1, player2, poker } = await setupUSDT();

    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, usdtAddr);
    await vault.connect(poker).lockForGame(player2.address, ANTE_USD, usdtAddr);

    const p2Before = await usdt.balanceOf(player2.address);

    // player2 wins
    await vault.connect(poker).settleGame(
      [player1.address, player2.address],
      [-ANTE_USD, ANTE_USD],
      usdtAddr, hre.ethers.ZeroAddress, 0n,
    );

    // player2 withdraws winnings
    const free = await vault.getFreeBalance(player2.address, usdtAddr);
    expect(free).to.be.closeTo(hre.ethers.parseUnits('100', 6) + ANTE_USDT, 10n);
    await vault.connect(player2).withdraw(usdtAddr, free);
    const p2After = await usdt.balanceOf(player2.address);
    expect(p2After - p2Before).to.equal(free);
  });
});

// -----------------------------------------------------------------------------

describe('Vault — Pause / unpause', () => {
  it('pause blocks depositETH', async () => {
    const { vault, owner, player1 } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).pause();
    await expect(
      depositETH(vault, player1, hre.ethers.parseEther('0.1'))
    ).to.be.revertedWith('Vault: paused');
  });

  it('pause blocks lockForGame', async () => {
    const { vault, owner, player1, poker } = await loadFixture(deployVaultFixture);
    await depositETH(vault, player1, hre.ethers.parseEther('1'));
    await vault.connect(owner).pause();
    await expect(
      vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN)
    ).to.be.revertedWith('Vault: paused');
  });

  it('withdraw still works when paused (non-custodial guarantee)', async () => {
    const { vault, owner, player1 } = await loadFixture(deployVaultFixture);
    const dep = hre.ethers.parseEther('0.5');
    await depositETH(vault, player1, dep);
    await vault.connect(owner).pause();
    // Must not revert
    await expect(vault.connect(player1).withdraw(ETH_TOKEN, dep)).to.not.be.reverted;
  });

  it('unpause re-enables deposits', async () => {
    const { vault, owner, player1 } = await loadFixture(deployVaultFixture);
    await vault.connect(owner).pause();
    await vault.connect(owner).unpause();
    await expect(depositETH(vault, player1, hre.ethers.parseEther('0.1'))).to.not.be.reverted;
  });

  it('non-owner cannot pause', async () => {
    const { vault, player1 } = await loadFixture(deployVaultFixture);
    await expect(vault.connect(player1).pause()).to.be.revertedWith('Vault: not owner');
  });
});

// -----------------------------------------------------------------------------

describe('Vault — Non-custodial guarantee', () => {
  it('owner cannot withdraw user funds directly', async () => {
    const { vault, owner, player1 } = await loadFixture(deployVaultFixture);
    await depositETH(vault, player1, hre.ethers.parseEther('1'));

    // Owner calling withdraw on behalf of themselves -- will fail because
    // owner.address has zero vault balance
    await expect(
      vault.connect(owner).withdraw(ETH_TOKEN, hre.ethers.parseEther('1'))
    ).to.be.revertedWith('Vault: insufficient free balance');
  });

  it('setPokerAuthorized cannot move user funds directly', async () => {
    const { vault, player1, poker } = await loadFixture(deployVaultFixture);
    await depositETH(vault, player1, hre.ethers.parseEther('1'));

    // Authorized poker contract calls lockForGame -- can only lock player's OWN funds
    await vault.connect(poker).lockForGame(player1.address, ANTE_USD, ETH_TOKEN);
    // poker signer's own vault balance is still 0
    expect(await vault.getFreeBalance(poker.address, ETH_TOKEN)).to.equal(0n);
  });
});

// -----------------------------------------------------------------------------

describe('Vault — Price feed (Chainlink via MockOracle)', () => {
  it('getEthUsdPrice reads and scales 8-dec -> 18-dec correctly', async () => {
    const { vault } = await loadFixture(deployVaultFixture);
    expect(await vault.getEthUsdPrice()).to.equal(INITIAL_ETH_USD);
  });

  it('getEthUsdPrice reflects MockOracle price update', async () => {
    const { vault, mockOracle, owner } = await loadFixture(deployVaultFixture);
    const newPrice8Dec = 400_000_000_00n; // $4 000 in 8-dec
    await mockOracle.connect(owner).setPriceImmediate(newPrice8Dec);
    expect(await vault.getEthUsdPrice()).to.equal(newPrice8Dec * 10n ** 10n);
  });

  it('isPriceStale returns false initially', async () => {
    const { vault } = await loadFixture(deployVaultFixture);
    expect(await vault.isPriceStale()).to.be.false;
  });

  it('isPriceStale returns true after 1-hour PRICE_STALENESS', async () => {
    const { vault, mockOracle, owner } = await loadFixture(deployVaultFixture);
    // Set updatedAt to > 1 hour ago
    const staleTs = (await time.latest()) - 3601;
    await mockOracle.connect(owner).setUpdatedAt(staleTs);
    expect(await vault.isPriceStale()).to.be.true;
  });

  it('getEthUsdPrice reverts when price is stale', async () => {
    const { vault, mockOracle, owner } = await loadFixture(deployVaultFixture);
    const staleTs = (await time.latest()) - 3601;
    await mockOracle.connect(owner).setUpdatedAt(staleTs);
    await expect(vault.getEthUsdPrice()).to.be.revertedWith('Vault: price feed stale');
  });

  it('usdToEthWei converts correctly at $3000/ETH', async () => {
    const { vault } = await loadFixture(deployVaultFixture);
    // $10 at $3000/ETH = 0.00333... ETH = 3_333_333_333_333_333 wei
    const result = await vault.usdToEthWei(ANTE_USD);
    expect(result).to.be.closeTo(ANTE_ETH, 10n);
  });

  it('usdToUsdt converts correctly (18-dec -> 6-dec)', async () => {
    const { vault } = await loadFixture(deployVaultFixture);
    const result = await vault.usdToUsdt(ANTE_USD);
    expect(result).to.equal(ANTE_USDT); // $10 -> 10_000_000 (6-dec)
  });
});

// -----------------------------------------------------------------------------

describe('MockOracle — price management', () => {
  it('setPriceImmediate updates price and emits PriceSet', async () => {
    const { mockOracle, owner } = await loadFixture(deployVaultFixture);
    const newPrice = 500_000_000_00n; // $5 000 in 8-dec

    await expect(
      mockOracle.connect(owner).setPriceImmediate(newPrice)
    ).to.emit(mockOracle, 'PriceSet');

    expect(await mockOracle.price()).to.equal(newPrice);
  });

  it('non-owner cannot call setPriceImmediate', async () => {
    const { mockOracle, player1 } = await loadFixture(deployVaultFixture);
    await expect(
      mockOracle.connect(player1).setPriceImmediate(100_000_000_00n)
    ).to.be.revertedWith('MockOracle: not owner');
  });

  it('latestRoundData returns 8-decimal answer', async () => {
    const { mockOracle } = await loadFixture(deployVaultFixture);
    const [, answer, , updatedAt] = await mockOracle.latestRoundData();
    expect(answer).to.equal(INITIAL_PRICE_8DEC);
    expect(updatedAt).to.be.gt(0n);
  });
});
