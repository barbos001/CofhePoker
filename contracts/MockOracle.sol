// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title  MockOracle
 * @notice Chainlink AggregatorV3Interface-compatible mock for local / testnet use.
 *
 * @dev    Implements the same latestRoundData() signature as Chainlink price feeds.
 *         Answer is stored in 8-decimal format (matching real Chainlink ETH/USD feeds).
 *         Vault.getEthUsdPrice() scales it to 18-decimal by multiplying by 1e10.
 *
 *         Real Chainlink ETH/USD feeds for reference:
 *           Sepolia mainnet: 0x694AA1769357215DE4FAC081bf1f309aDC325306
 *           Ethereum mainnet: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 *
 *         This contract:
 *           - stores price as int256 in 8-decimal (e.g. 300000000000 = $3000.00000000)
 *           - exposes latestRoundData() matching AggregatorV3Interface exactly
 *           - exposes setPriceImmediate() for test convenience (no time-lock)
 *           - exposes setUpdatedAt() to simulate a stale feed in tests
 */
contract MockOracle {

    address public immutable owner;

    /// @notice Price in 8-decimal format (matches Chainlink ETH/USD).
    ///         e.g. 3000_00000000 = $3 000.00
    int256  public price;
    uint256 public updatedAt;
    uint80  public roundId;

    event PriceSet(int256 newPrice, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "MockOracle: not owner");
        _;
    }

    /**
     * @param initialPrice8Dec Initial ETH/USD price in 8 decimals
     *                         (e.g. 3000_00000000 for $3 000).
     */
    constructor(int256 initialPrice8Dec) {
        require(initialPrice8Dec > 0, "MockOracle: zero initial price");
        owner     = msg.sender;
        price     = initialPrice8Dec;
        updatedAt = block.timestamp;
        roundId   = 1;
    }

    // --- Price updates ----------------------------------------------------------

    /**
     * @notice Set a new ETH/USD price (8-decimal). No time-lock -- for tests only.
     * @param  newPrice8Dec  Price in 8 decimals (e.g. 200000000000 = $2 000).
     */
    function setPriceImmediate(int256 newPrice8Dec) external onlyOwner {
        require(newPrice8Dec > 0, "MockOracle: zero price");
        price     = newPrice8Dec;
        updatedAt = block.timestamp;
        roundId  += 1;
        emit PriceSet(newPrice8Dec, block.timestamp);
    }

    /**
     * @notice Override updatedAt to simulate a stale feed in tests.
     */
    function setUpdatedAt(uint256 ts) external onlyOwner {
        updatedAt = ts;
    }

    // --- AggregatorV3Interface --------------------------------------------------

    /// @notice Returns the number of decimals in the answer (8, matching Chainlink).
    function decimals() external pure returns (uint8) {
        return 8;
    }

    /**
     * @notice Chainlink-compatible price data.
     * @return roundId_        Current round ID.
     * @return answer          Price in 8-decimal USD per ETH.
     * @return startedAt       Round start timestamp (same as updatedAt for mock).
     * @return updatedAt_      Timestamp of the last price update.
     * @return answeredInRound The round in which the answer was computed.
     */
    function latestRoundData()
        external
        view
        returns (
            uint80  roundId_,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt_,
            uint80  answeredInRound
        )
    {
        return (roundId, price, updatedAt, updatedAt, roundId);
    }
}
