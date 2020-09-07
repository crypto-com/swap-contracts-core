const fs = require("fs");

const uniswapFactoryFromTruffle = JSON.parse(fs.readFileSync("./build/contracts/CroDefiSwapFactory.json", "utf8"));
const uniswapFactoryFromWaffle = JSON.parse(fs.readFileSync("./build/CroDefiSwapFactory.json", "utf8"));
uniswapFactoryFromTruffle.bytecode = uniswapFactoryFromWaffle.bytecode
fs.writeFileSync("./build/contracts/CroDefiSwapFactory.json", JSON.stringify(uniswapFactoryFromTruffle), "utf8");

console.log("[ReplaceFactory] UniswapFactory Truffle now using bytecode compiled from Waffle!")
