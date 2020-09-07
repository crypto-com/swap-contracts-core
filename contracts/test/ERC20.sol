pragma solidity =0.5.16;

import '../CroDefiSwapERC20.sol';

contract ERC20 is CroDefiSwapERC20 {
    constructor(uint _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
