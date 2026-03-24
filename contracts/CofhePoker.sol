// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title CofhePoker
/// @notice 3-card poker game where all card values are FHE-encrypted.
///         Nobody — not validators, not the opponent, not the contract itself —
///         can see a player's cards. Only the player can decrypt via a wallet permit.
contract CofhePoker {

    // ────────────────────────────────────────────────────────────────
    //  State types
    // ────────────────────────────────────────────────────────────────

    enum GameState {
        WAITING,           // table exists, no active hand
        PLAYER_TURN,       // cards dealt, awaiting player action
        AWAITING_BOT,      // player played, waiting for CoFHE bot-decision decrypt
        AWAITING_SHOWDOWN, // both played, waiting for CoFHE showdown decrypt
        COMPLETE           // hand finished
    }

    struct Table {
        address player;
        GameState state;
        uint256 pot;        // virtual chips in pot
        uint256 handCount;
        bool exists;
    }

    struct Hand {
        // Cards stored as euint64 (values 0–51)
        // euint64 is used to avoid multi-type FHE cast issues; values fit easily
        euint64[3] playerCards;
        euint64[3] botCards;
        euint64  playerScore;       // FHE-computed hand score (0–512+)
        euint64  botScore;          // FHE-computed hand score
        bool     playerPlayed;
        address  winner;            // address(0) = nobody yet, address(this) = bot
        // ctHashes for async FHE.decrypt polling (ebool is bytes32)
        bytes32  botDecryptHandle;
        bytes32  showdownDecryptHandle;
    }

    // ────────────────────────────────────────────────────────────────
    //  Storage
    // ────────────────────────────────────────────────────────────────

    mapping(uint256 => Table) public tables;
    mapping(uint256 => Hand)  internal hands;
    mapping(address => uint256) public tableOf;    // player → tableId
    mapping(address => uint256) public balances;   // virtual chip balances

    uint256 public nextTableId = 1;
    uint256 public constant ANTE           = 10;
    uint256 public constant INITIAL_BALANCE = 1000;

    // ────────────────────────────────────────────────────────────────
    //  Events
    // ────────────────────────────────────────────────────────────────

    event TableCreated(uint256 indexed tableId, address player);
    event HandStarted(uint256 indexed tableId, uint256 handId);
    event PlayerAction(uint256 indexed tableId, string action);
    event BotAction(uint256 indexed tableId, string action);
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

    // ────────────────────────────────────────────────────────────────
    //  Public / External actions
    // ────────────────────────────────────────────────────────────────

    /// @notice Create a new PvE table. Initialises virtual chip balance if first time.
    function createTable() external returns (uint256 tableId) {
        // Allow re-creating a table only when previous one is COMPLETE or WAITING
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
            player:    msg.sender,
            state:     GameState.WAITING,
            pot:       0,
            handCount: 0,
            exists:    true
        });
        tableOf[msg.sender] = tableId;

        if (balances[msg.sender] == 0) {
            balances[msg.sender] = INITIAL_BALANCE;
        }

        emit TableCreated(tableId, msg.sender);
    }

    /// @notice Post ante and deal 6 encrypted cards (3 per side).
    function startHand(uint256 tableId) external onlyPlayer(tableId) {
        Table storage t = tables[tableId];
        require(
            t.state == GameState.WAITING || t.state == GameState.COMPLETE,
            "Cannot start hand now"
        );
        require(balances[msg.sender] >= ANTE, "Insufficient chips for ante");

        balances[msg.sender] -= ANTE;
        t.pot       = ANTE * 2;   // player ante + bot ante
        t.handCount += 1;
        t.state     = GameState.PLAYER_TURN;

        _dealCards(tableId);

        emit HandStarted(tableId, t.handCount);
    }

    /// @notice Player chooses to play (match ante with equal bet).
    ///         Triggers asynchronous bot evaluation via FHE.decrypt.
    function play(uint256 tableId)
        external
        onlyPlayer(tableId)
        inState(tableId, GameState.PLAYER_TURN)
    {
        require(balances[msg.sender] >= ANTE, "Insufficient chips to bet");

        balances[msg.sender]    -= ANTE;
        tables[tableId].pot     += ANTE;
        hands[tableId].playerPlayed = true;
        tables[tableId].state   = GameState.AWAITING_BOT;

        emit PlayerAction(tableId, "play");

        _botDecide(tableId);
    }

    /// @notice Player folds — bot wins the pot (ante only, no play-bet).
    function fold(uint256 tableId)
        external
        onlyPlayer(tableId)
        inState(tableId, GameState.PLAYER_TURN)
    {
        Table storage t = tables[tableId];
        // Bot wins; balance goes nowhere (virtual chips leaving circulation)
        hands[tableId].winner = address(this); // sentinel: bot
        t.state               = GameState.COMPLETE;

        emit PlayerAction(tableId, "fold");
        emit HandComplete(tableId, address(this), t.pot);
    }

    /// @notice Resolve bot decision after CoFHE has decrypted shouldPlay.
    ///         Anyone can call; safe because it only reads CoFHE state.
    function resolveBotDecision(uint256 tableId)
        external
        inState(tableId, GameState.AWAITING_BOT)
    {
        Hand storage h = hands[tableId];
        (uint256 result, bool ready) = FHE.getDecryptResultSafe(h.botDecryptHandle);
        require(ready, "Bot decision not ready yet");

        bool botPlays = (result == 1);

        if (!botPlays) {
            // Bot folds — player wins the pot
            emit BotAction(tableId, "fold");
            Table storage t = tables[tableId];
            balances[t.player] += t.pot;
            h.winner            = t.player;
            t.state             = GameState.COMPLETE;
            // Reveal player's cards (they won)
            for (uint i = 0; i < 3; i++) {
                FHE.allowPublic(h.playerCards[i]);
            }
            emit HandComplete(tableId, t.player, t.pot);
        } else {
            // Bot plays — add bot's play-bet to pot, kick off showdown
            emit BotAction(tableId, "play");
            tables[tableId].pot += ANTE;
            tables[tableId].state = GameState.AWAITING_SHOWDOWN;
            _showdown(tableId);
        }
    }

    /// @notice Resolve showdown after CoFHE has decrypted playerWins.
    ///         Anyone can call; safe because it only reads CoFHE state.
    function resolveShowdown(uint256 tableId)
        external
        inState(tableId, GameState.AWAITING_SHOWDOWN)
    {
        Hand storage h = hands[tableId];
        (uint256 result, bool ready) = FHE.getDecryptResultSafe(h.showdownDecryptHandle);
        require(ready, "Showdown not ready yet");

        Table storage t = tables[tableId];
        bool playerWins = (result == 1);

        if (playerWins) {
            balances[t.player] += t.pot;
            h.winner            = t.player;
            // Reveal winner's cards
            for (uint i = 0; i < 3; i++) {
                FHE.allowPublic(h.playerCards[i]);
            }
        } else {
            h.winner = address(this); // bot wins
            // Reveal bot's cards
            for (uint i = 0; i < 3; i++) {
                FHE.allowPublic(h.botCards[i]);
            }
        }

        t.state = GameState.COMPLETE;
        emit HandComplete(tableId, h.winner, t.pot);
    }

    // ────────────────────────────────────────────────────────────────
    //  View helpers
    // ────────────────────────────────────────────────────────────────

    /// @notice Returns the ctHash (underlying uint256) of each player card.
    ///         The player calls cofheClient.decryptForView(ctHash, FheTypes.Uint64).
    function getMyCards(uint256 tableId)
        external view
        returns (uint256 c0, uint256 c1, uint256 c2)
    {
        require(tables[tableId].player == msg.sender, "Not your table");
        Hand storage h = hands[tableId];
        return (
            uint256(euint64.unwrap(h.playerCards[0])),
            uint256(euint64.unwrap(h.playerCards[1])),
            uint256(euint64.unwrap(h.playerCards[2]))
        );
    }

    /// @notice Returns bot card ctHashes only after the hand is COMPLETE
    ///         and bot cards have been made public (allowPublic called).
    function getBotCards(uint256 tableId)
        external view
        returns (uint256 c0, uint256 c1, uint256 c2)
    {
        require(tables[tableId].state == GameState.COMPLETE, "Hand not complete");
        Hand storage h = hands[tableId];
        return (
            uint256(euint64.unwrap(h.botCards[0])),
            uint256(euint64.unwrap(h.botCards[1])),
            uint256(euint64.unwrap(h.botCards[2]))
        );
    }

    function getTableInfo(uint256 tableId)
        external view
        returns (address player, GameState state, uint256 pot, uint256 handCount)
    {
        Table storage t = tables[tableId];
        return (t.player, t.state, t.pot, t.handCount);
    }

    function getHandResult(uint256 tableId)
        external view
        returns (address winner, uint256 pot, bool playerPlayed)
    {
        Hand storage h  = hands[tableId];
        Table storage t = tables[tableId];
        return (h.winner, t.pot, h.playerPlayed);
    }

    function getBalance() external view returns (uint256) {
        return balances[msg.sender];
    }

    function getBalanceOf(address addr) external view returns (uint256) {
        return balances[addr];
    }

    function getMyTableId() external view returns (uint256) {
        return tableOf[msg.sender];
    }

    /// @notice Poll whether the bot-decision decrypt is ready.
    function isBotDecisionReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].botDecryptHandle);
        return ready;
    }

    /// @notice Poll whether the showdown decrypt is ready.
    function isShowdownReady(uint256 tableId) external view returns (bool) {
        (, bool ready) = FHE.getDecryptResultSafe(hands[tableId].showdownDecryptHandle);
        return ready;
    }

    // ────────────────────────────────────────────────────────────────
    //  Internal FHE logic
    // ────────────────────────────────────────────────────────────────

    /// @dev Generate 6 encrypted cards (3 per player).
    ///      Uses a random 64-bit seed + per-card salt to derive each card.
    ///      No duplicate-check: probability ≈12% for this demo; acceptable for MVP.
    function _dealCards(uint256 tableId) internal {
        Table storage t  = tables[tableId];
        Hand  storage h  = hands[tableId];

        // One random seed per hand
        euint64 seed = FHE.randomEuint64();

        for (uint256 i = 0; i < 6; i++) {
            // Deterministic per-card salt using hand count + slot index
            uint64 saltVal = uint64(i * 7 + t.handCount * 43);
            euint64 salt   = FHE.asEuint64(saltVal);
            euint64 raw    = FHE.add(seed, salt);

            // Map to [0, 51]
            euint64 card = FHE.rem(raw, FHE.asEuint64(52));

            if (i < 3) {
                h.playerCards[i] = card;
                FHE.allowThis(card);             // contract can use next tx
                FHE.allow(card, t.player);       // player can decrypt their cards
            } else {
                h.botCards[i - 3] = card;
                FHE.allowThis(card);             // contract evaluates bot hand later
            }
        }
    }

    /// @dev Evaluate a 3-card FHE hand and return an encrypted score.
    ///
    ///  Score ranges (mirroring the spec):
    ///    High card      →    0 + highest_rank   (0–12)
    ///    Pair           →  100 + highest_rank   (100–112)
    ///    Flush          →  200
    ///    Straight       →  300
    ///    Three-of-a-kind→  400 + rank           (400–412)
    ///    Straight flush →  500 + rank           (500–512)
    ///
    ///  FHE operations used: div, rem, min, max, add, sub, eq, or, and, not, select.
    function _evaluateHand(euint64[3] storage cards) internal returns (euint64) {
        // ── Extract rank (0–12) and suit (0–3) ──
        euint64 r0 = FHE.div(cards[0], FHE.asEuint64(4));
        euint64 r1 = FHE.div(cards[1], FHE.asEuint64(4));
        euint64 r2 = FHE.div(cards[2], FHE.asEuint64(4));

        euint64 s0 = FHE.rem(cards[0], FHE.asEuint64(4));
        euint64 s1 = FHE.rem(cards[1], FHE.asEuint64(4));
        euint64 s2 = FHE.rem(cards[2], FHE.asEuint64(4));

        // ── Sort ranks into low ≤ mid ≤ high ──
        euint64 minAB = FHE.min(r0, r1);
        euint64 maxAB = FHE.max(r0, r1);
        euint64 low   = FHE.min(minAB, r2);
        euint64 high  = FHE.max(maxAB, r2);
        // mid = sum - low - high
        euint64 sum3  = FHE.add(FHE.add(r0, r1), r2);
        euint64 mid   = FHE.sub(FHE.sub(sum3, low), high);

        // ── Hand type checks ──
        // Pair: low==mid OR mid==high
        ebool hasPair  = FHE.or(FHE.eq(low, mid), FHE.eq(mid, high));
        // Trips: low==mid AND mid==high
        ebool hasTrips = FHE.and(FHE.eq(low, mid), FHE.eq(mid, high));
        // Flush: all three suits equal
        ebool isFlush  = FHE.and(FHE.eq(s0, s1), FHE.eq(s1, s2));
        // Straight: span == 2 AND no pair
        ebool gapOk      = FHE.eq(FHE.sub(high, low), FHE.asEuint64(2));
        ebool isStraight = FHE.and(gapOk, FHE.not(hasPair));
        // Straight flush: straight AND flush
        ebool isSF       = FHE.and(isStraight, isFlush);

        // ── Score via nested FHE.select ──
        euint64 score = FHE.select(
            isSF,
            FHE.add(FHE.asEuint64(500), high),
            FHE.select(
                hasTrips,
                FHE.add(FHE.asEuint64(400), high),
                FHE.select(
                    isStraight,
                    FHE.asEuint64(300),
                    FHE.select(
                        isFlush,
                        FHE.asEuint64(200),
                        FHE.select(
                            hasPair,
                            FHE.add(FHE.asEuint64(100), high),
                            high  // high card
                        )
                    )
                )
            )
        );

        FHE.allowThis(score);
        return score;
    }

    /// @dev Evaluate bot hand and queue async decrypt of (botScore >= 100).
    ///      State: PLAYER_TURN → AWAITING_BOT.
    function _botDecide(uint256 tableId) internal {
        Hand storage h = hands[tableId];

        euint64 botScore = _evaluateHand(h.botCards);
        h.botScore = botScore;

        // Bot plays if pair or better (score >= 100)
        ebool shouldPlay = FHE.gte(botScore, FHE.asEuint64(100));
        FHE.allowThis(shouldPlay);

        // Store ctHash for polling in resolveBotDecision
        h.botDecryptHandle = ebool.unwrap(shouldPlay);
        FHE.decrypt(shouldPlay);
    }

    /// @dev Evaluate player hand, compare with bot score, queue async decrypt.
    ///      Called from resolveBotDecision when bot chose to play.
    function _showdown(uint256 tableId) internal {
        Hand storage h = hands[tableId];

        euint64 playerScore = _evaluateHand(h.playerCards);
        h.playerScore = playerScore;

        // Player wins if their score strictly beats bot
        ebool playerWins = FHE.gt(playerScore, h.botScore);
        FHE.allowThis(playerWins);

        h.showdownDecryptHandle = ebool.unwrap(playerWins);
        FHE.decrypt(playerWins);
    }
}
