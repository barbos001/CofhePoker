# CipherPoker — Конкурентний аналіз і план розвитку (Wave 5)

> Документ підготовано 2026-05-22 для **Fhenix Privacy-by-Design dApp Buildathon** (AKINDO).
> Мета: розібрати конкурентів і переможців хакатонів, знайти слабкі місця CipherPoker і скласти
> сфокусований план фінального спринту, який підвищує шанс на перемогу.

---

## 1. Контекст хакатону

**Fhenix Privacy-by-Design dApp Buildathon** — це не вікендовий хакатон, а програма-марафон з
$50 000 грантів і повторюваними хвилями (білд 10 днів → оцінка 4 дні).

**Де ми зараз:**

| Подія | Дати | Алокація |
|---|---|---|
| Wave 4 — оцінка | 20–23 трав | — |
| **Wave 5 (фінал) — білд** | **23 трав → 1 черв** | — |
| **Фінальна оцінка** | **1–5 черв** | **$45 000 (фінальний розподіл)** |

Сьогодні **22 травня** — фактично канун фінального спринту. $45 000 розподіляється **лише на Wave 5**
за **ретроактивною оцінкою всієї програми**.

**Як оцінюють (критерії суддів):**
- Прогрес між сабмішенами (не один знімок, а траєкторія).
- Якість реалізації — **особливо інтеграція Fhenix/FHE**.
- Докази використання, тестування, adoption.
- Чіткість продуктового напрямку та виконання.

**Треки застосувань:** Confidential DeFi · Private Payments · Confidential Governance ·
RWA & Compliance · Privacy-Preserving AI · **Encrypted Gaming** (hidden information, private
player actions, provably fair outcomes — це наш трек, плюс частково Confidential DeFi).

**Висновок для нас:** перемога вирішується якістю FHE-інтеграції + доказами використання.
План Wave 5 має бити саме в ці дві осі.

---

## 2. Профіль CipherPoker (стисло)

**Що це.** Повністю on-chain покер, де значення карт зашифровані FHE протягом усієї гри.
Блокчейн сам є дилером — генерація карт, оцінка рук і визначення переможця відбуваються on-chain.

**Технічна вага:**
- **6 контрактів на Ethereum Sepolia**, 3 437 рядків Solidity.
- 4 режими: 3-Card і Texas Hold'em, кожен у PvE (vs бот) і PvP (heads-up).
- ~80 FHE-операцій на роздачу в 3-Card, **~700 FHE-операцій на showdown** у Hold'em PvP (~35M газу — близько до ліміту блоку Sepolia).
- CoFHE SDK v0.5.2: euint64 для всього, EIP-712 permit для дешифрування, `decryptForView` через threshold-мережу.
- Бекенд Supabase (лідерборд, чат, історія рук), PWA, Web Audio, спектатор-режим, друзі on-chain, Elo, headless-бот.

**Сильні сторони:** найважча FHE-інтеграція в категорії (реальний покерний движок на ciphertext,
а не «зашифрувати число й розшифрувати»); 6 задеплоєних контрактів; реальний бекенд; полірований UX.

**Слабкі місця (детально — у секції 5):** ставки/пот/стек **не зашифровані**; heads-up only;
бот слабкий на turn/river; можлива cross-group колізія карт; mock-дані в Admin Dashboard;
немає юніт-тестів; мало доказів реального використання.

---

## 3. Аналіз конкурентів — кожен проєкт окремо

### 3.1. On-chain покер і mental poker

#### dpinones/mental-poker (Starknet)
- **Ідея.** Повністю trustless мультиплеєрний Texas Hold'em на ZK-доказах, що генеруються в браузері й верифікуються on-chain. Без дилера й сервера.
- **Логіка.** Exponential ElGamal на кривій Grumpkin (нативна крива Noir). Кожен гравець реєструє ElGamal-ключ → контракт агрегує (`APK = pk₁+…+pkₙ`). Колода шифрується APK; кожен гравець послідовно тасує+ре-шифрує всю колоду з ZK-доказом валідної перестановки. Reveal: інші гравці дають `reveal_token = sk·C1` з ZK-доказом, лише власник карти може зняти маску.
- **Фічі.** 3 Noir-схеми (key ownership, card decryption, 52-card shuffle); Cairo-контракти; Garaga-верифікатори; TypeScript SDK для браузерного proving; робочий мультиплеєр-UI.
- **Killer feature.** Grumpkin: EC-операції — нативні інструкції Noir, тож доказ тасування колоди — лише 928 ACIR-опкодів (vs десятки тисяч на не-нативних кривих).
- **Переваги.** Повністю on-chain; proving у браузері без бекенду; кожна дія підкріплена доказом; timeout-механізм; live-демо.
- **Недоліки.** ~11 с на тасування на гравця (помітна латентність); потрібен локальний Garaga-сервер для повного деплою (на live-сайті лише лоббі/ставки); лише Starknet; гравець мусить бути онлайн для reveal-токенів.
- **Лінк.** https://github.com/dpinones/mental-poker · демо https://mental-poker.vercel.app

#### KaranSinghBisht/Pokerstarks (Starknet) — **головний прямий конкурент**
- **Ідея.** 2–6 гравців, повністю on-chain Texas Hold'em на Starknet з mental poker, ElGamal-шифруванням, **Tongo (confidential token) для прихованих балансів фішок** і Dojo ECS для стану гри.
- **Логіка.** ElGamal на Grumpkin (як dpinones) + Noir/Barretenberg/Garaga для shuffle-доказів. Hole-карти дешифруються лише на клієнті reveal-токенами. **Балансы фішок зашифровані через Tongo — суперник не бачить розмір стеку, лише факт «у грі».**
- **Фічі.** Повні раунди ставок 2–6 гравців; ZK shuffle-докази; Dojo ECS (композовність); Tongo; Torii-індексер; Cartridge Controller (gasless); Privy/StarkZap (соцлогін); **Elo-матчмейкінг і Arena (реєстрація агентів)**.
- **Killer feature.** **Tongo — приховані стеки фішок on-chain.** Додає стратегічну глибину: не можна читати суперника лише за розміром стеку.
- **Переваги.** Композовність (Dojo ECS); сучасний UI; gasless; соц-онбординг; live на Sepolia.
- **Недоліки.** Повна ZK-гра потребує локального Garaga-сервера; ~11 с латентності на тасування; лише Starknet; Tongo додає складності; мала база користувачів.
- **Лінк.** https://github.com/KaranSinghBisht/Pokerstarks · демо https://pokerstarks.vercel.app

> **Чому це важливо для нас:** Pokerstarks **уже вирішив проблему, яку CipherPoker ще ні** —
> приховування стеку фішок. Це наш найгостріший конкурентний розрив.

#### HiddenHand (Solana, Inco Lightning FHE)
- **Ідея.** Повний Texas Hold'em з криптографічною приватністю на Solana.
- **Логіка.** MagicBlock VRF для provably-fair тасування → всі карти шифруються Inco Lightning FHE → Ed25519-підписи верифікують автентичність карт при reveal.
- **Killer feature.** Багатошарова приватність: VRF + FHE + Ed25519.
- **Переваги.** Provably-fair shuffle; 42 юніт-тести; чітка архітектура; on-chain історія рук.
- **Недоліки.** Лише Solana devnet; залежність від MagicBlock VRF-оракула.
- **Лінк.** https://github.com/HiddenHandPoker/HiddenHand

#### Zama Encrypted Poker (reference implementation)
- **Ідея.** On-chain Texas Hold'em з зашифрованими hole-картами на Zama fhEVM.
- **Логіка.** Hole-карти — `euint8`; сила руки рахується на ciphertext як `euint16`-сума; переможець — порівнянням зашифрованих сил. Стани: WaitingForPlayers → CardsDealt → BettingRound → Showdown → Finished.
- **Killer feature.** Hole-карти ніколи не дешифруються on-chain; усі порівняння гомоморфні.
- **Переваги.** Офіційний референс; правильні ACL-патерни; демонструє складну стейт-машину.
- **Недоліки.** **Спрощена оцінка руки (сума, а не реальний покерний ранг)**; лише 2 гравці; немає community-карт.
- **Лінк.** https://necips-organization-1.gitbook.io/fhevm-example-factory/gaming/encrypted-poker

> **Перевага CipherPoker:** наш движок робить **справжню** оцінку руки на ciphertext
> (пари через 21 `FHE.eq`, флеш через 28 `FHE.eq`, стрейт через зашифроване сортування) —
> референс Zama цього не вміє.

#### SkyCasino (Zama fhEVM)
- **Ідея.** «Перше повністю trustless казино»: Blackjack, CoinFlip, Poker (спрощений), у планах Roulette/Baccarat/Slots.
- **Killer feature.** «Zero Trust Required» — чесність гарантує математика, а не оператор.
- **Переваги.** Кілька ігор; продуктовий UI; реальні ставки ETH.
- **Недоліки.** Оцінка покерної руки спрощена; лише Sepolia testnet; ігри в демо-стадії.
- **Лінк.** https://github.com/PhiBao/skycasino

#### Інші покерні проєкти (стисло)
| Проєкт | Чейн | Підхід / нотатки | Лінк |
|---|---|---|---|
| zkHoldem | Manta | zkShuffle (покращений Barnett-Smart), Groth16 shuffle-arg з константною верифікацією | https://zkholdem.xyz |
| PokerWithFhe | Fhenix | FHE + wrapped ERC20 (ETHDenver 2024) | https://github.com/rafa-canseco/PokerWithFhe |
| poZKer | Mina | Mental poker в o1js; інтеграція фронту неповна | https://github.com/tms7331/poZKer |
| Arcium Poker | Solana | MPC (Arcium) для shuffle/deal; 48/48 тестів | https://github.com/ANAVHEOBA/arcium_poker |
| CoinPoker / Virtue Poker / Polker | Multi | Централізований RNG або sidechain; токени; не приховують карти криптографічно | coinpoker.com · virtue.poker · polker.game |

### 3.2. Переможці хакатонів Fhenix

#### FHE-ZK Verifier — **1 місце «Best use of Fhenix Stack», ETHGlobal London 2024**
- **Ідея.** Поєднання FHE із zero-knowledge доказами для верифікованих зашифрованих обчислень on-chain.
- **Killer feature.** ZK-верифікація FHE-обчислень — гібрид двох парадигм приватності.
- **Урок для нас.** Судді Fhenix нагороджують **глибину інтеграції стеку**, а не широту фіч.
- **Лінк.** https://github.com/jordan-public/fhe-zk-verifier

#### Honest Auctions (ETHDenver 2024)
- **Ідея.** Privacy-preserving аукціон NFT — зашифровані ставки, reveal лише переможця.
- **Killer feature.** «Розпакування картки» — NFT відкривається лише після завершення аукціону.
- **Переваги.** Мультичейн; інтуїтивний UI; усуває FOMO й front-running ставок.
- **Недоліки.** Лише NFT; переможець стає публічним.
- **Лінк.** https://github.com/valeriofichera/Honest_Auctions

#### Sealed-Bid Auction with CoFHE — **офіційний референс Fhenix**
- **Ідея.** Sealed-bid аукціон NFT: усі ставки зашифровані end-to-end, переможець визначається на ciphertext.
- **Логіка.** `FHE.gt()` для визначення переможця; 2-крокове async-врегулювання (request → finalize); reveal через unsealing-permit; FHERC20-платежі; NFT-escrow.
- **Killer feature.** Повна приватність ставок + автоматизований async-decryption flow.
- **Недоліки.** Складний 2-кроковий UX врегулювання; латентність дешифрування.
- **Лінк.** https://github.com/FhenixProtocol/poc-sealed-bid-auction *(найкорисніший патерн для нашого Блоку A — зашифровані ставки + порівняння)*

#### Dark Forest FHE
- **Ідея.** Гра-дослідження космосу із зашифрованими позиціями планет і боями (сітка 128×128).
- **Killer feature.** Повне шифрування стану гри (позиції + результати боїв).
- **Недоліки.** Неповний (проблеми з фронтом на хакатоні); біль у DevEx.
- **Лінк.** https://github.com/hcheng826/fhenix-dark-forest

#### FUGAZI — перший on-chain dark pool (ETHOnline 2024)
- **Ідея.** Приватний децентралізований dark pool без зовнішнього оператора.
- **Логіка.** Баланси, резерви пулу, інфо ордерів (розмір+напрям) зашифровані FHE; FM-AMM (Fair Matching AMM) для batch-виконання; опційний шум для приватності при рідких трейдах.
- **Killer feature.** Перший справді децентралізований dark pool на FHE; захист від sandwich-атак через batching+шум.
- **Недоліки.** Латентність (очікування batch); додаткові комісії за «шум».
- **Лінк.** https://github.com/orakle-dark-pool/fugazi-final-ethonline2024

#### VeilShield (білдатон 2026)
- **Ідея.** Privacy-preserving vault/shield-контракт на CoFHE.
- **Сильні сторони.** Робочий задеплоєний продукт із верифікованими контрактами на Arbitrum Sepolia.
- **Недоліки.** Слабка ринкова диференціація.
- **Лінк.** https://github.com/Zhekinmaksim/VeilShield

### 3.3. FHE-ігри Zama / Inco (ширші конкуренти за трек Encrypted Gaming)

| Проєкт | Платформа | Ідея | Killer feature | Недоліки |
|---|---|---|---|---|
| **BlindBet** | Zama | Конфіденційний prediction market — зашифровані ставки й результати | End-to-end шифрування позицій/сум | Лише testnet; залежність від оракула |
| **Whot card game** | Zama | Децентралізована класична карткова гра Whot | Верифіковане on-chain тасування (TrustedShuffleService) | Незрозуміла adoption |
| **Lucky Spin FHE** | Zama | Колесо фортуни із зашифрованими нагородами | Шифровані результати + лідерборд | Залежність від backend-relayer |
| **FRAMED!** | Inco | Повністю on-chain Mafia із зашифрованими ролями (фіналіст ETHGlobal NYC) | Перша on-chain Mafia з повним шифруванням ролей | Комунікація гравців — off-chain |
| **Battleship** | Inco | Морський бій із зашифрованими дошками (`euint8[4][4]`) | Референс для складного зашифрованого стану | Маленькі дошки |
| **MincoMind** | Inco | On-chain Mastermind-турнір зі ставками | Лідерборд + призова механіка | Проста логіка |
| **Stealth Command** | Fhenix + Inco | Гра захисту міста із зашифрованою обороною | Порівняння FHE vs ZK на одній грі | Ігровий цикл не доведений; немає UI |

**Висновок по 3.3.** Більшість FHE-ігор — хакатон-прототипи зі **спрощеною логікою**. CipherPoker
вже перевершує їх глибиною (реальний покерний движок, 4 режими, бекенд). Але всі вони
**не лишають plaintext-значень взагалі** — а ми лишаємо ставки відкритими.

---

## 4. Mental poker vs FHE-підхід — і чому наш вибір виправданий

| Вимір | Mental Poker (ElGamal + ZK) | FHE-підхід (CipherPoker / CoFHE) |
|---|---|---|
| Принцип | Кілька шарів шифрування + комутативність | Один шар; операції зберігають шифрування |
| Тасування | Колаборативне, кожен гравець тасує (O(n) раундів) | Одне тасування / pre-encrypted, O(1) на дію |
| Латентність на дію | ~10–30 с (генерація ZK-доказу в браузері) | ~15–30 с (threshold-decrypt на testnet) |
| Газ на руку | ~50k–500k на тасування (feasible на mainnet) | 4M–35M+ (потрібен L2/rollup) |
| Децентралізація reveal | Криптографічна, без довіреної сторони | Залежить від threshold/KMS-мережі |
| Складність коду | Висока (багато раундів, доказів, round-trips) | Середня (керування зашифрованим станом) |
| Гнучкість гри | Будь-яка карткова гра | Складна оцінка руки можлива, але дорога по газу |
| Що цінує суддя Fhenix | — | **Frontier-tech; проста для аудиту логіка; новизна** |

**Висновок.** Mental poker (dpinones, Pokerstarks) — зрілий, але «me-too» підхід зі складним
протоколом і ~11 с латентності на тасування. FHE-підхід CipherPoker простіший для аудиту,
краще інтегрований з EVM і **точно відповідає тому, що оцінює журі Fhenix**. Наш вибір
правильний — треба лише закрити розрив у приватності ставок (див. секцію 5–7).

---

## 5. CipherPoker vs конкуренти — де ми слабші

| Аспект | CipherPoker зараз | Конкуренти | Розрив |
|---|---|---|---|
| **Карти зашифровані** | ✅ euint64, повний движок на ciphertext | Zama poker — спрощено; mental poker — ElGamal | **CipherPoker сильніший** |
| **Ставки зашифровані** | ❌ plaintext, slider «(indicative only)» | — | критичний розрив (трек FHE) |
| **Стек фішок прихований** | ❌ видно всім | **Pokerstarks ✅ (Tongo)** | **критичний розрив** |
| **Пот зашифрований** | ❌ plaintext | — | критичний розрив |
| Кількість гравців | heads-up (2) | Pokerstarks 2–6 | середній розрив |
| Оцінка руки | ✅ справжній покерний ранг | Zama/SkyCasino — сума | CipherPoker сильніший |
| Provably-fair RNG | `FHE.randomEuint64` (можлива cross-group колізія) | HiddenHand — VRF | малий розрив |
| Докази використання | мало on-chain активності, mock Admin Dashboard | Pokerstarks — Elo/Arena | середній розрив |
| Тести | E2E-скрипти на Sepolia, **немає юніт/компонент-тестів** | HiddenHand — 42 тести, Arcium — 48 | малий розрив |
| Чейн | Ethereum Sepolia | Starknet / Solana / Arbitrum | нейтрально |

**Головний висновок.** CipherPoker **технічно глибший** за майже всіх (реальний движок,
4 режими, бекенд). Але є **одна системна діра**: гра приватна **лише наполовину** —
карти зашифровані, а **ставки, пот і стек фішок видно у відкритому вигляді**. Суперник
читає твою стратегію за розміром бету й стеку. Pokerstarks цю проблему вже вирішив (Tongo).

Це і є **одна конкретна проблема**, навколо якої будується весь план Wave 5.

---

## 6. Корисні посилання

### Документація Fhenix / CoFHE
- Docs: https://docs.fhenix.io
- CoFHE docs (llms.txt, повний індекс): https://cofhe-docs.fhenix.zone/llms.txt
- Quick start: https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start
- Архітектура CoFHE: https://cofhe-docs.fhenix.zone/deep-dive/cofhe-components/overview
- Туторіал ACL / access control: https://docs.fhenix.io/tutorials/acl-usage-examples
- Gas & benchmarks: https://docs.fhenix.io/fhe-library/core-concepts/gas-and-benchmarks
- Cheat sheet: https://www.fhenix.io/cheat-sheet/

### SDK та бібліотеки
- cofhe-contracts (Solidity FHE): https://github.com/FhenixProtocol/cofhe-contracts
- cofhejs (TS/JS SDK): https://github.com/FhenixProtocol/cofhejs
- Hardhat plugin: https://github.com/FhenixProtocol/cofhe-hardhat-plugin
- Hardhat starter: https://github.com/fhenixprotocol/cofhe-hardhat-starter
- awesome-fhenix: https://github.com/FhenixProtocol/awesome-fhenix
- Neo — FHE AI Assistant: https://github.com/marronjo/fhe-assistant

### Референс-реалізації (найкорисніші для нашого плану)
- **Sealed-Bid Auction PoC** (патерн зашифрованих ставок + `FHE.gt`): https://github.com/FhenixProtocol/poc-sealed-bid-auction
- **FHERC20 confidential contracts** (патерн прихованих балансів): https://github.com/FhenixProtocol/fhenix-confidential-contracts

### Репозиторії конкурентів
- dpinones/mental-poker: https://github.com/dpinones/mental-poker
- Pokerstarks: https://github.com/KaranSinghBisht/Pokerstarks
- HiddenHand: https://github.com/HiddenHandPoker/HiddenHand
- Zama Encrypted Poker: https://necips-organization-1.gitbook.io/fhevm-example-factory/gaming/encrypted-poker
- SkyCasino: https://github.com/PhiBao/skycasino
- BlindBet: https://github.com/Gmin2/blindbet
- Whot card game: https://github.com/0xPr0f/card-game-interface
- FUGAZI dark pool: https://github.com/orakle-dark-pool/fugazi-final-ethonline2024
- FHE-ZK Verifier: https://github.com/jordan-public/fhe-zk-verifier
- Geometry mental-poker (Rust, Barnett-Smart): https://github.com/geometryresearch/mental-poker

### Research-папери
- dBFV (high-precision FHE): https://eprint.iacr.org/2025/2321
- Threshold Decryption Network: https://eprint.iacr.org/2025/1781
- Privacy taxonomy (Guy Zyskind): https://www.fhenix.io/blog/the-different-stages-of-privacy-a-taxonomy

### Тестнет / спільнота
- Faucet Sepolia: https://www.alchemy.com/faucets/ethereum-sepolia
- Telegram білдатону: https://t.me/+rA9gI3AsW8c3YzIx
- Discord Fhenix: https://discord.gg/fhenix

---

## 7. План розвитку — Wave 5 (23 трав → 1 черв)

### Одна конкретна проблема

> **CipherPoker довела, що карти можуть лишатися зашифрованими — але стіл досі протікає.**
> Розмір ставки, розмір поту й стек фішок видно всім, тож суперник читає твою стратегію.
> І немає вагомих доказів, що в гру реально грають.
>
> **Ціль Wave 5: зробити покерний стіл повністю конфіденційним — і показати реальне використання.**

Це закриває обидві осі оцінювання журі: **якість FHE-інтеграції** + **докази використання**.
Чотири блоки нижче — **не набір фіч, а логічний конвеєр**: кожен наступний неможливий або
безглуздий без попереднього.

```
Блок A (зашифровані ставки)  →  Блок B (валідність — без неї A небезпечний)
                              →  Блок C (3-max стіл — вітрина, де прихований стек має сенс)
                              →  Блок D (докази використання повної конфіденційності)
```

### Блок A — Зашифровані ставки і пот *(ядро, MUST)*

**Проблема:** ставки приймаються як plaintext `uint`, slider у UI позначено «(indicative only)».

**Рішення:**
- Ставка приймається як `InEuint64` (клієнтське шифрування через `useEncrypt` / cofhejs) → `euint64` у контракті.
- Пот накопичується гомоморфно: `pot = FHE.add(pot, bet)`.
- Стек гравця стає `euint64`, оновлюється `FHE.sub`/`FHE.add`.
- На завершенні роздачі `pot` і стек переможця стають видимими через `FHE.allowPublic` / `FHE.allow` (за permit).

**Файли:**
- `contracts/CofheHoldemPvP.sol`, `contracts/CofhePokerPvP.sol` — переписати betting-функції; **redeploy**.
- `src/hooks/useHoldemActions.ts`, `src/hooks/useGameActions.ts` — шифрувати ставку перед `useWrite`.
- `src/components/HoldemPvPTab.tsx` — bet slider шифрує значення; **прибрати позначку «(indicative only)»**.
- `src/config/contractHoldemPvP.ts`, `contractPvP.ts` — оновити ABI.

**Референс:** патерн зашифрованих ставок + `FHE.gt` з офіційного `poc-sealed-bid-auction`.

### Блок B — Валідність зашифрованих ставок *(anti-cheat, пряма залежність A, MUST)*

**Проблема:** коли ставка — ciphertext, `require(bet <= stack)` неможливий. Без перевірки
гравець може «поставити» більше, ніж має. Це **умова безпеки Блоку A, а не окрема фіча.**

**Рішення:**
- `ebool ok = FHE.lte(bet, stack)` → `effectiveBet = FHE.select(ok, bet, stack)` — капнути ставку до стеку замість revert (revert розкрив би приховану інформацію).
- Захист від негативного поту/стеку: усі оновлення лише через `FHE.add`/`FHE.sub` після `FHE.select`.
- **Фікс cross-group card-collision:** замість окремих `FHE.randomEuint64` seed для hole- і community-карт — один seed на роздачу + детермінований розклад (модульна арифметика на ciphertext), що гарантує унікальність усіх 9 карт.

**Файли:** ті самі контракти, що в Блоці A; додати тести у `scripts/test-game3.mjs`.

### Блок C — Прихований стек на 3-max столі *(вітрина, потребує A+B, COULD)*

**Проблема:** прихований стек у heads-up майже не дає переваги (стек однаково видно за діями).
Він стає **стратегічно значущим лише за 3+ гравців** — і саме так робить Pokerstarks.

**Рішення:**
- Розширити `CofheHoldemPvP` з 2 до **3 сидінь** + side pots для трьох all-in.
- Спектатор-режим (`src/components/SpectatorView.tsx`) показує «у грі / фолд», але **не розмір стеку**.
- Стек кожного — `euint64`, видимий лише власнику за permit.

**Fallback (важливо):** якщо showdown 3-max перевищує газ-ліміт Sepolia (~36M) — **лишити heads-up,
але з прихованим стеком**. Прихований стек корисний навіть у HU проти спектаторів/глядачів.
Не ризикувати ядром (A+B) заради C.

### Блок D — Докази використання повної конфіденційності *(traction, SHOULD)*

**Проблема:** журі оцінює «evidence of usage» — а в нас mock Admin Dashboard і мало on-chain активності.

**Рішення:**
- **Sit-and-go турнір** — переробити наявну інфру challenges/Elo (`useChallengesStore`, Elo з commit 77e8bb0) у простий турнірний режим.
- **Реальні on-chain лічильники** — total hands, encrypted-volume — у `src/components/AdminDashboard.tsx` замість mock-даних (читати агрегати з контрактів).
- **Headless-бот** — `scripts/bot.mjs`: прогнати N роздач із зашифрованими ставками, щоб згенерувати **справжню on-chain активність** як доказ.
- **Demo-сценарій + 2-хв відео** для сабмішену Wave 5: показати, що ставка в explorer — лише ciphertext-hash.

### Пріоритети (чесно про 9 днів)

| Пріоритет | Блок | Чому |
|---|---|---|
| **MUST** | A + B | Це і є «одна проблема» — повна конфіденційність ставок. B — умова безпеки A. |
| **SHOULD** | D | Дешево, велика вага в judging «evidence of usage». |
| **COULD** | C (3-max) | Лише якщо газ дозволяє; інакше fallback hidden-stack у heads-up. |

### Verification

- `npx hardhat test` + `scripts/test-game3.mjs` + `scripts/test-contracts.ts` на Sepolia **після redeploy**.
- Прогін `scripts/bot.mjs` для повного PvP-флоу із зашифрованими ставками (2 гаманці).
- Перевірити газ showdown **< 36M** (ліміт блоку Sepolia).
- Ручна перевірка: ставка в explorer — лише ciphertext-hash; стек суперника **не дешифрується** без permit.
- Оновити Vercel env новими адресами контрактів (`VITE_HOLDEM_PVP_CONTRACT_ADDRESS`, `VITE_PVP_CONTRACT_ADDRESS`).

### Як це підвищує шанс на перемогу

1. **Закриває єдиний системний розрив** vs усіх конкурентів — гра стає повністю приватною, не наполовину.
2. **Доганяє й переганяє Pokerstarks**: у них прихований лише стек (Tongo), у нас — ставки + пот + стек, плюс реальний покерний движок на ciphertext.
3. **Прямо влучає в критерій «якість FHE-інтеграції»**: більше реальних FHE-операцій на справжніх даних.
4. **Демонструє прогрес між хвилями** (ключовий критерій ретроактивної оцінки) — чітка дельта Wave 4 → Wave 5.
5. **Блок D дає докази використання** — друга вісь оцінювання.
6. Сфокусовано на **одній проблемі** — журі бачить чіткий продуктовий напрямок, а не розсип фіч.
