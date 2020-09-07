const fs = require("fs");

const croDefiSwapFactoryFromTruffle = JSON.parse(fs.readFileSync("./build/contracts/CroDefiSwapFactory.json", "utf8"));
const croDefiSwapFactoryFromWaffle = JSON.parse(fs.readFileSync("./build/CroDefiSwapFactory.json", "utf8"));
croDefiSwapFactoryFromTruffle.bytecode = croDefiSwapFactoryFromWaffle.bytecode
fs.writeFileSync("./build/contracts/CroDefiSwapFactory.json", JSON.stringify(croDefiSwapFactoryFromTruffle), "utf8");

console.log("[ReplaceFactory] CroDefiSwapFactory Truffle now using bytecode compiled from Waffle!")
