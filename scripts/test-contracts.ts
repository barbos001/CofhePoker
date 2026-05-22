/**
 * test-contracts.ts — End-to-end on-chain test for ALL CipherPoker contracts.
 *
 * Uses two private keys from .env to simulate two players.
 * Runs real transactions on Sepolia testnet.
 *
 * Usage:  npx tsx scripts/test-contracts.ts
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const PK1 = (process.env.PRIVATE_KEY  || '0x882ce473512a99a2b70d7b6760935f6ccb8578013d1f21ddd3fc2fdb9ecf00f4') as `0x${string}`;
const PK2 = (process.env.PRIVATE_KEY_2 || '0x6027105be4a32c3625352f6513ae4fe7184ae6b44c7c4fe11ea67109b99bde77') as `0x${string}`;

const CONTRACTS = {
  pve3Card:    '0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470' as Address,
  holdemPvE:   '0xA01aDb97b1D1ad67a4295B8Ae0c525Affd74CEBe' as Address,
  pvp3Card:    '0x76627a7A86C4Da6386f09b52cc8EC14C5EaC247d' as Address,
  holdemPvP:   '0x309Dd767C98eb52C84ff44389A2066385b9C27e9' as Address,
  vault:       '0x78F7519411AaE1d2679E054690d46F8B1C441a19' as Address,
  usdt:        '0x5da0E971D78ae43604073fB67887b440fE6CA19b' as Address,
};

const ETH_TOKEN = '0x0000000000000000000000000000000000000000' as Address;

// ═══════════════════════════════════════════════════════════════════════════════
// ABIs (minimal — only the functions we test)
// ═══════════════════════════════════════════════════════════════════════════════

const PVE_3CARD_ABI = [
  { name: 'ANTE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'INITIAL_BALANCE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'FAUCET_THRESHOLD', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'addr', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getMyTableId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getTableInfo', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }] },
  { name: 'getMyCards', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { name: 'tableOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'claimFaucet', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'createTable', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'startHand', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'play', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'fold', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;

const HOLDEM_PVE_ABI = [
  { name: 'SB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'BB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'BET_SIZE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'INITIAL_BALANCE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getMyTableId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getTableInfo', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'bool' }] },
  { name: 'getMyCards', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { name: 'getCommunityCards', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { name: 'tableOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'createTable', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'startHand', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'actPreflop', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'fold', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'callBot', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'isBotPfReady', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'resolveBotPreFlop', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;

const PVP_3CARD_ABI = [
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'addr', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getMySeat', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getOpenTableCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getOpenTables', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
  { name: 'getPvPTableInfo', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }] },
  { name: 'balances', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'seatOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getFriends', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'address[]' }] },
  { name: 'isFriend', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'createPvPTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'bool' }], outputs: [{ type: 'uint256' }] },
  { name: 'joinTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'leaveTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'startPvPHand', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'pvpAct', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'bool' }], outputs: [] },
  { name: 'sendFriendRequest', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [] },
  { name: 'acceptFriendRequest', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [] },
  { name: 'removeFriend', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [] },
] as const;

const HOLDEM_PVP_ABI = [
  { name: 'SB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'BB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'BET_SIZE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'MIN_BUY_IN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'MAX_BUY_IN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'INITIAL_BALANCE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getMySeat', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getOpenTableCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getOpenTables', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
  { name: 'getTableInfo', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'address' }] },
  { name: 'getMyCards', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { name: 'getCommunityCards', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { name: 'getResult', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'uint256' }] },
  { name: 'getBettingState', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'bool' }, { type: 'uint8' }, { type: 'uint256' }] },
  { name: 'isShowdownReady', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'createTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'bool' }], outputs: [{ type: 'uint256' }] },
  { name: 'joinTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'leaveTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'startHand', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'act', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'fold', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'checkTimeout', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'computeShowdown', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP1', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP2', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'resolveShowdown', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;

const VAULT_ABI = [
  { name: 'ETH_TOKEN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'MAX_RAKE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'USDT', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'priceFeed', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'getEthUsdPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'isPriceStale', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'getFreeBalance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getLockedBalance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'usdToEthWei', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'depositETH', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'depositUSDT', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
] as const;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  mag:    '\x1b[35m',
  dim:    '\x1b[2m',
};

const log    = (tag: string, color: string, ...args: unknown[]) => console.log(`${color}${C.bold}[${tag}]${C.reset}`, ...args);
const ok     = (tag: string, ...args: unknown[]) => log(tag, C.green, '✓', ...args);
const fail   = (tag: string, ...args: unknown[]) => log(tag, C.red,   '✗', ...args);
const info   = (tag: string, ...args: unknown[]) => log(tag, C.cyan,  ...args);
const warn   = (tag: string, ...args: unknown[]) => log(tag, C.yellow, ...args);
const header = (title: string) => console.log(`\n${C.mag}${C.bold}${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}${C.reset}\n`);
const sub    = (title: string) => console.log(`${C.cyan}── ${title} ──${C.reset}`);

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const errors: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    ok('TEST', name);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    fail('TEST', `${name} — ${msg.slice(0, 200)}`);
    errors.push(`${name}: ${msg.slice(0, 300)}`);
  }
}

async function sendTx(
  tag: string,
  wallet: WalletClient,
  pub: PublicClient,
  args: Parameters<typeof wallet.writeContract>[0],
): Promise<Hash> {
  info(tag, `${String(args.functionName)}() → sending…`);
  const t0 = performance.now();
  const hash = await wallet.writeContract(args);
  info(tag, `  tx: ${hash.slice(0, 14)}… — waiting for receipt…`);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const ms = (performance.now() - t0).toFixed(0);
  if (receipt.status === 'success') {
    ok(tag, `${String(args.functionName)}() confirmed in ${ms}ms, gas: ${receipt.gasUsed}`);
  } else {
    fail(tag, `${String(args.functionName)}() REVERTED in ${ms}ms`);
    throw new Error(`TX reverted: ${String(args.functionName)}`);
  }
  return hash;
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  header('CipherPoker — On-Chain Test Suite (Sepolia)');

  // ── Setup ──
  const account1 = privateKeyToAccount(PK1);
  const account2 = privateKeyToAccount(PK2);
  info('SETUP', `Player 1: ${account1.address}`);
  info('SETUP', `Player 2: ${account2.address}`);
  info('SETUP', `RPC: ${RPC}`);

  const transport = http(RPC);

  const pub = createPublicClient({ chain: sepolia, transport });

  const w1 = createWalletClient({ account: account1, chain: sepolia, transport });
  const w2 = createWalletClient({ account: account2, chain: sepolia, transport });

  // ── Check ETH balances ──
  sub('Checking ETH balances');
  const [eth1, eth2] = await Promise.all([
    pub.getBalance({ address: account1.address }),
    pub.getBalance({ address: account2.address }),
  ]);
  info('ETH', `P1: ${formatEther(eth1)} ETH`);
  info('ETH', `P2: ${formatEther(eth2)} ETH`);

  if (eth1 < parseEther('0.001')) { warn('ETH', 'P1 has very low ETH — TXs may fail!'); }
  if (eth2 < parseEther('0.001')) { warn('ETH', 'P2 has very low ETH — TXs may fail!'); }

  // ── Check contract bytecode exists ──
  sub('Verifying contracts are deployed');
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    const code = await pub.getCode({ address: addr });
    if (code && code !== '0x') {
      ok('DEPLOY', `${name} @ ${truncAddr(addr)} — ${code.length / 2 - 1} bytes`);
    } else {
      fail('DEPLOY', `${name} @ ${truncAddr(addr)} — NO CODE!`);
    }
  }


  // ═════════════════════════════════════════════════════════════════════════════
  // 1. VAULT
  // ═════════════════════════════════════════════════════════════════════════════
  header('1. VAULT CONTRACT');

  await test('Vault: read constants', async () => {
    const [ethToken, maxRake, usdt, feed, price, stale, paused, owner] = await Promise.all([
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'ETH_TOKEN' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'MAX_RAKE' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'USDT' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'priceFeed' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getEthUsdPrice' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'isPriceStale' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'paused' }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'owner' }),
    ]);
    info('VAULT', `ETH_TOKEN: ${ethToken}`);
    info('VAULT', `USDT:      ${usdt}`);
    info('VAULT', `MAX_RAKE:  ${maxRake}`);
    info('VAULT', `PriceFeed: ${feed}`);
    info('VAULT', `ETH/USD:   $${(Number(price) / 1e18).toFixed(2)}`);
    info('VAULT', `Stale:     ${stale}`);
    info('VAULT', `Paused:    ${paused}`);
    info('VAULT', `Owner:     ${truncAddr(owner as string)}`);
  });

  await test('Vault: read P1 balances', async () => {
    const [ethFree, ethLocked] = await Promise.all([
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getFreeBalance', args: [account1.address, ETH_TOKEN] }),
      pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getLockedBalance', args: [account1.address, ETH_TOKEN] }),
    ]);
    info('VAULT', `P1 ETH free:   ${formatEther(ethFree as bigint)} ETH`);
    info('VAULT', `P1 ETH locked: ${formatEther(ethLocked as bigint)} ETH`);
  });

  await test('Vault: depositETH (0.0001 ETH)', async () => {
    const before = await pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getFreeBalance', args: [account1.address, ETH_TOKEN] }) as bigint;
    await sendTx('VAULT', w1, pub, {
      address: CONTRACTS.vault, abi: VAULT_ABI,
      functionName: 'depositETH', value: parseEther('0.0001'),
    });
    const after = await pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getFreeBalance', args: [account1.address, ETH_TOKEN] }) as bigint;
    info('VAULT', `Balance: ${formatEther(before)} → ${formatEther(after)} ETH`);
    if (after <= before) throw new Error('Balance did not increase');
  });

  await test('Vault: withdraw ETH (0.0001 ETH)', async () => {
    const before = await pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getFreeBalance', args: [account1.address, ETH_TOKEN] }) as bigint;
    await sendTx('VAULT', w1, pub, {
      address: CONTRACTS.vault, abi: VAULT_ABI,
      functionName: 'withdraw', args: [ETH_TOKEN, parseEther('0.0001')],
    });
    const after = await pub.readContract({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: 'getFreeBalance', args: [account1.address, ETH_TOKEN] }) as bigint;
    info('VAULT', `Balance: ${formatEther(before)} → ${formatEther(after)} ETH`);
  });

  await test('Vault: USDT balanceOf + check', async () => {
    const usdtBal = await pub.readContract({ address: CONTRACTS.usdt, abi: ERC20_ABI, functionName: 'balanceOf', args: [account1.address] }) as bigint;
    info('VAULT', `P1 USDT balance: ${Number(usdtBal) / 1e6} USDT`);
  });


  // ═════════════════════════════════════════════════════════════════════════════
  // 2. PVE 3-CARD POKER
  // ═════════════════════════════════════════════════════════════════════════════
  header('2. PVE 3-CARD POKER');

  await test('PvE 3-Card: read constants', async () => {
    const [ante, initBal, faucet] = await Promise.all([
      pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'ANTE' }),
      pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'INITIAL_BALANCE' }),
      pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'FAUCET_THRESHOLD' }),
    ]);
    info('3CARD', `ANTE: ${ante}  INITIAL_BALANCE: ${initBal}  FAUCET_THRESHOLD: ${faucet}`);
  });

  await test('PvE 3-Card: read P1 balance + table', async () => {
    const [bal, tid, balOf] = await Promise.all([
      pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getBalance', account: account1.address }),
      pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getMyTableId', account: account1.address }),
      pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getBalanceOf', args: [account1.address] }),
    ]);
    info('3CARD', `P1 balance: ${bal} (via getBalanceOf: ${balOf})`);
    info('3CARD', `P1 tableId: ${tid}`);
  });

  // Try to cleanup leftover seat
  let pve3TableId = 0n;
  await test('PvE 3-Card: ensure clean state (leave table if seated)', async () => {
    const tid = await pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'tableOf', args: [account1.address] }) as bigint;
    if (tid > 0n) {
      info('3CARD', `P1 still on table ${tid} — folding to clean up`);
      try {
        await sendTx('3CARD', w1, pub, { address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'fold', args: [tid] });
      } catch { /* may already be in correct state */ }
    }
  });

  await test('PvE 3-Card: createTable + startHand', async () => {
    await sendTx('3CARD', w1, pub, {
      address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI,
      functionName: 'createTable',
    });
    const tid = await pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getMyTableId', account: account1.address }) as bigint;
    pve3TableId = tid;
    info('3CARD', `Created table ${tid}`);

    await sendTx('3CARD', w1, pub, {
      address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI,
      functionName: 'startHand', args: [tid],
    });

    const tInfo = await pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getTableInfo', args: [tid] }) as [string, number, bigint, bigint];
    info('3CARD', `Table state: ${tInfo[1]}  pot: ${tInfo[2]}  hands: ${tInfo[3]}`);
  });

  await test('PvE 3-Card: read encrypted cards', async () => {
    if (pve3TableId === 0n) throw new Error('No table');
    const cards = await pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getMyCards', args: [pve3TableId], account: account1.address }) as [bigint, bigint, bigint];
    info('3CARD', `Card ctHashes: [${cards[0].toString().slice(0, 10)}…, ${cards[1].toString().slice(0, 10)}…, ${cards[2].toString().slice(0, 10)}…]`);
    if (cards[0] === 0n && cards[1] === 0n && cards[2] === 0n) warn('3CARD', 'All card hashes are 0 — FHE may not be ready yet');
  });

  await test('PvE 3-Card: fold (clean up)', async () => {
    if (pve3TableId === 0n) throw new Error('No table');
    await sendTx('3CARD', w1, pub, {
      address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI,
      functionName: 'fold', args: [pve3TableId],
    });
    const bal = await pub.readContract({ address: CONTRACTS.pve3Card, abi: PVE_3CARD_ABI, functionName: 'getBalance', account: account1.address }) as bigint;
    info('3CARD', `Balance after fold: ${bal}`);
  });


  // ═════════════════════════════════════════════════════════════════════════════
  // 3. HOLDEM PVE
  // ═════════════════════════════════════════════════════════════════════════════
  header('3. HOLDEM PVE');

  await test('Holdem PvE: read constants', async () => {
    const [sb, bb, betSize, initBal] = await Promise.all([
      pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'SB' }),
      pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'BB' }),
      pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'BET_SIZE' }),
      pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'INITIAL_BALANCE' }),
    ]);
    info('HOLDEM', `SB: ${sb}  BB: ${bb}  BET_SIZE: ${betSize}  INITIAL_BALANCE: ${initBal}`);
  });

  let holdemTableId = 0n;
  await test('Holdem PvE: ensure clean state', async () => {
    const tid = await pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'tableOf', args: [account1.address] }) as bigint;
    if (tid > 0n) {
      info('HOLDEM', `P1 still on table ${tid} — folding`);
      try {
        await sendTx('HOLDEM', w1, pub, { address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'fold', args: [tid] });
      } catch { /* */ }
    }
  });

  await test('Holdem PvE: createTable + startHand', async () => {
    await sendTx('HOLDEM', w1, pub, {
      address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI,
      functionName: 'createTable',
    });
    const tid = await pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'getMyTableId', account: account1.address }) as bigint;
    holdemTableId = tid;
    info('HOLDEM', `Created table ${tid}`);

    await sendTx('HOLDEM', w1, pub, {
      address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI,
      functionName: 'startHand', args: [tid],
    });

    const tInfo = await pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'getTableInfo', args: [tid] }) as [string, number, bigint, bigint, boolean, boolean];
    info('HOLDEM', `State: ${tInfo[1]}  pot: ${tInfo[2]}  hands: ${tInfo[3]}  waitingForCall: ${tInfo[4]}  playerBet: ${tInfo[5]}`);
  });

  await test('Holdem PvE: read hole cards + community', async () => {
    if (holdemTableId === 0n) throw new Error('No table');
    const [cards, comm] = await Promise.all([
      pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'getMyCards', args: [holdemTableId], account: account1.address }),
      pub.readContract({ address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI, functionName: 'getCommunityCards', args: [holdemTableId], account: account1.address }),
    ]);
    const c = cards as [bigint, bigint];
    const cm = comm as [bigint, bigint, bigint, bigint, bigint];
    info('HOLDEM', `Hole cards: [${c[0].toString().slice(0, 10)}…, ${c[1].toString().slice(0, 10)}…]`);
    info('HOLDEM', `Community: [${cm.map(x => x.toString().slice(0, 8) + '…').join(', ')}]`);
  });

  await test('Holdem PvE: fold (clean up)', async () => {
    if (holdemTableId === 0n) throw new Error('No table');
    await sendTx('HOLDEM', w1, pub, {
      address: CONTRACTS.holdemPvE, abi: HOLDEM_PVE_ABI,
      functionName: 'fold', args: [holdemTableId],
    });
  });


  // ═════════════════════════════════════════════════════════════════════════════
  // 4. PVP 3-CARD POKER
  // ═════════════════════════════════════════════════════════════════════════════
  header('4. PVP 3-CARD POKER');

  await test('PvP 3-Card: read balances', async () => {
    const [b1, b2] = await Promise.all([
      pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'balances', args: [account1.address] }),
      pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'balances', args: [account2.address] }),
    ]);
    info('PVP3', `P1 balance: ${b1}  P2 balance: ${b2}`);
  });

  // Clean up any leftover seats
  await test('PvP 3-Card: clean up leftover seats', async () => {
    const [s1, s2] = await Promise.all([
      pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'seatOf', args: [account1.address] }) as Promise<bigint>,
      pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'seatOf', args: [account2.address] }) as Promise<bigint>,
    ]);
    if (s1 > 0n) {
      info('PVP3', `P1 still on table ${s1} — leaving`);
      try { await sendTx('PVP3', w1, pub, { address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'leaveTable', args: [s1] }); } catch { /* */ }
    }
    if (s2 > 0n) {
      info('PVP3', `P2 still on table ${s2} — leaving`);
      try { await sendTx('PVP3', w2, pub, { address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'leaveTable', args: [s2] }); } catch { /* */ }
    }
  });

  await test('PvP 3-Card: lobby (getOpenTableCount + getOpenTables)', async () => {
    const count = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getOpenTableCount' }) as bigint;
    info('PVP3', `Open tables: ${count}`);
    if (count > 0n) {
      const tables = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getOpenTables', args: [0n, count > 10n ? 10n : count] }) as bigint[];
      info('PVP3', `Table IDs: [${tables.join(', ')}]`);
    }
  });

  let pvp3TableId = 0n;
  await test('PvP 3-Card: P1 createTable + P2 joinTable', async () => {
    await sendTx('PVP3', w1, pub, {
      address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI,
      functionName: 'createPvPTable', args: [20n, false],
    });
    const s1 = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'seatOf', args: [account1.address] }) as bigint;
    pvp3TableId = s1;
    info('PVP3', `P1 created table ${pvp3TableId}`);

    const tInfo = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getPvPTableInfo', args: [pvp3TableId] }) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
    info('PVP3', `Table: P1=${truncAddr(tInfo[0])} P2=${truncAddr(tInfo[1])} state=${tInfo[2]} pot=${tInfo[3]} buyIn=${tInfo[5]}`);

    await sendTx('PVP3', w2, pub, {
      address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI,
      functionName: 'joinTable', args: [pvp3TableId],
    });
    ok('PVP3', 'P2 joined the table');
  });

  await test('PvP 3-Card: startPvPHand', async () => {
    if (pvp3TableId === 0n) throw new Error('No table');
    await sendTx('PVP3', w1, pub, {
      address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI,
      functionName: 'startPvPHand', args: [pvp3TableId],
    });
    const tInfo = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getPvPTableInfo', args: [pvp3TableId] }) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
    info('PVP3', `After startHand — state: ${tInfo[2]}  pot: ${tInfo[3]}`);
  });

  await test('PvP 3-Card: both players fold', async () => {
    if (pvp3TableId === 0n) throw new Error('No table');
    // Wait for cards to be generated (state >= ACTING = 3)
    info('PVP3', 'Waiting for card generation (FHE)…');
    for (let i = 0; i < 30; i++) {
      const tInfo = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getPvPTableInfo', args: [pvp3TableId] }) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
      if (tInfo[2] >= 3) { // ACTING
        ok('PVP3', `Cards ready (state=${tInfo[2]})`);
        break;
      }
      if (i === 29) warn('PVP3', 'Timed out waiting for card gen');
      await sleep(3000);
    }

    // Both fold
    await sendTx('PVP3', w1, pub, {
      address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI,
      functionName: 'pvpAct', args: [pvp3TableId, false], // fold
    });
    await sendTx('PVP3', w2, pub, {
      address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI,
      functionName: 'pvpAct', args: [pvp3TableId, false], // fold
    });

    const tInfo = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getPvPTableInfo', args: [pvp3TableId] }) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
    info('PVP3', `After both fold — state: ${tInfo[2]}  pot: ${tInfo[3]}`);
  });

  await test('PvP 3-Card: friends system', async () => {
    const friends1 = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'getFriends', args: [account1.address] }) as string[];
    info('PVP3', `P1 friends: ${friends1.length === 0 ? 'none' : friends1.map(truncAddr).join(', ')}`);

    const isFriend = await pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'isFriend', args: [account1.address, account2.address] }) as boolean;
    info('PVP3', `P1 ↔ P2 friends: ${isFriend}`);

    if (!isFriend) {
      try {
        await sendTx('PVP3', w1, pub, { address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'sendFriendRequest', args: [account2.address] });
        await sendTx('PVP3', w2, pub, { address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'acceptFriendRequest', args: [account1.address] });
        ok('PVP3', 'Friend request sent + accepted');
      } catch (e) {
        warn('PVP3', `Friend system: ${(e as Error).message.slice(0, 100)}`);
      }
    }
  });

  // Clean up PvP seats
  await test('PvP 3-Card: leave tables', async () => {
    const [s1, s2] = await Promise.all([
      pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'seatOf', args: [account1.address] }) as Promise<bigint>,
      pub.readContract({ address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'seatOf', args: [account2.address] }) as Promise<bigint>,
    ]);
    if (s1 > 0n) await sendTx('PVP3', w1, pub, { address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'leaveTable', args: [s1] });
    if (s2 > 0n) await sendTx('PVP3', w2, pub, { address: CONTRACTS.pvp3Card, abi: PVP_3CARD_ABI, functionName: 'leaveTable', args: [s2] });
    ok('PVP3', 'Cleaned up seats');
  });


  // ═════════════════════════════════════════════════════════════════════════════
  // 5. HOLDEM PVP
  // ═════════════════════════════════════════════════════════════════════════════
  header('5. HOLDEM PVP');

  await test('Holdem PvP: read constants', async () => {
    const [sb, bb, betSize, minBuy, maxBuy, initBal] = await Promise.all([
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'SB' }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'BB' }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'BET_SIZE' }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'MIN_BUY_IN' }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'MAX_BUY_IN' }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'INITIAL_BALANCE' }),
    ]);
    info('H-PVP', `SB: ${sb}  BB: ${bb}  BET: ${betSize}  MIN_BUY: ${minBuy}  MAX_BUY: ${maxBuy}  INIT: ${initBal}`);
  });

  await test('Holdem PvP: read balances + seats', async () => {
    const [b1, b2, s1, s2] = await Promise.all([
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getBalanceOf', args: [account1.address] }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getBalanceOf', args: [account2.address] }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account1.address }),
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account2.address }),
    ]);
    info('H-PVP', `P1 balance: ${b1}  seat: ${s1}`);
    info('H-PVP', `P2 balance: ${b2}  seat: ${s2}`);
  });

  // Clean up leftover seats
  await test('Holdem PvP: clean up leftover seats', async () => {
    const [s1, s2] = await Promise.all([
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account1.address }) as Promise<bigint>,
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account2.address }) as Promise<bigint>,
    ]);
    if (s1 > 0n) {
      info('H-PVP', `P1 on table ${s1} — attempting leave`);
      try { await sendTx('H-PVP', w1, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'fold', args: [s1] }); } catch { /* */ }
      try { await sendTx('H-PVP', w1, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'leaveTable', args: [s1] }); } catch { /* */ }
    }
    if (s2 > 0n) {
      info('H-PVP', `P2 on table ${s2} — attempting leave`);
      try { await sendTx('H-PVP', w2, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'fold', args: [s2] }); } catch { /* */ }
      try { await sendTx('H-PVP', w2, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'leaveTable', args: [s2] }); } catch { /* */ }
    }
  });

  await test('Holdem PvP: lobby', async () => {
    const count = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getOpenTableCount' }) as bigint;
    info('H-PVP', `Open tables: ${count}`);
    if (count > 0n) {
      const tables = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getOpenTables', args: [0n, count > 10n ? 10n : count] }) as bigint[];
      info('H-PVP', `Table IDs: [${tables.join(', ')}]`);
    }
  });

  let hpvpTableId = 0n;
  await test('Holdem PvP: P1 createTable + P2 joinTable', async () => {
    await sendTx('H-PVP', w1, pub, {
      address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI,
      functionName: 'createTable', args: [25n, false],
    });
    const s1 = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account1.address }) as bigint;
    hpvpTableId = s1;
    info('H-PVP', `P1 created table ${hpvpTableId}`);

    await sendTx('H-PVP', w2, pub, {
      address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI,
      functionName: 'joinTable', args: [hpvpTableId],
    });
    ok('H-PVP', 'P2 joined');

    const tInfo = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getTableInfo', args: [hpvpTableId] }) as [string, string, number, bigint, bigint, bigint, boolean, string];
    info('H-PVP', `Table: P1=${truncAddr(tInfo[0])} P2=${truncAddr(tInfo[1])} state=${tInfo[2]} pot=${tInfo[3]} buyIn=${tInfo[5]}`);
  });

  await test('Holdem PvP: startHand', async () => {
    if (hpvpTableId === 0n) throw new Error('No table');
    await sendTx('H-PVP', w1, pub, {
      address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI,
      functionName: 'startHand', args: [hpvpTableId],
    });

    // Wait for PREFLOP state
    info('H-PVP', 'Waiting for preflop (FHE card gen)…');
    for (let i = 0; i < 30; i++) {
      const tInfo = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getTableInfo', args: [hpvpTableId] }) as [string, string, number, bigint, bigint, bigint, boolean, string];
      if (tInfo[2] >= 2) { // PREFLOP
        ok('H-PVP', `Cards ready (state=${tInfo[2]}), nextToAct=${truncAddr(tInfo[7])}`);
        break;
      }
      if (i === 29) warn('H-PVP', 'Timed out waiting for preflop');
      await sleep(3000);
    }
  });

  await test('Holdem PvP: both players fold (quick game)', async () => {
    if (hpvpTableId === 0n) throw new Error('No table');

    const tInfo = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getTableInfo', args: [hpvpTableId] }) as [string, string, number, bigint, bigint, bigint, boolean, string];
    const nextToAct = tInfo[7].toLowerCase();

    // Whoever needs to act first folds
    if (nextToAct === account1.address.toLowerCase()) {
      await sendTx('H-PVP', w1, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'fold', args: [hpvpTableId] });
    } else {
      await sendTx('H-PVP', w2, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'fold', args: [hpvpTableId] });
    }

    const tInfo2 = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getTableInfo', args: [hpvpTableId] }) as [string, string, number, bigint, bigint, bigint, boolean, string];
    info('H-PVP', `After fold — state: ${tInfo2[2]}  pot: ${tInfo2[3]}`);

    if (tInfo2[2] === 7) { // COMPLETE
      const result = await pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getResult', args: [hpvpTableId] }) as [string, bigint];
      info('H-PVP', `Winner: ${truncAddr(result[0])}  pot: ${result[1]}`);
    }
  });

  // Clean up
  await test('Holdem PvP: leave tables', async () => {
    const [s1, s2] = await Promise.all([
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account1.address }) as Promise<bigint>,
      pub.readContract({ address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'getMySeat', account: account2.address }) as Promise<bigint>,
    ]);
    if (s1 > 0n) {
      try { await sendTx('H-PVP', w1, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'leaveTable', args: [s1] }); } catch { /* */ }
    }
    if (s2 > 0n) {
      try { await sendTx('H-PVP', w2, pub, { address: CONTRACTS.holdemPvP, abi: HOLDEM_PVP_ABI, functionName: 'leaveTable', args: [s2] }); } catch { /* */ }
    }
  });


  // ═════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════════════════════
  header('TEST SUMMARY');
  console.log(`  ${C.green}${C.bold}Passed: ${passed}${C.reset}`);
  console.log(`  ${C.red}${C.bold}Failed: ${failed}${C.reset}`);

  if (errors.length > 0) {
    console.log(`\n${C.red}Errors:${C.reset}`);
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}


// ── Run ──
main().catch(err => {
  console.error(`\n${C.red}${C.bold}FATAL:${C.reset}`, err);
  process.exit(2);
});
