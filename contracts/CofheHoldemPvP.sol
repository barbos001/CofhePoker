// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title CofheHoldemPvP — Full Texas Hold'em PvP with FHE
/// @notice Improvements over v1:
///   - Dealer button rotation (handCount % 2)
///   - All-in support with call capping
///   - Dynamic min raise (= last raise size or BB)
///   - Pot split on tie (FHE.eq check)
///   - On-chain timeout (block-based auto-forfeit)
///   - actions_this_round counter (Linera pattern)
///   - Side pot tracking for all-in scenarios
contract CofheHoldemPvP {

    uint256 public constant SB              = 5;
    uint256 public constant BB              = 10;
    uint256 public constant INITIAL_BALANCE = 1000;
    uint256 public constant MIN_BUY_IN      = 10;
    uint256 public constant MAX_BUY_IN      = 500;
    uint256 public constant TIMEOUT_BLOCKS  = 50;  // ~10 min on Sepolia (12s blocks)
    uint256 public constant LOBBY_TIMEOUT   = 150; // ~30 min for seated but not started

    enum GS {
        OPEN, BOTH_SEATED,
        PREFLOP, FLOP, TURN, RIVER,
        AWAITING_SHOWDOWN, COMPLETE
    }

    struct Table {
        address player1;
        address player2;
        GS      state;
        uint256 pot;
        uint256 handCount;
        uint256 buyIn;
        bool    isPrivate;
        bytes32 inviteCode;
        uint256 createdAt;
        bool    exists;
        // ── Betting state ──
        address nextToAct;
        uint256 p1RoundBet;
        uint256 p2RoundBet;
        uint256 p1TotalBet;      // total invested this hand (for side pot)
        uint256 p2TotalBet;
        uint256 currentBet;      // highest bet this round
        uint256 minRaise;        // minimum raise increment
        uint8   actionsThisRound;
        bool    p1AllIn;
        bool    p2AllIn;
        uint256 turnStartBlock;  // for timeout
    }

    struct Hand {
        euint64[2] p1Cards;
        euint64[2] p2Cards;
        euint64[5] community;
        euint64    p1Score;
        euint64    p2Score;
        address    winner;
        bytes32    showdownHandle;
        bytes32    tieHandle;        // for tie detection
        bool       showdownP1Done;
    }

    // ── Signed action for off-chain betting ──
    struct SignedAction {
        uint256 tableId;
        uint256 handId;     // prevents replay across hands
        uint8   round;      // 0=preflop,1=flop,2=turn,3=river
        uint8   seq;        // sequence within round (0=first, 1=response)
        uint8   action;     // 0=check,1=bet,2=raise,3=fold,4=call,5=allin
    }

    // EIP-712 domain
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant ACTION_TYPEHASH = keccak256(
        "SignedAction(uint256 tableId,uint256 handId,uint8 round,uint8 seq,uint8 action)"
    );

    mapping(uint256 => Table) public tables;
    mapping(uint256 => Hand)  internal hands;
    mapping(address => uint256) public seatOf;
    mapping(address => uint256) public balances;
    // Pending signed actions (for async posting)
    mapping(uint256 => bytes) public pendingActionSig;  // tableId → sig from nextToAct
    mapping(uint256 => uint8) public pendingActionType;  // tableId → action code
    mapping(uint256 => bool)  public hasPendingAction;

    uint256[] public openTableIds;
    uint256 public nextTableId = 1;

    event TableCreated(uint256 indexed tableId, address creator, uint256 buyIn, bool isPrivate);
    event PlayerJoined(uint256 indexed tableId, address player);
    event PlayerLeft(uint256 indexed tableId, address player);
    event HandStarted(uint256 indexed tableId, uint256 handId);
    event PlayerAction(uint256 indexed tableId, address player, string action);
    event CommunityRevealed(uint256 indexed tableId, uint8 count);
    event SignedActionPosted(uint256 indexed tableId, address indexed player, uint8 action, bytes signature);
    event HandComplete(uint256 indexed tableId, address winner, uint256 pot);
    event PlayerTimedOut(uint256 indexed tableId, address player);

    // ═══════════════════════════════════════════════════════════════
    //  LOBBY
    // ═══════════════════════════════════════════════════════════════

    function createTable(uint256 buyIn, bool isPrivate) external returns (uint256 tableId) {
        require(buyIn >= MIN_BUY_IN && buyIn <= MAX_BUY_IN, "Invalid buy-in");
        // Auto-clear seat if previous table is finished
        uint256 prevSeat = seatOf[msg.sender];
        if (prevSeat != 0 && tables[prevSeat].state == GS.COMPLETE) {
            seatOf[msg.sender] = 0;
        }
        require(seatOf[msg.sender] == 0, "Already seated");
        if (balances[msg.sender] == 0) balances[msg.sender] = INITIAL_BALANCE;
        require(balances[msg.sender] >= buyIn, "Insufficient balance");

        tableId = nextTableId++;
        bytes32 code = isPrivate ? keccak256(abi.encodePacked(msg.sender, block.timestamp, tableId)) : bytes32(0);

        Table storage t = tables[tableId];
        t.player1 = msg.sender;
        t.state = GS.OPEN;
        t.buyIn = buyIn;
        t.isPrivate = isPrivate;
        t.inviteCode = code;
        t.createdAt = block.timestamp;
        t.exists = true;
        t.minRaise = BB;

        seatOf[msg.sender] = tableId;
        if (!isPrivate) openTableIds.push(tableId);
        emit TableCreated(tableId, msg.sender, buyIn, isPrivate);
    }

    function joinTable(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.exists && t.state == GS.OPEN && !t.isPrivate, "Cannot join");
        _seatPlayer2(tableId, t);
        _removeFromOpen(tableId);
    }

    function joinByInviteCode(uint256 tableId, bytes32 code) external {
        Table storage t = tables[tableId];
        require(t.exists && t.state == GS.OPEN && t.isPrivate, "Cannot join");
        require(t.inviteCode == code, "Invalid invite code");
        _seatPlayer2(tableId, t);
    }

    function leaveTable(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.exists, "No table");
        require(msg.sender == t.player1 || msg.sender == t.player2, "Not seated");
        GS s = t.state;

        if (s == GS.OPEN) {
            // No game, just leave
            _closeTable(tableId);
        } else if (s == GS.BOTH_SEATED) {
            // Seated but not started — leave freely
            if (msg.sender == t.player2) {
                seatOf[t.player2] = 0;
                t.player2 = address(0);
                t.state = GS.OPEN;
                if (!t.isPrivate) openTableIds.push(tableId);
                emit PlayerLeft(tableId, msg.sender);
            } else {
                _closeTable(tableId);
            }
        } else if (s >= GS.PREFLOP && s <= GS.AWAITING_SHOWDOWN) {
            // Active game — leaving = forfeit, opponent gets pot
            address opponent = msg.sender == t.player1 ? t.player2 : t.player1;
            _winByFold(tableId, opponent);
            _unseatBoth(tableId);
        } else if (s == GS.COMPLETE) {
            _unseatBoth(tableId);
        }
    }

    /// @notice Clear seat after game is complete. Anyone at the table can call.
    function unseat(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.state == GS.COMPLETE, "Game not complete");
        require(msg.sender == t.player1 || msg.sender == t.player2, "Not seated");
        seatOf[msg.sender] = 0;
    }

    /// @notice Claim opponent's forfeit if they've been inactive too long.
    ///         Works in BOTH_SEATED (opponent never starts) or active game (opponent AFK).
    function claimAbandoned(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.exists, "No table");
        require(msg.sender == t.player1 || msg.sender == t.player2, "Not seated");

        if (t.state == GS.BOTH_SEATED) {
            // Opponent seated but nobody started for too long
            require(block.number >= t.turnStartBlock + LOBBY_TIMEOUT ||
                    block.timestamp >= t.createdAt + 1800, // 30 min wall clock
                    "Not timed out yet");
            // Refund — no pot was created
            _closeTable(tableId);
        } else if (t.state >= GS.PREFLOP && t.state <= GS.RIVER) {
            // Active game — use normal timeout
            require(t.nextToAct != msg.sender, "You are the one timing out");
            require(block.number >= t.turnStartBlock + TIMEOUT_BLOCKS, "Not timed out yet");

            address winner = msg.sender;
            hands[tableId].winner = winner;
            balances[winner] += t.pot;
            t.state = GS.COMPLETE;
            _unseatBoth(tableId);

            emit PlayerTimedOut(tableId, t.nextToAct);
            emit HandComplete(tableId, winner, t.pot);
        } else if (t.state == GS.AWAITING_SHOWDOWN) {
            // Showdown stuck — refund pot 50/50
            require(block.number >= t.turnStartBlock + TIMEOUT_BLOCKS, "Not timed out yet");
            uint256 half = t.pot / 2;
            balances[t.player1] += half;
            balances[t.player2] += t.pot - half;
            hands[tableId].winner = address(0);
            t.state = GS.COMPLETE;
            _unseatBoth(tableId);
            emit HandComplete(tableId, address(0), t.pot);
        }
    }

    function getOpenTableCount() external view returns (uint256) { return openTableIds.length; }
    function getOpenTables(uint256 off, uint256 lim) external view returns (uint256[] memory) {
        uint256 len = openTableIds.length;
        if (off >= len) return new uint256[](0);
        uint256 end = off + lim > len ? len : off + lim;
        uint256[] memory r = new uint256[](end - off);
        for (uint256 i = off; i < end; i++) r[i - off] = openTableIds[i];
        return r;
    }
    function getInviteCode(uint256 tid) external view returns (bytes32) {
        require(tables[tid].player1 == msg.sender, "Not creator");
        return tables[tid].inviteCode;
    }

    // ═══════════════════════════════════════════════════════════════
    //  START HAND (with dealer rotation)
    // ═══════════════════════════════════════════════════════════════

    function startHand(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.exists && (t.state == GS.BOTH_SEATED || t.state == GS.COMPLETE), "Cannot start");
        require(msg.sender == t.player1 || msg.sender == t.player2, "Not seated");
        require(balances[t.player1] >= BB && balances[t.player2] >= BB, "Insufficient balance");

        t.handCount += 1;

        // Dealer rotation: odd hand → P1 is dealer/SB, even → P2 is dealer/SB
        bool p1IsDealer = (t.handCount % 2 == 1);
        address sbPlayer = p1IsDealer ? t.player1 : t.player2;
        address bbPlayer = p1IsDealer ? t.player2 : t.player1;

        // Post blinds (capped by stack)
        uint256 sbAmt = _min(SB, balances[sbPlayer]);
        uint256 bbAmt = _min(BB, balances[bbPlayer]);
        balances[sbPlayer] -= sbAmt;
        balances[bbPlayer] -= bbAmt;

        t.pot = sbAmt + bbAmt;
        t.state = GS.PREFLOP;
        t.nextToAct = sbPlayer; // SB acts first preflop in heads-up
        t.p1RoundBet = p1IsDealer ? sbAmt : bbAmt;
        t.p2RoundBet = p1IsDealer ? bbAmt : sbAmt;
        t.p1TotalBet = p1IsDealer ? sbAmt : bbAmt;
        t.p2TotalBet = p1IsDealer ? bbAmt : sbAmt;
        t.currentBet = bbAmt;
        t.minRaise = BB;
        t.actionsThisRound = 0;
        t.p1AllIn = (balances[t.player1] == 0);
        t.p2AllIn = (balances[t.player2] == 0);
        t.turnStartBlock = block.number;

        Hand storage h = hands[tableId];
        h.winner = address(0);
        h.showdownP1Done = false;

        _dealCards(tableId);
        emit HandStarted(tableId, t.handCount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PLAYER ACTION — check/bet/raise/fold/call/all-in
    // ═══════════════════════════════════════════════════════════════

    /// @notice Direct action (1 TX per action). action: 0-5
    function act(uint256 tableId, uint8 action) external {
        Table storage t = tables[tableId];
        require(t.exists && t.state >= GS.PREFLOP && t.state <= GS.RIVER, "Not in round");
        require(msg.sender == t.nextToAct, "Not your turn");
        _processAction(tableId, msg.sender, action);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BATCH SUBMIT — process entire round from signed actions (0 FHE)
    //  Reduces TX: both players sign off-chain, one submits all at once
    // ═══════════════════════════════════════════════════════════════

    /// @notice Submit a full round of signed actions in 1 TX.
    ///         Both players sign their actions off-chain (EIP-712).
    ///         Anyone can submit (typically the second player to act).
    /// @param actions Array of actions in sequence [firstActor, secondActor, ...]
    /// @param signatures Corresponding EIP-712 signatures
    /// @param signers Who signed each action
    function submitRound(
        uint256 tableId,
        uint8[] calldata actions,
        bytes[] calldata signatures,
        address[] calldata signers
    ) external {
        require(actions.length == signatures.length && actions.length == signers.length, "Length mismatch");
        require(actions.length >= 1 && actions.length <= 4, "1-4 actions per round");

        Table storage t = tables[tableId];
        require(t.exists && t.state >= GS.PREFLOP && t.state <= GS.RIVER, "Not in round");

        uint8 round = _stateToRound(t.state);

        for (uint256 i = 0; i < actions.length; i++) {
            // Verify signer matches nextToAct
            require(signers[i] == t.nextToAct, "Wrong signer order");

            // Verify EIP-712 signature
            bytes32 structHash = keccak256(abi.encode(
                ACTION_TYPEHASH,
                tableId,
                t.handCount,
                round,
                uint8(i),
                actions[i]
            ));
            bytes32 digest = keccak256(abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                structHash
            ));
            address recovered = _recoverSigner(digest, signatures[i]);
            require(recovered == signers[i], "Invalid signature");

            // Process action (reuse existing logic via internal call)
            _processAction(tableId, signers[i], actions[i]);

            // If game ended (fold) → stop processing
            if (t.state == GS.COMPLETE) return;
        }
    }

    /// @dev Process a single action for a player (extracted from act())
    function _processAction(uint256 tableId, address player, uint8 action) internal {
        Table storage t = tables[tableId];
        bool isP1 = (player == t.player1);
        uint256 myBet = isP1 ? t.p1RoundBet : t.p2RoundBet;
        uint256 oppBet = isP1 ? t.p2RoundBet : t.p1RoundBet;
        uint256 myStack = balances[player];
        address opponent = isP1 ? t.player2 : t.player1;

        if (action == 3) { _winByFold(tableId, opponent); return; }

        if (action == 0) {
            require(myBet >= oppBet, "Must call");
            t.actionsThisRound += 1;
            if (_isRoundComplete(t)) { _advanceRound(tableId); }
            else { t.nextToAct = opponent; t.turnStartBlock = block.number; }
            return;
        }
        if (action == 1) {
            require(myBet == oppBet, "Use raise");
            uint256 betAmt = _min(BB, myStack);
            _deductAndBet(t, isP1, betAmt);
            t.currentBet = isP1 ? t.p1RoundBet : t.p2RoundBet;
            t.minRaise = betAmt;
            t.actionsThisRound += 1;
            t.nextToAct = opponent; t.turnStartBlock = block.number;
            _checkAllIn(t, isP1);
            return;
        }
        if (action == 4) {
            require(oppBet > myBet, "Nothing to call");
            uint256 callAmt = _min(oppBet - myBet, myStack);
            _deductAndBet(t, isP1, callAmt);
            t.actionsThisRound += 1;
            _checkAllIn(t, isP1);
            _advanceRound(tableId);
            return;
        }
        if (action == 2) {
            uint256 callAmt = oppBet > myBet ? oppBet - myBet : 0;
            uint256 raiseAmt = _min(callAmt + t.minRaise, myStack);
            _deductAndBet(t, isP1, raiseAmt);
            uint256 newBet = isP1 ? t.p1RoundBet : t.p2RoundBet;
            t.minRaise = newBet - t.currentBet;
            t.currentBet = newBet;
            t.actionsThisRound += 1;
            t.nextToAct = opponent; t.turnStartBlock = block.number;
            _checkAllIn(t, isP1);
            return;
        }
        if (action == 5) {
            require(myStack > 0, "No chips");
            _deductAndBet(t, isP1, myStack);
            uint256 newBet = isP1 ? t.p1RoundBet : t.p2RoundBet;
            if (newBet > t.currentBet) { t.minRaise = newBet - t.currentBet; t.currentBet = newBet; }
            if (isP1) t.p1AllIn = true; else t.p2AllIn = true;
            t.actionsThisRound += 1;
            bool oppAllIn = isP1 ? t.p2AllIn : t.p1AllIn;
            if (oppAllIn || newBet <= oppBet) { _advanceRound(tableId); }
            else { t.nextToAct = opponent; t.turnStartBlock = block.number; }
            return;
        }
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256("CofheHoldemPvP"),
            block.chainid,
            address(this)
        ));
    }

    function _recoverSigner(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid sig length");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }

    function _stateToRound(GS s) internal pure returns (uint8) {
        if (s == GS.PREFLOP) return 0;
        if (s == GS.FLOP) return 1;
        if (s == GS.TURN) return 2;
        return 3;
    }

    /// @notice Post a signed action cheaply (event only, ~40K gas vs ~80K+ for act()).
    ///         Opponent reads the event, then calls submitRound with both sigs.
    function postSignedAction(uint256 tableId, uint8 action, bytes calldata signature) external {
        Table storage t = tables[tableId];
        require(msg.sender == t.nextToAct, "Not your turn");
        require(t.state >= GS.PREFLOP && t.state <= GS.RIVER, "Not in round");
        // Just emit — no state change, opponent will submit via submitRound
        emit SignedActionPosted(tableId, msg.sender, action, signature);
    }

    /// @notice Get the EIP-712 domain separator (for frontend signing)
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    /// @notice Get the action type hash (for frontend signing)
    function getActionTypeHash() external pure returns (bytes32) {
        return ACTION_TYPEHASH;
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIMEOUT — permissionless, anyone can trigger
    // ═══════════════════════════════════════════════════════════════

    function checkTimeout(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(t.state >= GS.PREFLOP && t.state <= GS.RIVER, "Not in round");
        require(block.number >= t.turnStartBlock + TIMEOUT_BLOCKS, "Not timed out");

        address timedOut = t.nextToAct;
        address winner = timedOut == t.player1 ? t.player2 : t.player1;

        hands[tableId].winner = winner;
        balances[winner] += t.pot;
        t.state = GS.COMPLETE;
        _unseatBoth(tableId);

        emit PlayerTimedOut(tableId, timedOut);
        emit HandComplete(tableId, winner, t.pot);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SHOWDOWN (merged: compute both + compare in 1 TX)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Compute both hands and queue FHE comparison. Single TX.
    ///         ~700 FHE ops, ~35M gas — fits on Sepolia (gas limit 36M+).
    function computeShowdown(uint256 tableId) external {
        require(tables[tableId].state == GS.AWAITING_SHOWDOWN, "Not showdown");
        Hand storage h = hands[tableId];
        require(!h.showdownP1Done, "Already computed");

        h.p1Score = _evalHand7(h.p1Cards, h.community);
        FHE.allowThis(h.p1Score);
        h.p2Score = _evalHand7(h.p2Cards, h.community);
        FHE.allowThis(h.p2Score);

        ebool p1Wins = FHE.gt(h.p1Score, h.p2Score);
        ebool isTie  = FHE.eq(h.p1Score, h.p2Score);
        FHE.allowThis(p1Wins);
        FHE.allowThis(isTie);
        h.showdownHandle = ebool.unwrap(p1Wins);
        h.tieHandle      = ebool.unwrap(isTie);
        FHE.decrypt(p1Wins);
        FHE.decrypt(isTie);
        h.showdownP1Done = true;
    }


    function isShowdownReady(uint256 tableId) external view returns (bool) {
        Hand storage h = hands[tableId];
        (, bool r1) = FHE.getDecryptResultSafe(h.showdownHandle);
        (, bool r2) = FHE.getDecryptResultSafe(h.tieHandle);
        return r1 && r2;
    }

    function resolveShowdown(uint256 tableId) external {
        require(tables[tableId].state == GS.AWAITING_SHOWDOWN, "Not showdown");
        Hand storage h = hands[tableId];
        Table storage t = tables[tableId];

        (uint256 p1WinsVal, bool r1) = FHE.getDecryptResultSafe(h.showdownHandle);
        (uint256 tieVal, bool r2) = FHE.getDecryptResultSafe(h.tieHandle);
        require(r1 && r2, "Not ready");

        if (tieVal == 1) {
            // TIE — split pot
            uint256 half = t.pot / 2;
            uint256 remainder = t.pot - half * 2;
            balances[t.player1] += half;
            balances[t.player2] += half + remainder; // remainder to BB
            h.winner = address(0); // tie marker
        } else if (p1WinsVal == 1) {
            // Side pot logic: P1 wins, but may have bet less
            uint256 p1CanWin = t.p1TotalBet * 2; // max P1 can win = 2x their investment
            uint256 winAmount = _min(p1CanWin, t.pot);
            uint256 returned = t.pot - winAmount;
            balances[t.player1] += winAmount;
            if (returned > 0) balances[t.player2] += returned;
            h.winner = t.player1;
        } else {
            uint256 p2CanWin = t.p2TotalBet * 2;
            uint256 winAmount = _min(p2CanWin, t.pot);
            uint256 returned = t.pot - winAmount;
            balances[t.player2] += winAmount;
            if (returned > 0) balances[t.player1] += returned;
            h.winner = t.player2;
        }

        _revealAllCards(tableId);
        t.state = GS.COMPLETE;
        _unseatBoth(tableId);
        emit HandComplete(tableId, h.winner, t.pot);
    }

    function fold(uint256 tableId) external {
        Table storage t = tables[tableId];
        require(msg.sender == t.player1 || msg.sender == t.player2, "Not seated");
        require(t.state >= GS.PREFLOP && t.state <= GS.AWAITING_SHOWDOWN, "Can't fold");
        address opp = msg.sender == t.player1 ? t.player2 : t.player1;
        _winByFold(tableId, opp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW
    // ═══════════════════════════════════════════════════════════════

    function getTableInfo(uint256 tid) external view returns (
        address player1, address player2, uint8 state, uint256 pot,
        uint256 handCount, uint256 buyIn, bool isPrivate, address nextToAct
    ) {
        Table storage t = tables[tid];
        return (t.player1, t.player2, uint8(t.state), t.pot,
                t.handCount, t.buyIn, t.isPrivate, t.nextToAct);
    }

    function getBettingState(uint256 tid) external view returns (
        uint256 p1Bet, uint256 p2Bet, uint256 curBet, uint256 minRaise,
        bool p1AllIn, bool p2AllIn, uint8 actions, uint256 turnBlock
    ) {
        Table storage t = tables[tid];
        return (t.p1RoundBet, t.p2RoundBet, t.currentBet, t.minRaise,
                t.p1AllIn, t.p2AllIn, t.actionsThisRound, t.turnStartBlock);
    }

    function getMyCards(uint256 tid) external view returns (uint256 c0, uint256 c1) {
        Hand storage h = hands[tid];
        if (msg.sender == tables[tid].player1)
            return (uint256(euint64.unwrap(h.p1Cards[0])), uint256(euint64.unwrap(h.p1Cards[1])));
        return (uint256(euint64.unwrap(h.p2Cards[0])), uint256(euint64.unwrap(h.p2Cards[1])));
    }

    function getOpponentCards(uint256 tid) external view returns (uint256 c0, uint256 c1) {
        require(tables[tid].state == GS.COMPLETE, "Not revealed");
        Hand storage h = hands[tid];
        if (msg.sender == tables[tid].player1)
            return (uint256(euint64.unwrap(h.p2Cards[0])), uint256(euint64.unwrap(h.p2Cards[1])));
        return (uint256(euint64.unwrap(h.p1Cards[0])), uint256(euint64.unwrap(h.p1Cards[1])));
    }

    function getCommunityCards(uint256 tid) external view returns (
        uint256 c0, uint256 c1, uint256 c2, uint256 c3, uint256 c4
    ) {
        Hand storage h = hands[tid];
        return (
            uint256(euint64.unwrap(h.community[0])), uint256(euint64.unwrap(h.community[1])),
            uint256(euint64.unwrap(h.community[2])), uint256(euint64.unwrap(h.community[3])),
            uint256(euint64.unwrap(h.community[4]))
        );
    }

    function getResult(uint256 tid) external view returns (address winner, uint256 pot) {
        return (hands[tid].winner, tables[tid].pot);
    }
    function getBalance() external view returns (uint256) { return balances[msg.sender]; }
    function getBalanceOf(address a) external view returns (uint256) { return balances[a]; }
    function getMySeat() external view returns (uint256) { return seatOf[msg.sender]; }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _closeTable(uint256 tableId) internal {
        Table storage t = tables[tableId];
        seatOf[t.player1] = 0;
        if (t.player2 != address(0)) seatOf[t.player2] = 0;
        t.state = GS.COMPLETE;
        _removeFromOpen(tableId);
        emit PlayerLeft(tableId, msg.sender);
    }

    function _unseatBoth(uint256 tableId) internal {
        Table storage t = tables[tableId];
        seatOf[t.player1] = 0;
        if (t.player2 != address(0)) seatOf[t.player2] = 0;
    }

    function _deductAndBet(Table storage t, bool isP1, uint256 amt) internal {
        balances[isP1 ? t.player1 : t.player2] -= amt;
        if (isP1) { t.p1RoundBet += amt; t.p1TotalBet += amt; }
        else      { t.p2RoundBet += amt; t.p2TotalBet += amt; }
        t.pot += amt;
    }

    function _checkAllIn(Table storage t, bool isP1) internal {
        if (balances[isP1 ? t.player1 : t.player2] == 0) {
            if (isP1) t.p1AllIn = true; else t.p2AllIn = true;
        }
    }

    function _isRoundComplete(Table storage t) internal view returns (bool) {
        // Round done when: both acted (actions >= 2) AND bets matched
        if (t.actionsThisRound < 2) return false;
        return t.p1RoundBet == t.p2RoundBet || t.p1AllIn || t.p2AllIn;
    }

    function _winByFold(uint256 tableId, address winner) internal {
        Table storage t = tables[tableId];
        hands[tableId].winner = winner;
        balances[winner] += t.pot;
        t.state = GS.COMPLETE;
        _unseatBoth(tableId);
        _revealAllCards(tableId);
        emit PlayerAction(tableId, msg.sender, "fold");
        emit HandComplete(tableId, winner, t.pot);
    }

    function _advanceRound(uint256 tableId) internal {
        Table storage t = tables[tableId];
        Hand storage h = hands[tableId];

        // If both all-in, skip remaining rounds → showdown
        if (t.p1AllIn && t.p2AllIn) {
            // Reveal all remaining community cards
            for (uint256 i = 0; i < 5; i++) FHE.allowPublic(h.community[i]);
            t.state = GS.AWAITING_SHOWDOWN;
            emit CommunityRevealed(tableId, 5);
            return;
        }

        // Reset round state
        t.p1RoundBet = 0;
        t.p2RoundBet = 0;
        t.currentBet = 0;
        t.minRaise = BB;
        t.actionsThisRound = 0;
        t.turnStartBlock = block.number;

        // Determine who acts first post-flop (non-dealer = BB)
        bool p1IsDealer = (t.handCount % 2 == 1);
        address firstActor = p1IsDealer ? t.player2 : t.player1;

        // If first actor is all-in, other acts
        if ((firstActor == t.player1 && t.p1AllIn) || (firstActor == t.player2 && t.p2AllIn)) {
            firstActor = firstActor == t.player1 ? t.player2 : t.player1;
        }

        if (t.state == GS.PREFLOP) {
            for (uint256 i = 0; i < 3; i++) FHE.allowPublic(h.community[i]);
            t.state = GS.FLOP;
            t.nextToAct = firstActor;
            emit CommunityRevealed(tableId, 3);
        } else if (t.state == GS.FLOP) {
            FHE.allowPublic(h.community[3]);
            t.state = GS.TURN;
            t.nextToAct = firstActor;
            emit CommunityRevealed(tableId, 1);
        } else if (t.state == GS.TURN) {
            FHE.allowPublic(h.community[4]);
            t.state = GS.RIVER;
            t.nextToAct = firstActor;
            emit CommunityRevealed(tableId, 1);
        } else if (t.state == GS.RIVER) {
            t.state = GS.AWAITING_SHOWDOWN;
        }
    }

    function _seatPlayer2(uint256 tableId, Table storage t) internal {
        require(msg.sender != t.player1, "Can't join own");
        // Auto-clear finished seat
        uint256 ps = seatOf[msg.sender];
        if (ps != 0 && tables[ps].state == GS.COMPLETE) seatOf[msg.sender] = 0;
        require(seatOf[msg.sender] == 0, "Already seated");
        if (balances[msg.sender] == 0) balances[msg.sender] = INITIAL_BALANCE;
        require(balances[msg.sender] >= t.buyIn, "Insufficient balance");
        t.player2 = msg.sender;
        t.state = GS.BOTH_SEATED;
        t.turnStartBlock = block.number; // for lobby timeout tracking
        seatOf[msg.sender] = tableId;
        emit PlayerJoined(tableId, msg.sender);
    }

    function _removeFromOpen(uint256 tableId) internal {
        for (uint256 i = 0; i < openTableIds.length; i++) {
            if (openTableIds[i] == tableId) {
                openTableIds[i] = openTableIds[openTableIds.length - 1];
                openTableIds.pop();
                return;
            }
        }
    }

    function _revealAllCards(uint256 tableId) internal {
        Hand storage h = hands[tableId];
        for (uint256 i = 0; i < 2; i++) {
            FHE.allowPublic(h.p1Cards[i]);
            FHE.allowPublic(h.p2Cards[i]);
        }
        for (uint256 i = 0; i < 5; i++) FHE.allowPublic(h.community[i]);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) { return a < b ? a : b; }

    // ═══════════════════════════════════════════════════════════════
    //  CARD DEALING (3 independent seeds)
    // ═══════════════════════════════════════════════════════════════

    function _dealCards(uint256 tableId) internal {
        Table storage t = tables[tableId];
        Hand  storage h = hands[tableId];
        euint64 s1 = FHE.randomEuint64();
        euint64 s2 = FHE.randomEuint64();
        euint64 s3 = FHE.randomEuint64();
        euint64 m  = FHE.asEuint64(52);

        for (uint256 i = 0; i < 2; i++) {
            euint64 c = FHE.rem(FHE.add(s1, FHE.asEuint64(uint64(i*7))), m);
            FHE.allowThis(c); FHE.allow(c, t.player1); h.p1Cards[i] = c;
        }
        for (uint256 i = 0; i < 2; i++) {
            euint64 c = FHE.rem(FHE.add(s2, FHE.asEuint64(uint64(i*7))), m);
            FHE.allowThis(c); FHE.allow(c, t.player2); h.p2Cards[i] = c;
        }
        for (uint256 i = 0; i < 5; i++) {
            euint64 c = FHE.rem(FHE.add(s3, FHE.asEuint64(uint64(i*7))), m);
            FHE.allowThis(c); h.community[i] = c;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  7-CARD EVALUATION
    // ═══════════════════════════════════════════════════════════════

    function _evalHand7(euint64[2] storage hole, euint64[5] storage comm)
        internal returns (euint64)
    {
        euint64 four = FHE.asEuint64(4);
        euint64 one  = FHE.asEuint64(1);
        euint64 zero = FHE.asEuint64(0);
        euint64 fourteen = FHE.asEuint64(14);

        euint64[7] memory r; euint64[7] memory s;
        r[0]=FHE.div(hole[0],four); s[0]=FHE.rem(hole[0],four);
        r[1]=FHE.div(hole[1],four); s[1]=FHE.rem(hole[1],four);
        for(uint256 i=0;i<5;i++){r[i+2]=FHE.div(comm[i],four);s[i+2]=FHE.rem(comm[i],four);}

        euint64[7] memory mc; for(uint256 i=0;i<7;i++) mc[i]=zero;
        euint64 totalPc=zero;
        for(uint256 i=0;i<7;i++) for(uint256 j=i+1;j<7;j++){
            euint64 eq_=FHE.select(FHE.eq(r[i],r[j]),one,zero);
            mc[i]=FHE.add(mc[i],eq_); mc[j]=FHE.add(mc[j],eq_); totalPc=FHE.add(totalPc,eq_);
        }
        euint64 maxMc=mc[0]; for(uint256 i=1;i<7;i++) maxMc=FHE.max(maxMc,mc[i]);

        euint64[4] memory sc; for(uint256 si=0;si<4;si++){
            sc[si]=zero; euint64 sv=FHE.asEuint64(uint64(si));
            for(uint256 ci=0;ci<7;ci++) sc[si]=FHE.add(sc[si],FHE.select(FHE.eq(s[ci],sv),one,zero));
        }
        euint64 ms=sc[0]; for(uint256 i=1;i<4;i++) ms=FHE.max(ms,sc[i]);
        ebool isFlush=FHE.gte(ms,FHE.asEuint64(5));

        euint64[7] memory sr; for(uint256 i=0;i<7;i++) sr[i]=r[i];
        for(uint256 p=6;p>=1;p--) for(uint256 i=0;i<p;i++){
            euint64 lo=FHE.min(sr[i],sr[i+1]); euint64 hi=FHE.max(sr[i],sr[i+1]);
            sr[i]=lo; sr[i+1]=hi;
        }
        ebool isStraight=FHE.asEbool(false); euint64 sHigh=zero;
        for(uint256 w=0;w<3;w++){
            ebool wS=FHE.and(FHE.eq(FHE.sub(sr[w+4],sr[w]),FHE.asEuint64(4)),
                FHE.and(FHE.and(FHE.ne(sr[w],sr[w+1]),FHE.ne(sr[w+1],sr[w+2])),
                        FHE.and(FHE.ne(sr[w+2],sr[w+3]),FHE.ne(sr[w+3],sr[w+4]))));
            sHigh=FHE.select(wS,sr[w+4],sHigh); isStraight=FHE.or(isStraight,wS);
        }
        ebool al=FHE.and(FHE.eq(sr[6],FHE.asEuint64(12)),
            FHE.and(FHE.and(FHE.eq(sr[0],zero),FHE.eq(sr[1],one)),
                    FHE.and(FHE.eq(sr[2],FHE.asEuint64(2)),FHE.eq(sr[3],FHE.asEuint64(3)))));
        isStraight=FHE.or(isStraight,al); sHigh=FHE.select(al,FHE.asEuint64(3),sHigh);

        euint64 ht=zero;
        ht=FHE.select(FHE.gte(totalPc,one),one,ht);
        ht=FHE.select(FHE.gte(totalPc,FHE.asEuint64(2)),FHE.asEuint64(2),ht);
        ht=FHE.select(FHE.and(FHE.gte(totalPc,FHE.asEuint64(3)),FHE.gte(maxMc,FHE.asEuint64(2))),FHE.asEuint64(3),ht);
        ht=FHE.select(FHE.and(isStraight,FHE.lte(ht,FHE.asEuint64(3))),FHE.asEuint64(4),ht);
        ht=FHE.select(FHE.and(isFlush,FHE.lte(ht,FHE.asEuint64(4))),FHE.asEuint64(5),ht);
        ht=FHE.select(FHE.and(FHE.gte(totalPc,FHE.asEuint64(4)),FHE.lte(maxMc,FHE.asEuint64(2))),FHE.asEuint64(6),ht);
        ht=FHE.select(FHE.gte(maxMc,FHE.asEuint64(3)),FHE.asEuint64(7),ht);
        ht=FHE.select(FHE.and(FHE.and(isStraight,isFlush),FHE.eq(totalPc,zero)),FHE.asEuint64(8),ht);

        euint64[7] memory adj;
        for(uint256 i=0;i<7;i++) adj[i]=FHE.add(r[i],FHE.mul(mc[i],fourteen));
        for(uint256 p=6;p>=1;p--) for(uint256 i=0;i<p;i++){
            euint64 lo=FHE.min(adj[i],adj[i+1]); euint64 hi=FHE.max(adj[i],adj[i+1]);
            adj[i]=lo; adj[i+1]=hi;
        }

        euint64 score=FHE.mul(ht,FHE.asEuint64(10_000_000_000));
        score=FHE.add(score,FHE.mul(adj[6],FHE.asEuint64(100_000_000)));
        score=FHE.add(score,FHE.mul(adj[5],FHE.asEuint64(1_000_000)));
        score=FHE.add(score,FHE.mul(adj[4],FHE.asEuint64(10_000)));
        score=FHE.add(score,FHE.mul(adj[3],FHE.asEuint64(100)));
        score=FHE.add(score,adj[2]);
        FHE.allowThis(score);
        return score;
    }
}
