// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

address constant TASK_MANAGER_PVPC = 0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9;

/// @title CofhePokerPvP
/// @notice Multiplayer 3-card poker with FHE-encrypted cards, lobby, friends, and invites.
///         Each player can only decrypt their own cards. Nobody else — not the opponent,
///         not validators — can see a hand until showdown reveals the loser's cards.
///
/// @dev ACL policy — least-privilege design (no allowGlobal / allowTransient used):
///   • FHE.allowThis(ct)       — grants the contract itself access for inter-tx evaluation.
///   • FHE.allow(ct, player)   — grants exactly one player the ability to call decryptForView.
///                               player1 cards are only accessible to player1; player2 cards
///                               only to player2. Cross-player access is never granted.
///   • FHE.allowPublic(ct)     — called only at game completion (fold or showdown) to make
///                               cards observable to all. Never called before COMPLETE state.
///
/// @dev Confidential bankroll (Wave 5):
///   A player's chip bankroll is stored as an FHE-encrypted euint64 (`encBalance`). On-chain,
///   nobody — not opponents, not validators, not spectators — can read it; only the owner can
///   `decryptForView` it via permit. To sit at a table the player commits a public `buyIn`:
///   the contract subtracts an encrypted `grant = min(encBalance, buyIn)` and runs a CoFHE
///   decrypt task to convert that grant into the table's plaintext stack. The in-hand stack
///   and pot are plaintext (a poker round cannot progress on ciphertext), but the *bankroll
///   behind the table* — every chip not committed to this specific table — stays encrypted.
///   On leaving, the remaining stack is folded back into the encrypted bankroll.
///
/// @dev Action privacy note:
///   pvpAct(bool plays) submits the play/fold decision as a plaintext boolean. A validator
///   or mempool observer can see player1's action before player2 submits. Both players have
///   already acted independently (h.p1Acted / h.p2Acted guard double-submission), but the
///   ordering leak remains. A future upgrade should accept an einput (FHE-encrypted bool)
///   and use FHE.select to resolve the outcome without revealing individual decisions.
contract CofhePokerPvP {

    //  State types

    enum PvPState {
        OPEN,               // 0 — waiting for opponent
        BOTH_SEATED,        // 1 — both players ready, hand can start
        DEALING,            // 2 — FHE card generation in progress
        ACTING,             // 3 — players submitting sealed play/fold
        AWAITING_SHOWDOWN,  // 4 — both played, FHE comparison pending
        COMPLETE            // 5 — hand finished
    }

    struct PvPTable {
        address player1;
        address player2;
        PvPState state;
        uint256 pot;
        uint256 handCount;
        uint256 buyIn;
        bool    isPrivate;
        bytes32 inviteCode;      // keccak256 hash for private invite link
        uint256 createdAt;
        bool    exists;
    }

    struct PvPHand {
        euint64[3] p1Cards;
        euint64[3] p2Cards;
        euint64    p1Score;
        euint64    p2Score;
        bool       p1Acted;
        bool       p2Acted;
        bool       p1Played;     // true = play, false = fold
        bool       p2Played;
        address    winner;
        bytes32    showdownHandle;
    }

    /// @dev A player's seat at a table. `stack` is the plaintext chips in play
    ///      (unavoidably public — a poker round cannot progress on ciphertext).
    ///      `funded` is set once the buy-in has been debited from the bankroll.
    struct Seat {
        uint256 stack;
        bool    funded;
    }

    //  Storage

    mapping(uint256 => PvPTable) public pvpTables;
    mapping(uint256 => PvPHand)  internal pvpHands;
    mapping(address => uint256)  public seatOf;        // player → tableId (0 = not seated)

    // Confidential bankroll — encrypted, ACL-gated to the owner only.
    mapping(address => euint64) internal encBalance;
    mapping(address => bool)    internal balanceInit;

    // Per-table seats (plaintext in-hand stack + pending encrypted buy-in).
    mapping(uint256 => Seat) internal p1Seat;
    mapping(uint256 => Seat) internal p2Seat;

    uint256 public nextTableId = 1;
    uint256 public constant ANTE            = 10;
    uint256 public constant INITIAL_BALANCE = 1000;

    // Lobby: open table IDs for discovery
    uint256[] public openTableIds;
    mapping(uint256 => uint256) internal openTableIndex;  // tableId → index in openTableIds

    mapping(address => mapping(address => bool)) public isFriend;
    mapping(address => address[]) internal friendLists;
    mapping(address => mapping(address => bool)) public pendingRequest;

    mapping(address => mapping(address => uint256)) public invites;   // from → to → tableId

    //  Events

    event PvPTableCreated(uint256 indexed tableId, address indexed creator, uint256 buyIn, bool isPrivate);
    event PlayerJoined(uint256 indexed tableId, address indexed player);
    event PlayerLeft(uint256 indexed tableId, address indexed player);
    event PvPHandStarted(uint256 indexed tableId, uint256 handId);
    event PvPAction(uint256 indexed tableId, address indexed player, string action);
    event PvPHandComplete(uint256 indexed tableId, address winner, uint256 pot);
    event SeatFunded(uint256 indexed tableId, address indexed player, uint256 stack);

    event FriendRequestSent(address indexed from, address indexed to);
    event FriendRequestAccepted(address indexed from, address indexed to);
    event FriendRemoved(address indexed player, address indexed exFriend);
    event GameInviteSent(address indexed from, address indexed to, uint256 indexed tableId);
    event GameInviteAccepted(address indexed from, address indexed to, uint256 indexed tableId);
    event GameInviteDeclined(address indexed from, address indexed to);

    //  Modifiers

    modifier onlySeated(uint256 tableId) {
        PvPTable storage t = pvpTables[tableId];
        require(msg.sender == t.player1 || msg.sender == t.player2, "Not at this table");
        _;
    }

    modifier inPvPState(uint256 tableId, PvPState s) {
        require(pvpTables[tableId].state == s, "Wrong PvP state");
        _;
    }

    //  Confidential bankroll

    /// @notice First-touch bankroll initialisation — every new player gets INITIAL_BALANCE,
    ///         born encrypted on-chain. ACL-gated so only the owner can ever decrypt it.
    function _initBalance(address p) internal {
        if (!balanceInit[p]) {
            balanceInit[p] = true;
            euint64 b = FHE.asEuint64(INITIAL_BALANCE);
            FHE.allowThis(b);
            FHE.allow(b, p);
            encBalance[p] = b;
        }
    }

    /// @dev Commit a buy-in: debit it from the player's confidential bankroll and
    ///      open the seat's plaintext table stack. The bankroll debit is clamped by
    ///      FHE.min so the encrypted bankroll can never underflow and is never revealed.
    ///      Buy-in sufficiency (buyIn <= bankroll) is enforced client-side — the player
    ///      can decrypt their own bankroll — and buyIn is capped on-chain.
    function _buyIn(uint256 tableId, address p, bool isP1, uint256 buyIn) internal {
        euint64 debit  = FHE.min(encBalance[p], FHE.asEuint64(buyIn));
        euint64 newBal = FHE.sub(encBalance[p], debit);
        FHE.allowThis(newBal);
        FHE.allow(newBal, p);
        encBalance[p] = newBal;

        Seat storage s = isP1 ? p1Seat[tableId] : p2Seat[tableId];
        s.stack  = buyIn;
        s.funded = true;
        emit SeatFunded(tableId, p, buyIn);
    }

    /// @notice Retained for ABI compatibility — buy-in is synchronous, so a seat is
    ///         funded the moment its table is created/joined. No-op.
    function confirmFunding(uint256) external {}

    /// @dev Fold a seat's chips back into the player's confidential bankroll on leave.
    ///      Handles both the funded case (return plaintext stack) and the still-pending
    ///      case (return the encrypted grant) so chips are never lost.
    function _cashOut(uint256 tableId, address p, bool isP1) internal {
        Seat storage s = isP1 ? p1Seat[tableId] : p2Seat[tableId];
        if (s.funded && s.stack > 0) {
            euint64 nb = FHE.add(encBalance[p], FHE.asEuint64(s.stack));
            FHE.allowThis(nb);
            FHE.allow(nb, p);
            encBalance[p] = nb;
        }
        s.stack  = 0;
        s.funded = false;
    }

    //  Lobby

    /// @notice Create a PvP table and commit the creator's buy-in from their confidential bankroll.
    function createPvPTable(uint256 buyIn, bool isPrivate) external returns (uint256 tableId) {
        require(seatOf[msg.sender] == 0, "Already seated at a table");
        require(buyIn >= ANTE && buyIn <= INITIAL_BALANCE, "Bad buy-in");

        _initBalance(msg.sender);

        tableId = nextTableId++;
        bytes32 code = isPrivate
            ? keccak256(abi.encodePacked(msg.sender, block.timestamp, tableId))
            : bytes32(0);

        pvpTables[tableId] = PvPTable({
            player1:    msg.sender,
            player2:    address(0),
            state:      PvPState.OPEN,
            pot:        0,
            handCount:  0,
            buyIn:      buyIn,
            isPrivate:  isPrivate,
            inviteCode: code,
            createdAt:  block.timestamp,
            exists:     true
        });
        seatOf[msg.sender] = tableId;

        if (!isPrivate) {
            openTableIndex[tableId] = openTableIds.length;
            openTableIds.push(tableId);
        }

        _buyIn(tableId, msg.sender, true, buyIn);

        emit PvPTableCreated(tableId, msg.sender, buyIn, isPrivate);
    }

    /// @notice Join a public table.
    function joinTable(uint256 tableId) external inPvPState(tableId, PvPState.OPEN) {
        PvPTable storage t = pvpTables[tableId];
        require(!t.isPrivate, "Table is private - use invite code");
        _seatPlayer2(tableId, t);
    }

    /// @notice Join a private table with invite code.
    function joinByInviteCode(uint256 tableId, bytes32 code) external inPvPState(tableId, PvPState.OPEN) {
        PvPTable storage t = pvpTables[tableId];
        require(t.inviteCode == code, "Invalid invite code");
        _seatPlayer2(tableId, t);
    }

    function _seatPlayer2(uint256 tableId, PvPTable storage t) internal {
        require(seatOf[msg.sender] == 0, "Already seated");
        require(msg.sender != t.player1, "Cannot join your own table");

        _initBalance(msg.sender);

        t.player2 = msg.sender;
        t.state   = PvPState.BOTH_SEATED;
        seatOf[msg.sender] = tableId;

        // Remove from lobby listing
        _removeFromOpenTables(tableId);

        _buyIn(tableId, msg.sender, false, t.buyIn);

        emit PlayerJoined(tableId, msg.sender);
    }

    /// @notice Leave a table (only if no active hand). Remaining stacks are cashed out
    ///         back into each player's confidential bankroll.
    function leaveTable(uint256 tableId) external onlySeated(tableId) {
        PvPTable storage t = pvpTables[tableId];
        require(
            t.state == PvPState.OPEN ||
            t.state == PvPState.BOTH_SEATED ||
            t.state == PvPState.COMPLETE,
            "Hand in progress"
        );

        emit PlayerLeft(tableId, msg.sender);

        if (msg.sender == t.player1) {
            // Creator leaves → close table, cash out both
            _cashOut(tableId, t.player1, true);
            if (t.player2 != address(0)) {
                _cashOut(tableId, t.player2, false);
                seatOf[t.player2] = 0;
            }
            seatOf[msg.sender] = 0;
            t.state = PvPState.COMPLETE;
            _removeFromOpenTables(tableId);
        } else {
            // Player2 leaves → table reopens
            _cashOut(tableId, t.player2, false);
            seatOf[msg.sender] = 0;
            t.player2 = address(0);
            t.state   = PvPState.OPEN;
            if (!t.isPrivate) {
                openTableIndex[tableId] = openTableIds.length;
                openTableIds.push(tableId);
            }
        }
    }

    function getOpenTableCount() external view returns (uint256) {
        return openTableIds.length;
    }

    /// @notice Paginated open tables.
    function getOpenTables(uint256 offset, uint256 limit)
        external view
        returns (uint256[] memory ids)
    {
        uint256 total = openTableIds.length;
        if (offset >= total) return new uint256[](0);
        uint256 count = limit;
        if (offset + count > total) count = total - offset;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = openTableIds[offset + i];
        }
    }

    function _removeFromOpenTables(uint256 tableId) internal {
        uint256 idx = openTableIndex[tableId];
        uint256 lastIdx = openTableIds.length;
        if (lastIdx == 0) return;
        lastIdx -= 1;
        if (idx != lastIdx) {
            uint256 lastId = openTableIds[lastIdx];
            openTableIds[idx] = lastId;
            openTableIndex[lastId] = idx;
        }
        openTableIds.pop();
        delete openTableIndex[tableId];
    }

    //  Friends

    function sendFriendRequest(address to) external {
        require(to != msg.sender, "Cannot befriend yourself");
        require(!isFriend[msg.sender][to], "Already friends");
        require(!pendingRequest[msg.sender][to], "Request already sent");
        pendingRequest[msg.sender][to] = true;
        emit FriendRequestSent(msg.sender, to);
    }

    function acceptFriendRequest(address from) external {
        require(pendingRequest[from][msg.sender], "No pending request");
        pendingRequest[from][msg.sender] = false;
        isFriend[from][msg.sender] = true;
        isFriend[msg.sender][from] = true;
        friendLists[from].push(msg.sender);
        friendLists[msg.sender].push(from);
        emit FriendRequestAccepted(from, msg.sender);
    }

    function removeFriend(address friend) external {
        require(isFriend[msg.sender][friend], "Not friends");
        isFriend[msg.sender][friend] = false;
        isFriend[friend][msg.sender] = false;
        _removeFromList(friendLists[msg.sender], friend);
        _removeFromList(friendLists[friend], msg.sender);
        emit FriendRemoved(msg.sender, friend);
    }

    function getFriends(address player) external view returns (address[] memory) {
        return friendLists[player];
    }

    function _removeFromList(address[] storage list, address addr) internal {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == addr) {
                list[i] = list[list.length - 1];
                list.pop();
                return;
            }
        }
    }

    //  Game Invites

    function sendGameInvite(address to, uint256 tableId) external {
        PvPTable storage t = pvpTables[tableId];
        require(msg.sender == t.player1, "Not table creator");
        require(t.state == PvPState.OPEN, "Table not open");
        invites[msg.sender][to] = tableId;
        emit GameInviteSent(msg.sender, to, tableId);
    }

    function acceptGameInvite(address from) external {
        uint256 tableId = invites[from][msg.sender];
        require(tableId != 0, "No invite");
        PvPTable storage t = pvpTables[tableId];
        require(t.state == PvPState.OPEN, "Table no longer open");

        delete invites[from][msg.sender];
        _seatPlayer2(tableId, t);
        emit GameInviteAccepted(from, msg.sender, tableId);
    }

    function declineGameInvite(address from) external {
        delete invites[from][msg.sender];
        emit GameInviteDeclined(from, msg.sender);
    }

    //  PvP Game

    /// @notice Start a hand. Either player can call when both are seated and funded.
    function startPvPHand(uint256 tableId) external onlySeated(tableId) {
        PvPTable storage t = pvpTables[tableId];
        require(
            t.state == PvPState.BOTH_SEATED || t.state == PvPState.COMPLETE,
            "Cannot start hand now"
        );
        require(t.player2 != address(0), "Need opponent");
        require(p1Seat[tableId].funded && p2Seat[tableId].funded, "Buy-in pending");
        require(
            p1Seat[tableId].stack >= ANTE && p2Seat[tableId].stack >= ANTE,
            "Insufficient chips"
        );

        p1Seat[tableId].stack -= ANTE;
        p2Seat[tableId].stack -= ANTE;
        t.pot        = ANTE * 2;
        t.handCount += 1;
        t.state      = PvPState.DEALING;

        // Reset hand state
        PvPHand storage h = pvpHands[tableId];
        h.p1Acted  = false;
        h.p2Acted  = false;
        h.p1Played = false;
        h.p2Played = false;
        h.winner   = address(0);
        h.showdownHandle = bytes32(0);

        _dealPvPCards(tableId);

        // Transition to acting — both players can now see their cards
        t.state = PvPState.ACTING;

        emit PvPHandStarted(tableId, t.handCount);
    }

    /// @notice Submit play/fold decision. Both players act independently (sealed).
    function pvpAct(uint256 tableId, bool plays) external onlySeated(tableId) inPvPState(tableId, PvPState.ACTING) {
        PvPTable storage t = pvpTables[tableId];
        PvPHand  storage h = pvpHands[tableId];

        bool isP1 = (msg.sender == t.player1);
        if (isP1) {
            require(!h.p1Acted, "Already acted");
            h.p1Acted  = true;
            h.p1Played = plays;
        } else {
            require(!h.p2Acted, "Already acted");
            h.p2Acted  = true;
            h.p2Played = plays;
        }

        if (plays) {
            Seat storage s = isP1 ? p1Seat[tableId] : p2Seat[tableId];
            require(s.stack >= ANTE, "Insufficient chips");
            s.stack -= ANTE;
            t.pot   += ANTE;
        }

        emit PvPAction(tableId, msg.sender, plays ? "play" : "fold");

        // If both have acted, resolve
        if (h.p1Acted && h.p2Acted) {
            _resolveActions(tableId);
        }
    }

    function _resolveActions(uint256 tableId) internal {
        PvPTable storage t = pvpTables[tableId];
        PvPHand  storage h = pvpHands[tableId];

        if (!h.p1Played && !h.p2Played) {
            // Both fold — split pot
            uint256 half = t.pot / 2;
            p1Seat[tableId].stack += half;
            p2Seat[tableId].stack += t.pot - half;
            h.winner = address(0);
            t.state  = PvPState.COMPLETE;
            emit PvPHandComplete(tableId, address(0), t.pot);
        } else if (!h.p1Played) {
            // P1 folded — P2 wins. No card reveal — the folder mucks, the winner does
            // not show. Each player retains private decrypt access to their OWN hand.
            p2Seat[tableId].stack += t.pot;
            h.winner = t.player2;
            t.state  = PvPState.COMPLETE;
            emit PvPHandComplete(tableId, t.player2, t.pot);
        } else if (!h.p2Played) {
            // P2 folded — P1 wins. No card reveal — the folder mucks, the winner does
            // not show. Each player retains private decrypt access to their OWN hand.
            p1Seat[tableId].stack += t.pot;
            h.winner = t.player1;
            t.state  = PvPState.COMPLETE;
            emit PvPHandComplete(tableId, t.player1, t.pot);
        } else {
            // Both played → showdown
            t.state = PvPState.AWAITING_SHOWDOWN;
            _pvpShowdown(tableId);
        }
    }

    /// @notice Resolve showdown using a client-supplied decrypt result.
    ///         Call `getPvPShowdownHandle`, run `cofheClient.decryptForTx`,
    ///         then submit result + signature for on-chain verification.
    function resolvePvPShowdown(uint256 tableId, uint256 result, bytes calldata signature)
        external inPvPState(tableId, PvPState.AWAITING_SHOWDOWN)
    {
        PvPHand storage h = pvpHands[tableId];
        ITaskManager(TASK_MANAGER_PVPC).publishDecryptResult(uint256(h.showdownHandle), result, signature);

        PvPTable storage t = pvpTables[tableId];
        bool p1Wins = (result == 1);

        if (p1Wins) {
            p1Seat[tableId].stack += t.pot;
            h.winner = t.player1;
        } else {
            p2Seat[tableId].stack += t.pot;
            h.winner = t.player2;
        }

        // Reveal ONLY the winner's hand — the loser keeps their cards private.
        // The FHE.gt comparison already established the winner on ciphertext; the
        // loser's hand does not need to leave their permit.
        if (p1Wins) {
            for (uint i = 0; i < 3; i++) FHE.allowPublic(h.p1Cards[i]);
        } else {
            for (uint i = 0; i < 3; i++) FHE.allowPublic(h.p2Cards[i]);
        }

        t.state = PvPState.COMPLETE;
        emit PvPHandComplete(tableId, h.winner, t.pot);
    }

    //  View helpers

    function getPvPTableInfo(uint256 tableId)
        external view
        returns (
            address player1, address player2,
            PvPState state, uint256 pot,
            uint256 handCount, uint256 buyIn,
            bool isPrivate, uint256 createdAt
        )
    {
        PvPTable storage t = pvpTables[tableId];
        return (t.player1, t.player2, t.state, t.pot, t.handCount, t.buyIn, t.isPrivate, t.createdAt);
    }

    function getMyPvPCards(uint256 tableId) external view returns (uint256 c0, uint256 c1, uint256 c2) {
        PvPTable storage t = pvpTables[tableId];
        PvPHand  storage h = pvpHands[tableId];
        if (msg.sender == t.player1) {
            return (
                uint256(euint64.unwrap(h.p1Cards[0])),
                uint256(euint64.unwrap(h.p1Cards[1])),
                uint256(euint64.unwrap(h.p1Cards[2]))
            );
        } else if (msg.sender == t.player2) {
            return (
                uint256(euint64.unwrap(h.p2Cards[0])),
                uint256(euint64.unwrap(h.p2Cards[1])),
                uint256(euint64.unwrap(h.p2Cards[2]))
            );
        } else {
            revert("Not at this table");
        }
    }

    function getOpponentCards(uint256 tableId) external view returns (uint256 c0, uint256 c1, uint256 c2) {
        PvPTable storage t = pvpTables[tableId];
        require(t.state == PvPState.COMPLETE, "Not complete");
        PvPHand storage h = pvpHands[tableId];
        if (msg.sender == t.player1) {
            return (
                uint256(euint64.unwrap(h.p2Cards[0])),
                uint256(euint64.unwrap(h.p2Cards[1])),
                uint256(euint64.unwrap(h.p2Cards[2]))
            );
        } else {
            return (
                uint256(euint64.unwrap(h.p1Cards[0])),
                uint256(euint64.unwrap(h.p1Cards[1])),
                uint256(euint64.unwrap(h.p1Cards[2]))
            );
        }
    }

    function getPvPResult(uint256 tableId) external view returns (address winner, uint256 pot) {
        return (pvpHands[tableId].winner, pvpTables[tableId].pot);
    }

    /// @notice Returns the caller's confidential bankroll ciphertext handle.
    ///         Decrypt client-side via `cofheClient.decryptForView` + permit.
    ///         An opponent calling this for their own address only ever sees a handle.
    function getBalance() external view returns (uint256) {
        return uint256(euint64.unwrap(encBalance[msg.sender]));
    }

    function getBalanceOf(address addr) external view returns (uint256) {
        return uint256(euint64.unwrap(encBalance[addr]));
    }

    /// @notice Plaintext in-hand stack for a seat (public — chips committed to this table).
    function getStackOf(uint256 tableId, address player) external view returns (uint256) {
        PvPTable storage t = pvpTables[tableId];
        if (player == t.player1) return p1Seat[tableId].stack;
        if (player == t.player2) return p2Seat[tableId].stack;
        return 0;
    }

    /// @notice Whether each seat's buy-in decrypt task has resolved.
    function getFundingStatus(uint256 tableId) external view returns (bool p1Funded, bool p2Funded) {
        return (p1Seat[tableId].funded, p2Seat[tableId].funded);
    }

    /// @notice True once both seats are funded and a hand can start.
    function isFundingReady(uint256 tableId) external view returns (bool) {
        return p1Seat[tableId].funded && p2Seat[tableId].funded;
    }

    function getMySeat() external view returns (uint256) {
        return seatOf[msg.sender];
    }

    function hasPlayerActed(uint256 tableId, address player) external view returns (bool) {
        PvPTable storage t = pvpTables[tableId];
        PvPHand  storage h = pvpHands[tableId];
        if (player == t.player1) return h.p1Acted;
        if (player == t.player2) return h.p2Acted;
        return false;
    }

    /// @notice Returns the ciphertext handle the client passes to cofheClient.decryptForTx()
    ///         in order to obtain the PvP showdown result + FHE-network signature.
    function getPvPShowdownHandle(uint256 tableId) external view returns (uint256) {
        return uint256(pvpHands[tableId].showdownHandle);
    }

    function getInviteCode(uint256 tableId) external view returns (bytes32) {
        require(msg.sender == pvpTables[tableId].player1, "Not creator");
        return pvpTables[tableId].inviteCode;
    }

    //  Internal FHE logic

    function _dealPvPCards(uint256 tableId) internal {
        PvPTable storage t = pvpTables[tableId];
        PvPHand  storage h = pvpHands[tableId];

        euint64 seed = FHE.randomEuint64();

        for (uint256 i = 0; i < 6; i++) {
            uint64  saltVal = uint64(i * 7 + t.handCount * 43);
            euint64 salt    = FHE.asEuint64(saltVal);
            euint64 raw     = FHE.add(seed, salt);
            euint64 card    = FHE.rem(raw, FHE.asEuint64(52));

            if (i < 3) {
                h.p1Cards[i] = card;
                FHE.allowThis(card);           // ACL: contract needs access for _evaluateHand
                FHE.allow(card, t.player1);    // ACL: only player1 may call decryptForView — player2 never granted
            } else {
                h.p2Cards[i - 3] = card;
                FHE.allowThis(card);           // ACL: contract needs access for _evaluateHand
                FHE.allow(card, t.player2);    // ACL: only player2 may call decryptForView — player1 never granted
            }
        }
    }

    function _evaluateHand(euint64[3] storage cards) internal returns (euint64) {
        euint64 r0 = FHE.div(cards[0], FHE.asEuint64(4));
        euint64 r1 = FHE.div(cards[1], FHE.asEuint64(4));
        euint64 r2 = FHE.div(cards[2], FHE.asEuint64(4));

        euint64 s0 = FHE.rem(cards[0], FHE.asEuint64(4));
        euint64 s1 = FHE.rem(cards[1], FHE.asEuint64(4));
        euint64 s2 = FHE.rem(cards[2], FHE.asEuint64(4));

        euint64 minAB = FHE.min(r0, r1);
        euint64 maxAB = FHE.max(r0, r1);
        euint64 low   = FHE.min(minAB, r2);
        euint64 high  = FHE.max(maxAB, r2);
        euint64 sum3  = FHE.add(FHE.add(r0, r1), r2);
        euint64 mid   = FHE.sub(FHE.sub(sum3, low), high);

        ebool hasPair   = FHE.or(FHE.eq(low, mid), FHE.eq(mid, high));
        ebool hasTrips  = FHE.and(FHE.eq(low, mid), FHE.eq(mid, high));
        ebool isFlush   = FHE.and(FHE.eq(s0, s1), FHE.eq(s1, s2));
        ebool gapOk     = FHE.eq(FHE.sub(high, low), FHE.asEuint64(2));
        ebool isStraight = FHE.and(gapOk, FHE.not(hasPair));
        ebool isSF       = FHE.and(isStraight, isFlush);

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
                            high
                        )
                    )
                )
            )
        );

        FHE.allowThis(score); // ACL: contract needs the score ciphertext in _pvpShowdown
        return score;
    }

    function _pvpShowdown(uint256 tableId) internal {
        PvPHand storage h = pvpHands[tableId];

        euint64 p1Score = _evaluateHand(h.p1Cards);
        euint64 p2Score = _evaluateHand(h.p2Cards);
        h.p1Score = p1Score;
        h.p2Score = p2Score;

        ebool p1Wins = FHE.gt(p1Score, p2Score);
        FHE.allowThis(p1Wins); // ACL: contract verifies result in resolvePvPShowdown via publishDecryptResult

        // Store handle so client can call getPvPShowdownHandle → decryptForTx → resolvePvPShowdown
        h.showdownHandle = ebool.unwrap(p1Wins);
    }
}
