const fs = require("fs");

const uniswapFactoryFromTruffle = JSON.parse(fs.readFileSync("./build/contracts/UniswapV2Factory.json", "utf8"));
const uniswapFactoryFromWaffle = JSON.parse(fs.readFileSync("./build/UniswapV2Factory.json", "utf8"));
uniswapFactoryFromTruffle.bytecode = uniswapFactoryFromWaffle.bytecode
fs.writeFileSync("./build/contracts/UniswapV2Factory.json", JSON.stringify(uniswapFactoryFromTruffle), "utf8");

console.log("[ReplaceFactory] UniswapFactory Truffle now using bytecode compiled from Waffle!")
