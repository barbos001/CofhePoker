# Contracts — Deploy & Connect Guide

## Deployed contracts (Ethereum Sepolia)

| Contract | Address | Description |
|---|---|---|
| `CofhePoker` | `0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470` | 3-Card vs Bot |
| `CofhePokerPvP` | `0x76627a7A86C4Da6386f09b52cc8EC14C5EaC247d` | 3-Card PvP |
| `CofheHoldem` | `0xA01aDb97b1D1ad67a4295B8Ae0c525Affd74CEBe` | Hold'em vs Bot |
| `CofheHoldemPvP` | `0x309Dd767C98eb52C84ff44389A2066385b9C27e9` | Hold'em PvP |
| `Vault` | `0x78F7519411AaE1d2679E054690d46F8B1C441a19` | ETH+USDT vault |

## Redeploying

```bash
# 1. Fill .env (copy from .env.example)
cp .env.example .env

# 2. Compile
npm run compile

# 3. Deploy individual contracts
npx hardhat run scripts/deploy.cts         --network eth-sepolia   # 3-Card
npx hardhat run scripts/deployHoldem.cts   --network eth-sepolia   # Hold'em
npx hardhat run scripts/deployPvP.cts      --network eth-sepolia   # PvP
npx hardhat run scripts/deployVault.cts    --network eth-sepolia   # Vault
```

Each script auto-updates `VITE_*_CONTRACT_ADDRESS` in `.env`.

## Connecting a new contract to the frontend

1. Add ABI to `src/config/contractXxx.ts`
2. Export the address as `VITE_XXX_CONTRACT_ADDRESS` from `.env`
3. Implement `GameAdapter` from `src/adapters/GameAdapter.ts`
4. Wire the adapter into the relevant hook (`useGameActions.ts` or similar)

## Contract ABIs

ABIs live in `src/config/`:
- `contract.ts` — 3-Card Poker
- `contractPvP.ts` — 3-Card PvP
- `contractHoldem.ts` — Hold'em Bot
- `contractHoldemPvP.ts` — Hold'em PvP
- `vault.ts` — Vault

## FHE notes

- All encrypted card values use `euint64` internally
- FHE.decrypt is two-phase: request → poll `isXxxReady()` → resolve
- Players need an EIP-712 permit (handled by `useCofhe.ts`) to decrypt their own cards
- Community cards are decrypted via `decryptPublicCard` (no permit needed after `allowPublic()`)
