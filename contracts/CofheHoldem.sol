// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title CofheHoldem
/// @notice Texas Hold'em FHE poker: 2 hole + 5 community, 4 betting rounds,
///         check/bet/call/fold, best-5-of-7 showdown.
///
///  Flow:  startHand → [preflop → flop → turn → river] → showdown → complete
///  Each round: player acts (check/bet/fold) → bot FHE eval → resolve
///  If player checks and bot bets → player must call or fold
contract CofheHoldem {

    // ────────────────────────────────────────────────────────────────
    //  Constants
    // ────────────────────────────────────────────────────────────────
    uint256 public constant SB              = 5;
    uint256 public constant BB              = 10;
    uint256 public constant BET_SIZE        = 10;
    uint256 public constant INITIAL_BALANCE = 1000;

    // Bot thresholds (applied to decrypted scores)
    uint256 constant BOT_PF_THRESHOLD   = 7;   // 8-high or pair
    uint256 constant BOT_FLOP_THRESHOLD = 100; // pair or better (5-card score)
    uint256 constant BOT_TURN_THRESHOLD = 1;   // at least 1 pair in 6 cards
    uint256 constant BOT_RIVER_THRESHOLD = 1;  // at least 1 pair in 7 cards

    // ────────────────────────────────────────────────────────────────
    //  State types
    // ────────────────────────────────────────────────────────────────
    enum GameState {
        WAITING,             // 0
        PREFLOP,             // 1 - player acts
        AWAITING_BOT_PF,     // 2
        FLOP,                // 3
        AWAITING_BOT_FLOP,   // 4
        TURN,                // 5
        AWAITING_BOT_TURN,   // 6
        RIVER,               // 7
        AWAITING_BOT_RIVER,  // 8
        AWAITING_SHOWDOWN,   // 9
        COMPLETE             // 10
    }

    struct Table {
        address   player;
        GameState state;
        uint256   pot;
        uint256   handCount;
        bool      exists;
        bool      playerBet;       // did player bet (vs check) this round?
        bool      waitingForCall;  // does player need to call/fold bot's bet?
    }

    struct Hand {
        euint64[2] playerCards;
        euint64[2] botCards;
        euint64[5] communityCards;

        euint64    botScore;       // stored for showdown comparison
        euint64    playerScore;

        address    winner;

        bytes32    botPfHandle;
        bytes32    botFlopHandle;
        bytes32    botTurnHandle;
        bytes32    botRiverHandle;
        bytes32    showdownHandle;
        bool       showdownP1Done; // bot score computed
    }

    // ────────────────────────────────────────────────────────────────
    //  Storage
    // ────────────────────────────────────────────────────────────────
    mapping(uint256 => Table) public tables;
    mapping(uint256 => Hand)  internal hands;
    mapping(address => uint256) public tableOf;
    mapping(address => uint256) public balances;

    uint256 public nextTableId = 1;

    // ────────────────────────────────────────────────────────────────
    //  Events
    // ────────────────────────────────────────────────────────────────
    event TableCreated(uint256 indexed tableId, address player);
    event HandStarted(uint256 indexed tableId, uint256 handId);
    event PlayerAction(uint256 indexed tableId, string action);
    event BotAction(uint256 indexed tableId, string action);
    event CommunityRevealed(uint256 indexed tableId, uint8 count);
    event HandComplete(uint256 indexed tableId, address winner, uint256 pot);

    // ────────────────────────────────────────────────────────────────
    //  Modifiers
    // ────────────────────────────────────────────────────────────────
    modifier onlyPlayer(uint256 tableId) {
        require(tables[tableId].player == msg.sender, "Not your table");
        _;
    }

    modifier inState(uint256 tableId, GameState s) {
        require(tables[tableId].state == s, "Wrong game state");
        _;
    }

    // ════════════════════════════════════════════════════════════════
    //  TABLE MANAGEMENT
    // ════════════════════════════════════════════════════════════════

    function createTable() external returns (uint256 tableId) {
        uint256 existing = tableOf[msg.sender];
        if (existing != 0) {
            GameState s = tables[existing].state;
            require(
                s == GameState.COMPLETE || s == GameState.WAITING,
                "Active hand in progress"
            );
        }

        tableId = nextTableId++;
        tables[tableId] = Table({
            player:         msg.sender,
            state:          GameState.WAITING,
            pot:            0,
            handCount:      0,
            exists:         true,
            playerBet:      false,
            waitingForCall: false
        });
        tableOf[msg.sender] = tableId;

        if (balances[msg.sender] == 0) {
            balances[msg.sender] = INITIAL_BALANCE;
        }

        emit TableCreated(tableId, msg.sender);
    }

    // ════════════════════════════════════════════════════════════════
    //  START HAND
    // ════════════════════════════════════════════════════════════════

    /// @notice Post blinds and deal 9 encrypted cards.
    function startHand(uint256 tableId) external onlyPlayer(tableId) {
        Table storage t = tables[tableId];
        require(
            t.state == GameState.WAITING || t.state == GameState.COMPLETE,
            "Cannot start hand now"
        );
        require(balances[msg.sender] >= BB + BET_SIZE * 4, "Insufficient chips");

        // Post blinds: player = BB, bot = SB (virtual)
        balances[msg.sender] -= BB;
        t.pot        = SB + BB;
        t.handCount += 1;
        t.state      = GameState.PREFLOP;
        t.playerBet      = false;
        t.waitingForCall = false;

        // Reset hand
        hands[tableId].winner         = address(0);
        hands[tableId].showdownP1Done = false;

        _dealCards(tableId);

        emit HandStarted(tableId, t.handCount);
    }

    // ════════════════════════════════════════════════════════════════
    //  PLAYER ACTIONS (per round)
    // ════════════════════════════════════════════════════════════════

    /// @notice Player acts at preflop: 0=check, 1=bet, 3=fold
    function actPreflop(uint256 tableId, uint8 action)
        external onlyPlayer(tableId) inState(tableId, GameState.PREFLOP)
    {
        require(!tables[tableId].waitingForCall, "Must call or fold");
        _playerAct(tableId, action, GameState.AWAITING_BOT_PF);

        // Bot eval: 2-card hand
        Hand storage h = hands[tableId];
        euint64 botPfScore = _evalHand2(h.botCards);
        ebool botPlays = FHE.gte(botPfScore, FHE.asEuint64(uint64(BOT_PF_THRESHOLD)));
        FHE.allowThis(botPlays);
        h.botPfHandle = ebool.unwrap(botPlays);
        FHE.decrypt(botPlays);

        emit PlayerAction(tableId, action == 0 ? "check_pf" : "bet_pf");
    }

    /// @notice Player acts at flop: 0=check, 1=bet, 3=fold
    function actFlop(uint256 tableId, uint8 action)
        external onlyPlayer(tableId) inState(tableId, GameState.FLOP)
    {
        require(!tables[tableId].waitingForCall, "Must call or fold");
        _playerAct(tableId, action, GameState.AWAITING_BOT_FLOP);

        // Bot eval: 5-card hand (2 hole + 3 community)
        Hand storage h = hands[tableId];
        h.botScore = _evalHand5(h.botCards, h.communityCards);
        FHE.allowThis(h.botScore);
        ebool botPlays = FHE.gte(h.botScore, FHE.asEuint64(uint64(BOT_FLOP_THRESHOLD)));
        FHE.allowThis(botPlays);
        h.botFlopHandle = ebool.unwrap(botPlays);
        FHE.decrypt(botPlays);

        emit PlayerAction(tableId, action == 0 ? "check_flop" : "bet_flop");
    }

    /// @notice Player acts at turn: 0=check, 1=bet, 3=fold
    function actTurn(uint256 tableId, uint8 action)
        external onlyPlayer(tableId) inState(tableId, GameState.TURN)
    {
        require(!tables[tableId].waitingForCall, "Must call or fold");
        _playerAct(tableId, action, GameState.AWAITING_BOT_TURN);

        // Bot eval: pair count on 6 cards (2 hole + 4 community)
        Hand storage h = hands[tableId];
        euint64 pc = _pairCount6(h.botCards, h.communityCards);
        ebool botPlays = FHE.gte(pc, FHE.asEuint64(uint64(BOT_TURN_THRESHOLD)));
        FHE.allowThis(botPlays);
        h.botTurnHandle = ebool.unwrap(botPlays);
        FHE.decrypt(botPlays);

        emit PlayerAction(tableId, action == 0 ? "check_turn" : "bet_turn");
    }

    /// @notice Player acts at river: 0=check, 1=bet, 3=fold
    function actRiver(uint256 tableId, uint8 action)
        external onlyPlayer(tableId) inState(tableId, GameState.RIVER)
    {
        require(!tables[tableId].waitingForCall, "Must call or fold");
        _playerAct(tableId, action, GameState.AWAITING_BOT_RIVER);

        // Bot eval: pair count on 7 cards (2 hole + 5 community)
        Hand storage h = hands[tableId];
        euint64 pc = _pairCount7(h.botCards, h.communityCards);
        ebool botPlays = FHE.gte(pc, FHE.asEuint64(uint64(BOT_RIVER_THRESHOLD)));
        FHE.allowThis(botPlays);
        h.botRiverHandle = ebool.unwrap(botPlays);
        FHE.decrypt(botPlays);

        emit PlayerAction(tableId, action == 0 ? "check_river" : "bet_river");
    }

    /// @notice Player calls bot's bet (when waitingForCall = true)
    function callBot(uint256 tableId) external onlyPlayer(tableId) {
        Table storage t = tables[tableId];
        require(t.waitingForCall, "No bet to call");

        balances[msg.sender] -= BET_SIZE;
        t.pot += BET_SIZE;
        t.waitingForCall = false;

        // Advance to next round
        _advanceRound(tableId);
        emit PlayerAction(tableId, "call");
    }

    /// @dev Common logic for check/bet/raise/fold
    ///      action: 0=check, 1=bet, 2=raise(2x), 3=fold
    function _playerAct(uint256 tableId, uint8 action, GameState nextState) internal {
        require(action <= 3 && action != 255, "Invalid action");
        Table storage t = tables[tableId];

        if (action == 3) {
            // Fold
            hands[tableId].winner = address(this);
            t.state = GameState.COMPLETE;
            emit PlayerAction(tableId, "fold");
            emit HandComplete(tableId, address(this), t.pot);
            return;
        }

        if (action == 2) {
            // Raise = 2x bet
            uint256 raiseAmount = BET_SIZE * 2;
            balances[msg.sender] -= raiseAmount;
            t.pot += raiseAmount;
            t.playerBet = true;
        } else if (action == 1) {
            // Bet
            balances[msg.sender] -= BET_SIZE;
            t.pot += BET_SIZE;
            t.playerBet = true;
        } else {
            // Check
            t.playerBet = false;
        }

        t.state = nextState;
    }

    // ════════════════════════════════════════════════════════════════
    //  BOT RESOLVE (per round)
    // ════════════════════════════════════════════════════════════════

    function isBotPfReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].botPfHandle);
        return ready;
    }
    function isBotFlopReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].botFlopHandle);
        return ready;
    }
    function isBotTurnReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].botTurnHandle);
        return ready;
    }
    function isBotRiverReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].botRiverHandle);
        return ready;
    }

    function resolveBotPreFlop(uint256 tableId)
        external inState(tableId, GameState.AWAITING_BOT_PF)
    {
        _resolveBot(tableId, hands[tableId].botPfHandle, GameState.PREFLOP, GameState.FLOP, 3);
    }

    function resolveBotFlop(uint256 tableId)
        external inState(tableId, GameState.AWAITING_BOT_FLOP)
    {
        _resolveBot(tableId, hands[tableId].botFlopHandle, GameState.FLOP, GameState.TURN, 1);
    }

    function resolveBotTurn(uint256 tableId)
        external inState(tableId, GameState.AWAITING_BOT_TURN)
    {
        _resolveBot(tableId, hands[tableId].botTurnHandle, GameState.TURN, GameState.RIVER, 1);
    }

    function resolveBotRiver(uint256 tableId)
        external inState(tableId, GameState.AWAITING_BOT_RIVER)
    {
        _resolveBotRiver(tableId);
    }

    /// @dev Generic bot resolve for preflop/flop/turn
    function _resolveBot(
        uint256 tableId,
        bytes32 handle,
        GameState currentRound,
        GameState nextRound,
        uint8 cardsToReveal
    ) internal {
        (uint256 decision, bool ready) = FHE.getDecryptResultSafe(handle);
        require(ready, "Bot decision not ready");

        Table storage t = tables[tableId];
        Hand storage h  = hands[tableId];

        if (t.playerBet) {
            // Player bet → bot calls or folds
            if (decision == 0) {
                // Bot folds
                balances[t.player] += t.pot;
                h.winner = t.player;
                t.state = GameState.COMPLETE;
                emit BotAction(tableId, "fold");
                emit HandComplete(tableId, t.player, t.pot);
            } else {
                // Bot calls
                t.pot += BET_SIZE;
                emit BotAction(tableId, "call");
                _revealCommunity(tableId, cardsToReveal);
                t.state = nextRound;
                t.playerBet = false;
                t.waitingForCall = false;
            }
        } else {
            // Player checked → bot checks or bets
            if (decision == 0) {
                // Bot checks → advance
                emit BotAction(tableId, "check");
                _revealCommunity(tableId, cardsToReveal);
                t.state = nextRound;
                t.playerBet = false;
                t.waitingForCall = false;
            } else {
                // Bot bets → player must call or fold
                t.pot += BET_SIZE;
                t.waitingForCall = true;
                t.state = currentRound; // back to player action
                emit BotAction(tableId, "bet");
            }
        }
    }

    /// @dev River resolve: if both act, go to showdown
    function _resolveBotRiver(uint256 tableId) internal {
        (uint256 decision, bool ready) = FHE.getDecryptResultSafe(hands[tableId].botRiverHandle);
        require(ready, "Bot decision not ready");

        Table storage t = tables[tableId];
        Hand storage h  = hands[tableId];

        if (t.playerBet) {
            if (decision == 0) {
                // Bot folds
                balances[t.player] += t.pot;
                h.winner = t.player;
                t.state = GameState.COMPLETE;
                emit BotAction(tableId, "fold");
                emit HandComplete(tableId, t.player, t.pot);
            } else {
                // Bot calls → showdown
                t.pot += BET_SIZE;
                emit BotAction(tableId, "call");
                t.state = GameState.AWAITING_SHOWDOWN;
            }
        } else {
            if (decision == 0) {
                // Bot checks → showdown
                emit BotAction(tableId, "check");
                t.state = GameState.AWAITING_SHOWDOWN;
            } else {
                // Bot bets → player must call or fold
                t.pot += BET_SIZE;
                t.waitingForCall = true;
                t.state = GameState.RIVER;
                emit BotAction(tableId, "bet");
            }
        }
    }

    /// @dev Reveal community cards based on round transition
    function _revealCommunity(uint256 tableId, uint8 count) internal {
        Hand storage h = hands[tableId];
        if (count == 3) {
            // Preflop → Flop: reveal first 3
            FHE.allowPublic(h.communityCards[0]);
            FHE.allowPublic(h.communityCards[1]);
            FHE.allowPublic(h.communityCards[2]);
            emit CommunityRevealed(tableId, 3);
        } else if (count == 1) {
            // Determine which card to reveal based on current state
            // Flop→Turn: card [3], Turn→River: card [4]
            GameState s = tables[tableId].state;
            if (s == GameState.AWAITING_BOT_FLOP) {
                FHE.allowPublic(h.communityCards[3]);
            } else {
                FHE.allowPublic(h.communityCards[4]);
            }
            emit CommunityRevealed(tableId, 1);
        }
    }

    /// @dev Advance to next round (used by callBot after waitingForCall)
    function _advanceRound(uint256 tableId) internal {
        Table storage t = tables[tableId];
        Hand storage h  = hands[tableId];
        GameState s = t.state;

        if (s == GameState.PREFLOP) {
            FHE.allowPublic(h.communityCards[0]);
            FHE.allowPublic(h.communityCards[1]);
            FHE.allowPublic(h.communityCards[2]);
            t.state = GameState.FLOP;
            emit CommunityRevealed(tableId, 3);
        } else if (s == GameState.FLOP) {
            FHE.allowPublic(h.communityCards[3]);
            t.state = GameState.TURN;
            emit CommunityRevealed(tableId, 1);
        } else if (s == GameState.TURN) {
            FHE.allowPublic(h.communityCards[4]);
            t.state = GameState.RIVER;
            emit CommunityRevealed(tableId, 1);
        } else if (s == GameState.RIVER) {
            t.state = GameState.AWAITING_SHOWDOWN;
        }

        t.playerBet = false;
        t.waitingForCall = false;
    }

    // ════════════════════════════════════════════════════════════════
    //  SHOWDOWN (split into 2 TXs for gas)
    // ════════════════════════════════════════════════════════════════

    /// @notice Part 1: compute bot's 7-card score
    function computeShowdownP1(uint256 tableId)
        external inState(tableId, GameState.AWAITING_SHOWDOWN)
    {
        Hand storage h = hands[tableId];
        require(!h.showdownP1Done, "P1 already done");

        h.botScore = _evalHand7(h.botCards, h.communityCards);
        FHE.allowThis(h.botScore);
        h.showdownP1Done = true;
    }

    /// @notice Part 2: compute player's score, compare, queue decrypt
    function computeShowdownP2(uint256 tableId)
        external inState(tableId, GameState.AWAITING_SHOWDOWN)
    {
        Hand storage h = hands[tableId];
        require(h.showdownP1Done, "Run P1 first");

        h.playerScore = _evalHand7(h.playerCards, h.communityCards);
        FHE.allowThis(h.playerScore);

        ebool playerWins = FHE.gt(h.playerScore, h.botScore);
        FHE.allowThis(playerWins);
        h.showdownHandle = ebool.unwrap(playerWins);
        FHE.decrypt(playerWins);
    }

    function isShowdownReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].showdownHandle);
        return ready;
    }

    /// @notice Resolve showdown - reveal cards and pay winner
    function resolveShowdown(uint256 tableId)
        external inState(tableId, GameState.AWAITING_SHOWDOWN)
    {
        Hand storage h = hands[tableId];
        Table storage t = tables[tableId];
        (uint256 result, bool ready) = FHE.getDecryptResultSafe(h.showdownHandle);
        require(ready, "Showdown not ready");

        if (result == 1) {
            balances[t.player] += t.pot;
            h.winner = t.player;
        } else {
            h.winner = address(this);
        }

        // Reveal all cards
        for (uint256 i = 0; i < 2; i++) {
            FHE.allowPublic(h.playerCards[i]);
            FHE.allowPublic(h.botCards[i]);
        }
        for (uint256 i = 0; i < 5; i++) {
            FHE.allowPublic(h.communityCards[i]);
        }

        t.state = GameState.COMPLETE;
        emit HandComplete(tableId, h.winner, t.pot);
    }

    // ════════════════════════════════════════════════════════════════
    //  FOLD
    // ════════════════════════════════════════════════════════════════

    function fold(uint256 tableId) external onlyPlayer(tableId) {
        GameState s = tables[tableId].state;
        require(
            s == GameState.PREFLOP      ||
            s == GameState.FLOP         ||
            s == GameState.TURN         ||
            s == GameState.RIVER        ||
            s == GameState.AWAITING_BOT_PF    ||
            s == GameState.AWAITING_BOT_FLOP  ||
            s == GameState.AWAITING_BOT_TURN  ||
            s == GameState.AWAITING_BOT_RIVER ||
            s == GameState.AWAITING_SHOWDOWN,
            "Can't fold now"
        );

        hands[tableId].winner = address(this);
        tables[tableId].state = GameState.COMPLETE;

        emit PlayerAction(tableId, "fold");
        emit HandComplete(tableId, address(this), tables[tableId].pot);
    }

    // ════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════════════

    function getMyCards(uint256 tableId) external view returns (uint256 c0, uint256 c1) {
        require(tables[tableId].player == msg.sender, "Not your table");
        Hand storage h = hands[tableId];
        return (uint256(euint64.unwrap(h.playerCards[0])), uint256(euint64.unwrap(h.playerCards[1])));
    }

    function getCommunityCards(uint256 tableId)
        external view
        returns (uint256 c0, uint256 c1, uint256 c2, uint256 c3, uint256 c4)
    {
        Hand storage h = hands[tableId];
        return (
            uint256(euint64.unwrap(h.communityCards[0])),
            uint256(euint64.unwrap(h.communityCards[1])),
            uint256(euint64.unwrap(h.communityCards[2])),
            uint256(euint64.unwrap(h.communityCards[3])),
            uint256(euint64.unwrap(h.communityCards[4]))
        );
    }

    function getBotCards(uint256 tableId) external view returns (uint256 c0, uint256 c1) {
        Hand storage h = hands[tableId];
        return (uint256(euint64.unwrap(h.botCards[0])), uint256(euint64.unwrap(h.botCards[1])));
    }

    function getTableInfo(uint256 tableId)
        external view
        returns (
            address player, uint8 state, uint256 pot, uint256 handCount,
            bool waitingForCall, bool playerBet
        )
    {
        Table storage t = tables[tableId];
        return (t.player, uint8(t.state), t.pot, t.handCount, t.waitingForCall, t.playerBet);
    }

    function getHandResult(uint256 tableId) external view returns (address winner, uint256 pot) {
        return (hands[tableId].winner, tables[tableId].pot);
    }

    function getBalance() external view returns (uint256) { return balances[msg.sender]; }
    function getBalanceOf(address addr) external view returns (uint256) { return balances[addr]; }
    function getMyTableId() external view returns (uint256) { return tableOf[msg.sender]; }

    // ════════════════════════════════════════════════════════════════
    //  INTERNAL: CARD DEALING
    // ════════════════════════════════════════════════════════════════

    /// @dev Deal 9 encrypted cards using 3 independent random seeds
    ///      to prevent player from deducing bot/community cards.
    ///      Within each group, coprime offset (7) guarantees uniqueness.
    function _dealCards(uint256 tableId) internal {
        Table storage t = tables[tableId];
        Hand  storage h = hands[tableId];

        euint64 seedP = FHE.randomEuint64(); // player seed
        euint64 seedB = FHE.randomEuint64(); // bot seed
        euint64 seedC = FHE.randomEuint64(); // community seed
        euint64 fiftytwo = FHE.asEuint64(52);

        // Player hole cards (2)
        for (uint256 i = 0; i < 2; i++) {
            euint64 card = FHE.rem(FHE.add(seedP, FHE.asEuint64(uint64(i * 7))), fiftytwo);
            FHE.allowThis(card);
            FHE.allow(card, t.player);
            h.playerCards[i] = card;
        }

        // Bot hole cards (2)
        for (uint256 i = 0; i < 2; i++) {
            euint64 card = FHE.rem(FHE.add(seedB, FHE.asEuint64(uint64(i * 7))), fiftytwo);
            FHE.allowThis(card);
            h.botCards[i] = card;
        }

        // Community cards (5)
        for (uint256 i = 0; i < 5; i++) {
            euint64 card = FHE.rem(FHE.add(seedC, FHE.asEuint64(uint64(i * 7))), fiftytwo);
            FHE.allowThis(card);
            h.communityCards[i] = card;
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  INTERNAL: 2-CARD EVALUATION (preflop bot)
    // ════════════════════════════════════════════════════════════════

    function _evalHand2(euint64[2] storage cards) internal returns (euint64) {
        euint64 four = FHE.asEuint64(4);
        euint64 r0 = FHE.div(cards[0], four);
        euint64 r1 = FHE.div(cards[1], four);
        ebool isPair = FHE.eq(r0, r1);
        euint64 maxR = FHE.max(r0, r1);
        return FHE.select(isPair, FHE.add(FHE.asEuint64(100), maxR), maxR);
    }

    // ════════════════════════════════════════════════════════════════
    //  INTERNAL: PAIR COUNT (turn/river bot decisions)
    // ════════════════════════════════════════════════════════════════

    /// @dev Count pairwise rank matches among 6 cards (C(6,2)=15)
    function _pairCount6(euint64[2] storage hole, euint64[5] storage comm) internal returns (euint64) {
        euint64 four = FHE.asEuint64(4);
        euint64 one  = FHE.asEuint64(1);
        euint64 zero = FHE.asEuint64(0);

        euint64[6] memory r;
        r[0] = FHE.div(hole[0], four);
        r[1] = FHE.div(hole[1], four);
        r[2] = FHE.div(comm[0], four);
        r[3] = FHE.div(comm[1], four);
        r[4] = FHE.div(comm[2], four);
        r[5] = FHE.div(comm[3], four);

        euint64 pc = zero;
        for (uint256 i = 0; i < 6; i++) {
            for (uint256 j = i + 1; j < 6; j++) {
                pc = FHE.add(pc, FHE.select(FHE.eq(r[i], r[j]), one, zero));
            }
        }
        return pc;
    }

    /// @dev Count pairwise rank matches among 7 cards (C(7,2)=21)
    function _pairCount7(euint64[2] storage hole, euint64[5] storage comm) internal returns (euint64) {
        euint64 four = FHE.asEuint64(4);
        euint64 one  = FHE.asEuint64(1);
        euint64 zero = FHE.asEuint64(0);

        euint64[7] memory r;
        r[0] = FHE.div(hole[0], four);
        r[1] = FHE.div(hole[1], four);
        for (uint256 i = 0; i < 5; i++) {
            r[i + 2] = FHE.div(comm[i], four);
        }

        euint64 pc = zero;
        for (uint256 i = 0; i < 7; i++) {
            for (uint256 j = i + 1; j < 7; j++) {
                pc = FHE.add(pc, FHE.select(FHE.eq(r[i], r[j]), one, zero));
            }
        }
        return pc;
    }

    // ════════════════════════════════════════════════════════════════
    //  INTERNAL: 5-CARD EVALUATION (flop bot)
    // ════════════════════════════════════════════════════════════════

    function _evalHand5(euint64[2] storage holeCards, euint64[5] storage community)
        internal returns (euint64)
    {
        euint64 four = FHE.asEuint64(4);
        euint64 one  = FHE.asEuint64(1);
        euint64 zero = FHE.asEuint64(0);

        euint64[5] memory r;
        euint64[5] memory s;
        r[0] = FHE.div(holeCards[0], four);  s[0] = FHE.rem(holeCards[0], four);
        r[1] = FHE.div(holeCards[1], four);  s[1] = FHE.rem(holeCards[1], four);
        r[2] = FHE.div(community[0], four); s[2] = FHE.rem(community[0], four);
        r[3] = FHE.div(community[1], four); s[3] = FHE.rem(community[1], four);
        r[4] = FHE.div(community[2], four); s[4] = FHE.rem(community[2], four);

        // Pairwise rank equalities (10)
        euint64[10] memory eqN;
        eqN[0] = FHE.select(FHE.eq(r[0], r[1]), one, zero);
        eqN[1] = FHE.select(FHE.eq(r[0], r[2]), one, zero);
        eqN[2] = FHE.select(FHE.eq(r[0], r[3]), one, zero);
        eqN[3] = FHE.select(FHE.eq(r[0], r[4]), one, zero);
        eqN[4] = FHE.select(FHE.eq(r[1], r[2]), one, zero);
        eqN[5] = FHE.select(FHE.eq(r[1], r[3]), one, zero);
        eqN[6] = FHE.select(FHE.eq(r[1], r[4]), one, zero);
        eqN[7] = FHE.select(FHE.eq(r[2], r[3]), one, zero);
        eqN[8] = FHE.select(FHE.eq(r[2], r[4]), one, zero);
        eqN[9] = FHE.select(FHE.eq(r[3], r[4]), one, zero);

        euint64 pc = eqN[0];
        for (uint256 i = 1; i < 10; i++) pc = FHE.add(pc, eqN[i]);

        // Match count per card
        euint64[5] memory m;
        m[0] = FHE.add(FHE.add(eqN[0], eqN[1]), FHE.add(eqN[2], eqN[3]));
        m[1] = FHE.add(FHE.add(eqN[0], eqN[4]), FHE.add(eqN[5], eqN[6]));
        m[2] = FHE.add(FHE.add(eqN[1], eqN[4]), FHE.add(eqN[7], eqN[8]));
        m[3] = FHE.add(FHE.add(eqN[2], eqN[5]), FHE.add(eqN[7], eqN[9]));
        m[4] = FHE.add(FHE.add(eqN[3], eqN[6]), FHE.add(eqN[8], eqN[9]));

        // Flush
        ebool isFlush = FHE.and(
            FHE.and(FHE.eq(s[0], s[1]), FHE.eq(s[1], s[2])),
            FHE.and(FHE.eq(s[2], s[3]), FHE.eq(s[3], s[4]))
        );

        // Straight
        euint64 maxR = r[0]; euint64 minR = r[0]; euint64 sumR = r[0];
        for (uint256 i = 1; i < 5; i++) {
            maxR = FHE.max(maxR, r[i]);
            minR = FHE.min(minR, r[i]);
            sumR = FHE.add(sumR, r[i]);
        }
        ebool noPairs = FHE.eq(pc, zero);
        ebool normalStr = FHE.and(noPairs, FHE.eq(FHE.sub(maxR, minR), FHE.asEuint64(4)));
        ebool aceLow = FHE.and(
            FHE.and(noPairs, FHE.eq(minR, zero)),
            FHE.and(FHE.eq(maxR, FHE.asEuint64(12)), FHE.eq(sumR, FHE.asEuint64(18)))
        );
        ebool isStraight = FHE.or(normalStr, aceLow);

        // Adjusted ranks + bubble sort
        euint64 fourteen = FHE.asEuint64(14);
        euint64[5] memory adj;
        for (uint256 i = 0; i < 5; i++) {
            adj[i] = FHE.add(r[i], FHE.mul(m[i], fourteen));
        }
        for (uint256 pass = 4; pass >= 1; pass--) {
            for (uint256 i = 0; i < pass; i++) {
                euint64 lo = FHE.min(adj[i], adj[i+1]);
                euint64 hi = FHE.max(adj[i], adj[i+1]);
                adj[i] = lo; adj[i+1] = hi;
            }
        }

        // Hand type
        euint64 ht = zero;
        ht = FHE.select(FHE.eq(pc, one),              FHE.asEuint64(1), ht);
        ht = FHE.select(FHE.eq(pc, FHE.asEuint64(2)), FHE.asEuint64(2), ht);
        ht = FHE.select(FHE.eq(pc, FHE.asEuint64(3)), FHE.asEuint64(3), ht);
        ht = FHE.select(isStraight,                     FHE.asEuint64(4), ht);
        ht = FHE.select(isFlush,                         FHE.asEuint64(5), ht);
        ht = FHE.select(FHE.eq(pc, FHE.asEuint64(4)), FHE.asEuint64(6), ht);
        ht = FHE.select(FHE.eq(pc, FHE.asEuint64(6)), FHE.asEuint64(7), ht);
        ht = FHE.select(FHE.and(isStraight, isFlush),   FHE.asEuint64(8), ht);

        // Score
        euint64 score = FHE.mul(ht, FHE.asEuint64(10_000_000_000));
        score = FHE.add(score, FHE.mul(adj[4], FHE.asEuint64(100_000_000)));
        score = FHE.add(score, FHE.mul(adj[3], FHE.asEuint64(1_000_000)));
        score = FHE.add(score, FHE.mul(adj[2], FHE.asEuint64(10_000)));
        score = FHE.add(score, FHE.mul(adj[1], FHE.asEuint64(100)));
        score = FHE.add(score, adj[0]);

        FHE.allowThis(score);
        return score;
    }

    // ════════════════════════════════════════════════════════════════
    //  INTERNAL: 7-CARD EVALUATION (showdown)
    // ════════════════════════════════════════════════════════════════

    /// @dev Evaluate best 5-card hand from 7 cards.
    ///      Uses pair-count + flush + straight detection directly on 7 cards.
    ///      For pair-based hands: adjusted rank sort → top 5.
    ///      For flush: suit counting.
    ///      For straight: sorted rank windows.
    function _evalHand7(euint64[2] storage hole, euint64[5] storage comm)
        internal returns (euint64)
    {
        euint64 four     = FHE.asEuint64(4);
        euint64 one      = FHE.asEuint64(1);
        euint64 zero     = FHE.asEuint64(0);
        euint64 fourteen = FHE.asEuint64(14);

        // ── Extract ranks and suits ──
        euint64[7] memory r;
        euint64[7] memory s;
        r[0] = FHE.div(hole[0], four);  s[0] = FHE.rem(hole[0], four);
        r[1] = FHE.div(hole[1], four);  s[1] = FHE.rem(hole[1], four);
        for (uint256 i = 0; i < 5; i++) {
            r[i+2] = FHE.div(comm[i], four);
            s[i+2] = FHE.rem(comm[i], four);
        }

        // ── Pairwise rank equalities C(7,2)=21 ──
        // Store in flat array; also accumulate per-card match counts
        euint64[7] memory mc; // match count per card
        for (uint256 i = 0; i < 7; i++) mc[i] = zero;
        euint64 totalPc = zero;

        for (uint256 i = 0; i < 7; i++) {
            for (uint256 j = i + 1; j < 7; j++) {
                euint64 eq_ = FHE.select(FHE.eq(r[i], r[j]), one, zero);
                mc[i] = FHE.add(mc[i], eq_);
                mc[j] = FHE.add(mc[j], eq_);
                totalPc = FHE.add(totalPc, eq_);
            }
        }

        // ── Max match count ──
        euint64 maxMc = mc[0];
        for (uint256 i = 1; i < 7; i++) maxMc = FHE.max(maxMc, mc[i]);

        // ── Flush detection: count cards per suit ──
        euint64[4] memory suitCount;
        for (uint256 si = 0; si < 4; si++) {
            suitCount[si] = zero;
            euint64 sVal = FHE.asEuint64(uint64(si));
            for (uint256 ci = 0; ci < 7; ci++) {
                suitCount[si] = FHE.add(suitCount[si],
                    FHE.select(FHE.eq(s[ci], sVal), one, zero));
            }
        }
        euint64 maxSuit = suitCount[0];
        for (uint256 i = 1; i < 4; i++) maxSuit = FHE.max(maxSuit, suitCount[i]);
        ebool isFlush = FHE.gte(maxSuit, FHE.asEuint64(5));

        // ── Straight detection: sort 7 ranks, check windows ──
        euint64[7] memory sr; // sorted ranks
        for (uint256 i = 0; i < 7; i++) sr[i] = r[i];
        // Bubble sort ascending
        for (uint256 pass = 6; pass >= 1; pass--) {
            for (uint256 i = 0; i < pass; i++) {
                euint64 lo = FHE.min(sr[i], sr[i+1]);
                euint64 hi = FHE.max(sr[i], sr[i+1]);
                sr[i] = lo; sr[i+1] = hi;
            }
        }

        // Check 3 windows of 5 for straight (range=4, all distinct)
        ebool isStraight = FHE.asEbool(false);
        euint64 straightHigh = zero;
        for (uint256 w = 0; w < 3; w++) {
            euint64 diff = FHE.sub(sr[w+4], sr[w]);
            ebool rangeOk = FHE.eq(diff, FHE.asEuint64(4));
            // All 5 distinct (no adjacent equals)
            ebool distinct = FHE.and(
                FHE.and(FHE.ne(sr[w], sr[w+1]), FHE.ne(sr[w+1], sr[w+2])),
                FHE.and(FHE.ne(sr[w+2], sr[w+3]), FHE.ne(sr[w+3], sr[w+4]))
            );
            ebool wStr = FHE.and(rangeOk, distinct);
            straightHigh = FHE.select(wStr, sr[w+4], straightHigh);
            isStraight = FHE.or(isStraight, wStr);
        }

        // Ace-low straight: A(12) present + 0,1,2,3 present
        // sr[6]=max. If sr[6]==12 and sr[0]==0,sr[1]==1,sr[2]==2,sr[3]==3
        ebool acePresent = FHE.eq(sr[6], FHE.asEuint64(12));
        ebool lowCards = FHE.and(
            FHE.and(FHE.eq(sr[0], zero), FHE.eq(sr[1], one)),
            FHE.and(FHE.eq(sr[2], FHE.asEuint64(2)), FHE.eq(sr[3], FHE.asEuint64(3)))
        );
        ebool acelow = FHE.and(acePresent, lowCards);
        isStraight = FHE.or(isStraight, acelow);
        straightHigh = FHE.select(acelow, FHE.asEuint64(3), straightHigh);

        // ── Hand type from 7 cards ──
        // totalPc + maxMc → hand type (for pair-based)
        euint64 ht = zero;
        // pair: totalPc>=1
        ht = FHE.select(FHE.gte(totalPc, one), one, ht);
        // two pair: totalPc>=2
        ht = FHE.select(FHE.gte(totalPc, FHE.asEuint64(2)), FHE.asEuint64(2), ht);
        // trips: totalPc>=3 AND maxMc>=2
        ht = FHE.select(
            FHE.and(FHE.gte(totalPc, FHE.asEuint64(3)), FHE.gte(maxMc, FHE.asEuint64(2))),
            FHE.asEuint64(3), ht
        );
        // straight (overrides pair-level hands)
        ht = FHE.select(FHE.and(isStraight, FHE.lte(ht, FHE.asEuint64(3))),
            FHE.asEuint64(4), ht);
        // flush (overrides straight and below)
        ht = FHE.select(FHE.and(isFlush, FHE.lte(ht, FHE.asEuint64(4))),
            FHE.asEuint64(5), ht);
        // full house: totalPc>=4 AND maxMc<=2
        ht = FHE.select(
            FHE.and(FHE.gte(totalPc, FHE.asEuint64(4)), FHE.lte(maxMc, FHE.asEuint64(2))),
            FHE.asEuint64(6), ht
        );
        // four of a kind: maxMc>=3
        ht = FHE.select(FHE.gte(maxMc, FHE.asEuint64(3)), FHE.asEuint64(7), ht);
        // straight flush: flush AND straight AND no pairs (all distinct ranks →
        // the 5 flush cards and 5 straight cards must overlap)
        ebool noPairs7 = FHE.eq(totalPc, zero);
        ht = FHE.select(
            FHE.and(FHE.and(isStraight, isFlush), noPairs7),
            FHE.asEuint64(8), ht
        );

        // ── Adjusted ranks: sort top 5 for scoring ──
        euint64[7] memory adj;
        for (uint256 i = 0; i < 7; i++) {
            adj[i] = FHE.add(r[i], FHE.mul(mc[i], fourteen));
        }
        // Sort 7 adjusted ranks ascending
        for (uint256 pass = 6; pass >= 1; pass--) {
            for (uint256 i = 0; i < pass; i++) {
                euint64 lo = FHE.min(adj[i], adj[i+1]);
                euint64 hi = FHE.max(adj[i], adj[i+1]);
                adj[i] = lo; adj[i+1] = hi;
            }
        }

        // Score from top 5 adjusted ranks (indices 2..6)
        euint64 score = FHE.mul(ht, FHE.asEuint64(10_000_000_000));
        score = FHE.add(score, FHE.mul(adj[6], FHE.asEuint64(100_000_000)));
        score = FHE.add(score, FHE.mul(adj[5], FHE.asEuint64(1_000_000)));
        score = FHE.add(score, FHE.mul(adj[4], FHE.asEuint64(10_000)));
        score = FHE.add(score, FHE.mul(adj[3], FHE.asEuint64(100)));
        score = FHE.add(score, adj[2]);

        FHE.allowThis(score);
        return score;
    }
}
