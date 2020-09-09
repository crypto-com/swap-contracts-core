pragma solidity >=0.5.0;

interface ICroDefiSwapFactory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);
    event FeeSetterUpdated(address latestFeeSetter, address previousFeeSetter);
    event FeeToUpdated(address latestFeeTo, address previousFeeTo);
    event FeeToBasisPointUpdated(uint latestFeeToBasisPoint, uint previousFeeToBasisPoint);
    event TotalFeeBasisPointUpdated(uint latestTotalFeeBasisPoint, uint previousTotalFeeBasisPoint);

    function feeTo() external view returns (address);
    function feeToBasisPoint() external view returns (uint);

    // technically must be bigger than or equal to feeToBasisPoint
    function totalFeeBasisPoint() external view returns (uint);

    function feeSetter() external view returns (address);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setFeeTo(address) external;
    function setFeeToBasisPoint(uint) external;
    function setTotalFeeBasisPoint(uint) external;

    function setFeeSetter(address) external;
}
