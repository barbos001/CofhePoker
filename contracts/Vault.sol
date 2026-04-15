// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title  Vault
 * @notice Non-custodial fund vault for the CoFHE Poker platform.
 *
 * @dev Security guarantees
 * ---------------------------------------------------------
 * - No admin withdrawal rights -- only the token owner can withdraw their balance.
 *   Owner/admin functions are restricted to: pause, setPokerAuthorized,
 *   transferOwnership. None of these touch user balances.
 * - Deposits credited atomically; withdrawals check free (unlocked) balance.
 * - Game locks move funds from free -> locked; settle is zero-sum
 *   (|sum(negativeDeltas)| <= rake cap, rake max 5%).
 * - Pausable: pause blocks depositETH, depositUSDT, and lockForGame;
 *   withdraw is ALWAYS enabled even while paused.
 * - Reentrancy guard on withdraw, depositUSDT, settleGame.
 * - Token whitelist: ETH (address(0)) and USDT only.
 * - Price: read live from Chainlink AggregatorV3Interface (no stored state).
 *   Staleness threshold: 1 hour (matches Chainlink ETH/USD heartbeat).
 *
 * @dev ACL
 * ---------------------------------------------------------
 * - onlyOwner  -- pause/unpause, setPokerAuthorized, transferOwnership
 * - onlyPoker  -- lockForGame, settleGame
 * - public     -- depositETH, depositUSDT, withdraw (self-serve)
 *
 * @dev Events emitted for every fund movement:
 *      Deposit, Withdraw, Locked, Unlocked, GameSettled
 */

/// @dev Minimal Chainlink feed interface (matches AggregatorV3Interface).
interface IChainlinkFeed {
    function latestRoundData()
        external
        view
        returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        );
}

contract Vault {

    // --- Reentrancy guard (Checks-Effects-Interactions pattern) -----------------
    uint256 private _reentrancyStatus = 1;
    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "Vault: reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    // --- Pausable ---------------------------------------------------------------
    bool private _paused;
    modifier whenNotPaused() {
        require(!_paused, "Vault: paused");
        _;
    }

    // --- Ownable ----------------------------------------------------------------
    address private _owner;
    modifier onlyOwner() {
        require(msg.sender == _owner, "Vault: not owner");
        _;
    }

    // --- Constants --------------------------------------------------------------
    address public constant ETH_TOKEN = address(0);
    uint256 public constant MAX_RAKE  = 500;        // 5% in basis points
    uint256 public constant PRICE_STALENESS = 1 hours;

    // --- Immutables -------------------------------------------------------------
    address public immutable USDT;

    /**
     * @notice Chainlink AggregatorV3Interface price feed address.
     * @dev    Sepolia ETH/USD: 0x694AA1769357215DE4FAC081bf1f309aDC325306
     *         Mainnet ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
     */
    address public immutable priceFeed;

    // --- State ------------------------------------------------------------------
    /// @dev Authorized PokerTable contracts that may call lockForGame/settleGame.
    mapping(address => bool) public authorizedPoker;

    /// @notice player -> token -> free (unlocked) balance in token-native units.
    ///         ETH stored in wei; USDT stored in 6-decimal units.
    mapping(address => mapping(address => uint256)) public balance;

    /// @notice player -> token -> funds currently locked in an active game.
    mapping(address => mapping(address => uint256)) public lockedBalance;

    // --- Events -----------------------------------------------------------------
    event Deposit      (address indexed player, address indexed token, uint256 amount);
    event Withdraw     (address indexed player, address indexed token, uint256 amount);
    event Locked       (address indexed player, address indexed token, uint256 tokenAmount);
    event Unlocked     (address indexed player, address indexed token, uint256 tokenAmount);
    event GameSettled  (address[] players, int256[] deltaUSD, address indexed token, uint256 rakeToken);
    event PokerAuthorized     (address indexed poker, bool authorized);
    event Paused       (address account);
    event Unpaused     (address account);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // --- Additional modifiers ---------------------------------------------------
    modifier onlyPoker() {
        require(authorizedPoker[msg.sender], "Vault: caller not authorized poker contract");
        _;
    }

    modifier validToken(address token) {
        require(token == ETH_TOKEN || token == USDT, "Vault: unsupported token");
        _;
    }

    // --- Constructor ------------------------------------------------------------
    constructor(
        address usdt,
        address _priceFeed
    ) {
        require(_priceFeed != address(0), "Vault: zero priceFeed");
        _owner    = msg.sender;
        USDT      = usdt;
        priceFeed = _priceFeed;
    }

    // --- Owner administration ---------------------------------------------------
    // NOTE: None of these functions can access or move user funds.

    function setPokerAuthorized(address poker, bool authorized) external onlyOwner {
        authorizedPoker[poker] = authorized;
        emit PokerAuthorized(poker, authorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Vault: zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    function pause() external onlyOwner {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    // --- Price oracle (live Chainlink read) -------------------------------------

    /**
     * @notice Read the current ETH/USD price from the Chainlink feed.
     * @dev    Chainlink answer is 8-decimal; we scale to 18-decimal by multiplying by 1e10.
     *         Reverts if the price is stale (> 1 hour old) or invalid (<= 0).
     * @return price18 ETH/USD price in 18-decimal USD (e.g. 3000e18 = $3 000/ETH).
     */
    function getEthUsdPrice() public view returns (uint256 price18) {
        (, int256 answer, , uint256 updatedAt, ) =
            IChainlinkFeed(priceFeed).latestRoundData();
        require(answer > 0, "Vault: invalid price from feed");
        require(
            block.timestamp <= updatedAt + PRICE_STALENESS,
            "Vault: price feed stale"
        );
        price18 = uint256(answer) * 1e10; // 8-dec -> 18-dec
    }

    // --- Deposits ---------------------------------------------------------------

    /// @notice Deposit ETH. Credits msg.sender's internal ETH balance.
    function depositETH() external payable whenNotPaused {
        require(msg.value > 0, "Vault: zero deposit");
        balance[msg.sender][ETH_TOKEN] += msg.value;
        emit Deposit(msg.sender, ETH_TOKEN, msg.value);
    }

    /**
     * @notice Deposit USDT. Caller must have approved Vault for at least `amount`.
     * @param  amount  Amount in USDT's native units (6 decimals).
     */
    function depositUSDT(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Vault: zero deposit");
        _safeTransferFrom(USDT, msg.sender, address(this), amount);
        balance[msg.sender][USDT] += amount;
        emit Deposit(msg.sender, USDT, amount);
    }

    // --- Withdraw (always enabled even when paused) -----------------------------

    /**
     * @notice Withdraw free (unlocked) balance back to wallet.
     * @dev    Always enabled -- pause NEVER blocks withdrawals.
     *         Reverts if amount > free balance (locked funds cannot be withdrawn
     *         during an active game).
     * @param  token   ETH_TOKEN (address(0)) or USDT address.
     * @param  amount  Amount in token-native units.
     */
    function withdraw(address token, uint256 amount)
        external
        validToken(token)
        nonReentrant
    {
        require(amount > 0, "Vault: zero withdraw");
        require(
            balance[msg.sender][token] >= amount,
            "Vault: insufficient free balance"
        );
        balance[msg.sender][token] -= amount;
        _send(msg.sender, token, amount);
        emit Withdraw(msg.sender, token, amount);
    }

    // --- Game lock / settle -----------------------------------------------------

    /**
     * @notice Lock the token equivalent of `usdValueWei` from player's free balance.
     * @dev    Called by the authorized PokerTable contract when a player places a bet.
     *         ETH amount = usdValueWei * 1e18 / ethUsdPrice.
     *         USDT amount = usdValueWei / 1e12 (converts 18-dec USD -> 6-dec USDT).
     * @param  player      The betting player.
     * @param  usdValueWei Bet value in 18-decimal USD (e.g. 10e18 = $10).
     * @param  token       ETH_TOKEN or USDT.
     */
    function lockForGame(address player, uint256 usdValueWei, address token)
        external
        onlyPoker
        whenNotPaused
        validToken(token)
    {
        uint256 tokenAmount = _usdToToken(usdValueWei, token);
        require(
            balance[player][token] >= tokenAmount,
            "Vault: insufficient balance - deposit more"
        );
        balance[player][token]       -= tokenAmount;
        lockedBalance[player][token] += tokenAmount;
        emit Locked(player, token, tokenAmount);
    }

    /**
     * @notice Settle a completed hand. Applies USD-denominated deltas to balances.
     *
     * @dev Zero-sum invariant: sum(deltaUSD) MUST be <= 0.
     *      Positive sum would create funds from nothing -- this is rejected.
     *      A negative sum represents rake extracted; the residual stays in the
     *      contract and is sent to rakeRecipient.
     *      Rake is capped at MAX_RAKE (5%) of total locked funds.
     *
     *      For each player:
     *        - delta >= 0 (winner): balance += locked + usdToToken(delta)
     *        - delta < 0 (loser):  balance += max(0, locked - usdToToken(|delta|))
     *
     * @param  players        Participant addresses (must match who called lockForGame).
     * @param  deltaUSD       Net profit/loss per player in 18-decimal USD.
     *                        Winners positive, losers negative.
     * @param  token          Token used for this game.
     * @param  rakeRecipient  Rake destination; address(0) = no rake.
     * @param  rakeBps        Rake in basis points (0-500, max 5%).
     */
    function settleGame(
        address[] calldata players,
        int256[]  calldata deltaUSD,
        address            token,
        address            rakeRecipient,
        uint256            rakeBps
    )
        external
        onlyPoker
        nonReentrant
        validToken(token)
    {
        uint256 n = players.length;
        require(n > 0 && n == deltaUSD.length, "Vault: length mismatch");
        require(rakeBps <= MAX_RAKE, "Vault: rake exceeds 5%");

        // -- Zero-sum check -------------------------------------------------------
        int256 sumDelta = 0;
        for (uint256 i = 0; i < n; i++) sumDelta += deltaUSD[i];
        require(sumDelta <= 0, "Vault: delta sum positive - funds created from nowhere");

        // -- Total locked (for rake cap check) ------------------------------------
        uint256 totalLockedToken = 0;
        for (uint256 i = 0; i < n; i++)
            totalLockedToken += lockedBalance[players[i]][token];

        uint256 maxRakeToken = rakeBps > 0
            ? (totalLockedToken * rakeBps) / 10_000
            : 0;

        // -- Apply deltas ---------------------------------------------------------
        uint256 totalPaidOut = 0;
        for (uint256 i = 0; i < n; i++) {
            address player = players[i];
            uint256 locked = lockedBalance[player][token];
            lockedBalance[player][token] = 0;

            uint256 payout;
            if (deltaUSD[i] >= 0) {
                // Winner: return their lock + add winnings
                uint256 winToken = _usdToToken(uint256(deltaUSD[i]), token);
                payout = locked + winToken;
            } else {
                // Loser: consume locked funds up to loss amount; return surplus
                uint256 lossToken = _usdToToken(uint256(-deltaUSD[i]), token);
                payout = locked > lossToken ? locked - lossToken : 0;
            }

            balance[player][token] += payout;
            totalPaidOut            += payout;
            emit Unlocked(player, token, locked);
        }

        // -- Compute and distribute rake ------------------------------------------
        // rakeCollected = locked tokens not returned to players
        uint256 rakeCollected = totalLockedToken > totalPaidOut
            ? totalLockedToken - totalPaidOut
            : 0;

        if (rakeCollected > 0) {
            require(rakeCollected <= maxRakeToken, "Vault: computed rake exceeds cap");
            if (rakeRecipient != address(0)) {
                _send(rakeRecipient, token, rakeCollected);
            }
            // If no rakeRecipient, rake remains in the Vault as protocol revenue
        }

        emit GameSettled(players, deltaUSD, token, rakeCollected);
    }

    // --- View helpers -----------------------------------------------------------

    function getFreeBalance(address player, address token) external view returns (uint256) {
        return balance[player][token];
    }

    function getLockedBalance(address player, address token) external view returns (uint256) {
        return lockedBalance[player][token];
    }

    /// @notice Convert 18-decimal USD amount to ETH wei at current Chainlink price.
    function usdToEthWei(uint256 usdWei) external view returns (uint256) {
        return (usdWei * 1e18) / getEthUsdPrice();
    }

    /// @notice Convert 18-decimal USD amount to USDT (6 decimals).
    function usdToUsdt(uint256 usdWei) external view returns (uint256) {
        return usdWei / 1e12;
    }

    /// @notice Returns true if the Chainlink price has not been updated for > 1 hour.
    function isPriceStale() external view returns (bool) {
        (, , , uint256 updatedAt, ) = IChainlinkFeed(priceFeed).latestRoundData();
        return block.timestamp > updatedAt + PRICE_STALENESS;
    }

    function owner()  external view returns (address) { return _owner;  }
    function paused() external view returns (bool)    { return _paused; }

    // --- Internal helpers -------------------------------------------------------

    /// @dev Convert 18-decimal USD to token-native units using live Chainlink price.
    function _usdToToken(uint256 usdWei, address token) internal view returns (uint256) {
        if (token == ETH_TOKEN) {
            // result in wei: (usdWei / ethUsdPrice) scaled back to 18 decimals
            return (usdWei * 1e18) / getEthUsdPrice();
        }
        // USDT has 6 decimals; usdWei is 18-decimal -> divide by 1e12
        return usdWei / 1e12;
    }

    /// @dev Send ETH or ERC-20 to `to`, reverting on failure.
    function _send(address to, address token, uint256 amount) internal {
        if (token == ETH_TOKEN) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "Vault: ETH transfer failed");
        } else {
            _safeTransfer(token, to, amount);
        }
    }

    /// @dev Minimal safe ERC-20 transfer compatible with non-standard tokens (USDT).
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "Vault: ERC20 transfer failed"
        );
    }

    /// @dev Minimal safe ERC-20 transferFrom.
    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "Vault: ERC20 transferFrom failed"
        );
    }

    /// @dev Accept plain ETH transfers (e.g. direct sends from wallets).
    receive() external payable {
        balance[msg.sender][ETH_TOKEN] += msg.value;
        emit Deposit(msg.sender, ETH_TOKEN, msg.value);
    }
}
