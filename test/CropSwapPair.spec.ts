import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'

import { expandTo18Decimals, mineBlock, encodePrice } from './shared/utilities'
import { pairFixture } from './shared/fixtures'
import { AddressZero } from 'ethers/constants'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('CroDefiSwapPair', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [defaultLiquidityProviderWallet, defaultFeeToWallet, defaultLiquidityTakerWallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [defaultLiquidityProviderWallet, defaultLiquidityTakerWallet])

  let factory: Contract
  let token0: Contract
  let token1: Contract
  let pair: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(pairFixture)
    factory = fixture.factory
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
  })

  it('mint', async () => {
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    // always transfer from defaultLiquidityProviderWallet because of `createFixtureLoader` overrideWallets setting
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidityTokenAmount = expandTo18Decimals(2)
    await expect(pair.mint(defaultLiquidityProviderWallet.address, overrides))
      .to.emit(pair, 'Transfer')
      .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pair, 'Transfer')
      .withArgs(
        AddressZero,
        defaultLiquidityProviderWallet.address,
        expectedLiquidityTokenAmount.sub(MINIMUM_LIQUIDITY)
      )
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, 'Mint')
      .withArgs(defaultLiquidityProviderWallet.address, token0Amount, token1Amount)

    expect(await pair.totalSupply()).to.eq(expectedLiquidityTokenAmount)
    expect(await pair.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      expectedLiquidityTokenAmount.sub(MINIMUM_LIQUIDITY)
    )
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
    // reserve amount equals this round supplied liquidity amount because only supplied liquidity once
    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount)
    expect(reserves[1]).to.eq(token1Amount)

    // provide liquidity one more time with the same amounts on each side of the pair
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(defaultLiquidityProviderWallet.address, overrides)
    const reservesAfterProvidingLiquidityTwice = await pair.getReserves()
    expect(reservesAfterProvidingLiquidityTwice[0]).to.eq(token0Amount.add(token0Amount))
    expect(reservesAfterProvidingLiquidityTwice[1]).to.eq(token1Amount.add(token1Amount))
  })

  async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber, liquidityProviderAddress: string) {
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(liquidityProviderAddress, overrides)
  }

  const swapTestCases: BigNumber[][] = [
    [1, 5, 10, '1662497915624478906'],
    [1, 10, 5, '453305446940074565'],

    [2, 5, 10, '2851015155847869602'],
    [2, 10, 5, '831248957812239453'],

    [1, 10, 10, '906610893880149131'],
    [1, 100, 100, '987158034397061298'],
    [1, 1000, 1000, '996006981039903216']
  ].map(a => a.map(n => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))

  swapTestCases.forEach((swapTestCase, i) => {
    it(`getInputPrice:${i}: should revert when constant product formula condition is not met`, async () => {
      const [swapAmountOfToken0, token0LiquidityAmount, token1LiquidityAmount, swapAmountOfToken1] = swapTestCase
      await addLiquidity(token0LiquidityAmount, token1LiquidityAmount, defaultLiquidityProviderWallet.address)
      await token0.transfer(pair.address, swapAmountOfToken0)
      await expect(
        pair.swap(0, swapAmountOfToken1.add(1), defaultLiquidityTakerWallet.address, '0x', overrides)
      ).to.be.revertedWith('CroDefiSwap: Constant product formula condition not met!')
      await pair.swap(0, swapAmountOfToken1, defaultLiquidityTakerWallet.address, '0x', overrides)
    })
  })

  // TODO this test is bound to change when fee ratio is configurable
  const optimisticTestCases: BigNumber[][] = [
    ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
    ['997000000000000000', 10, 5, 1],
    ['997000000000000000', 5, 5, 1],
    [1, 5, 5, '1003009027081243732'] // given amountOut, amountIn = ceiling(amountOut / .997)
  ].map(a => a.map(n => (typeof n === 'string' ? bigNumberify(n) : expandTo18Decimals(n))))

  optimisticTestCases.forEach((optimisticTestCase, i) => {
    it(`optimistic:${i}: should revert when constant product formula condition is not met`, async () => {
      const [swapAmountOfToken0, token0LiquidityAmount, token1LiquidityAmount, inputAmount] = optimisticTestCase
      await addLiquidity(token0LiquidityAmount, token1LiquidityAmount, defaultLiquidityProviderWallet.address)
      await token0.transfer(pair.address, inputAmount)
      await expect(
        pair.swap(swapAmountOfToken0.add(1), 0, defaultLiquidityTakerWallet.address, '0x', overrides)
      ).to.be.revertedWith('CroDefiSwap: Constant product formula condition not met!')
      await pair.swap(swapAmountOfToken0, 0, defaultLiquidityTakerWallet.address, '0x', overrides)
    })
  })

  it('swap:token0 into pool, token1 out of pool to liquidity taker', async () => {
    const token0AdditionalLiquidityAmount = expandTo18Decimals(5)
    const token1AdditionalLiquidityAmount = expandTo18Decimals(10)
    await addLiquidity(
      token0AdditionalLiquidityAmount,
      token1AdditionalLiquidityAmount,
      defaultLiquidityProviderWallet.address
    )

    const swapInAmountOfToken0 = expandTo18Decimals(1)
    const expectedSwapOutAmountOfToken1 = bigNumberify('1662497915624478906')
    await token0.transfer(pair.address, swapInAmountOfToken0)

    await expect(pair.swap(0, expectedSwapOutAmountOfToken1, defaultLiquidityTakerWallet.address, '0x', overrides))
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, defaultLiquidityTakerWallet.address, expectedSwapOutAmountOfToken1)
      .to.emit(pair, 'Sync')
      .withArgs(
        token0AdditionalLiquidityAmount.add(swapInAmountOfToken0),
        token1AdditionalLiquidityAmount.sub(expectedSwapOutAmountOfToken1)
      )
      .to.emit(pair, 'Swap')
      .withArgs(
        defaultLiquidityProviderWallet.address,
        swapInAmountOfToken0,
        0,
        0,
        expectedSwapOutAmountOfToken1,
        defaultLiquidityTakerWallet.address
      )

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(
      token0AdditionalLiquidityAmount.add(swapInAmountOfToken0),
      'token 0 liquidity reserve should increase'
    )
    expect(reserves[1]).to.eq(
      token1AdditionalLiquidityAmount.sub(expectedSwapOutAmountOfToken1),
      'token 1 liquidity reserve should decrease'
    )

    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()

    expect(await token0.balanceOf(pair.address)).to.eq(
      token0AdditionalLiquidityAmount.add(swapInAmountOfToken0),
      'token 0 balance of this pair contract should increase after this specific swap'
    )
    expect(await token0.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      totalSupplyToken0.sub(token0AdditionalLiquidityAmount).sub(swapInAmountOfToken0),
      "liquidity provider's token 0 balance should decrease after this specific swap"
    )
    // FIXME why liquidity taker's token 0 balance is not affected? :( , why token 0 is not coming from liquidity taker???

    expect(await token1.balanceOf(pair.address)).to.eq(
      token1AdditionalLiquidityAmount.sub(expectedSwapOutAmountOfToken1),
      'token 1 balance of this pair contract should decrease after this specific swap'
    )
    expect(await token1.balanceOf(defaultLiquidityTakerWallet.address)).to.eq(
      expectedSwapOutAmountOfToken1,
      `'liquidity taker\'s token 1 balance should increase from 0 to expectedSwapOutAmountOfToken1 (${expectedSwapOutAmountOfToken1}) after this specific swap'`
    )

    expect(await token1.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      totalSupplyToken1.sub(token1AdditionalLiquidityAmount),
      "liquidity provider's token 1 balance should not change before or after swap event initiated by another liquidity taker"
    )
  })

  it('swap:token1', async () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount, defaultLiquidityProviderWallet.address)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('453305446940074565')
    await token1.transfer(pair.address, swapAmount)
    await expect(pair.swap(expectedOutputAmount, 0, defaultLiquidityProviderWallet.address, '0x', overrides))
      .to.emit(token0, 'Transfer')
      .withArgs(pair.address, defaultLiquidityProviderWallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
      .to.emit(pair, 'Swap')
      .withArgs(
        defaultLiquidityProviderWallet.address,
        0,
        swapAmount,
        expectedOutputAmount,
        0,
        defaultLiquidityProviderWallet.address
      )

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount))
    expect(reserves[1]).to.eq(token1Amount.add(swapAmount))
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount))
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount))
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount)
    )
    expect(await token1.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      totalSupplyToken1.sub(token1Amount).sub(swapAmount)
    )
  })

  it('swap:gas', async () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount, defaultLiquidityProviderWallet.address)

    // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    await pair.sync(overrides)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bigNumberify('453305446940074565')
    await token1.transfer(pair.address, swapAmount)
    await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    const tx = await pair.swap(expectedOutputAmount, 0, defaultLiquidityProviderWallet.address, '0x', overrides)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(76984)
  })

  it('burn', async () => {
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(token0Amount, token1Amount, defaultLiquidityProviderWallet.address)

    const expectedLiquidity = expandTo18Decimals(3)
    const MINIMUM_LIQUIDITY = 1000
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await expect(pair.burn(defaultLiquidityProviderWallet.address, overrides))
      .to.emit(pair, 'Transfer')
      .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(token0, 'Transfer')
      .withArgs(pair.address, defaultLiquidityProviderWallet.address, token0Amount.sub(MINIMUM_LIQUIDITY))
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, defaultLiquidityProviderWallet.address, token1Amount.sub(MINIMUM_LIQUIDITY))
      .to.emit(pair, 'Sync')
      .withArgs(MINIMUM_LIQUIDITY, MINIMUM_LIQUIDITY)
      .to.emit(pair, 'Burn')
      .withArgs(
        defaultLiquidityProviderWallet.address, // not that in real set up, msg.sender can be swap factory
        token0Amount.sub(MINIMUM_LIQUIDITY),
        token1Amount.sub(MINIMUM_LIQUIDITY),
        defaultLiquidityProviderWallet.address
      )

    expect(await pair.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(0)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    expect(await token0.balanceOf(pair.address)).to.eq(MINIMUM_LIQUIDITY)
    expect(await token1.balanceOf(pair.address)).to.eq(MINIMUM_LIQUIDITY)
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      totalSupplyToken0.sub(MINIMUM_LIQUIDITY)
    )
    expect(await token1.balanceOf(defaultLiquidityProviderWallet.address)).to.eq(
      totalSupplyToken1.sub(MINIMUM_LIQUIDITY)
    )
  })

  it('price{0,1}CumulativeLast', async () => {
    const liquidityProviderAddress = defaultLiquidityProviderWallet.address

    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(token0Amount, token1Amount, liquidityProviderAddress)

    const blockTimestamp = (await pair.getReserves())[2]
    await mineBlock(provider, blockTimestamp + 1)
    await pair.sync(overrides)

    const initialPrice = encodePrice(token0Amount, token1Amount)
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1)

    const swapAmount = expandTo18Decimals(3)
    await token0.transfer(pair.address, swapAmount)
    await mineBlock(provider, blockTimestamp + 10)
    // swap to a new price eagerly instead of syncing
    await pair.swap(0, expandTo18Decimals(1), liquidityProviderAddress, '0x', overrides) // make the price nice

    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10))
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10))
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

    await mineBlock(provider, blockTimestamp + 20)
    await pair.sync(overrides)

    const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
  })

  it('When feeTo:off, all fee should go to liquidity providers.', async () => {
    const swapAmountIntoPoolInToken1 = expandTo18Decimals(1)
    await token1.transfer(defaultLiquidityTakerWallet.address, swapAmountIntoPoolInToken1.mul(2)) // add some buffer to avoid underflow

    const token0TotalBalanceBeforeAnyActions = await getTokenTotalBalance(token0)
    const token1TotalBalanceBeforeAnyActions = await getTokenTotalBalance(token1)

    const token0BalanceOfProviderBeforeAnyActions = await token0.balanceOf(defaultLiquidityProviderWallet.address)

    await printBalances('before providing liquidity')

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    // 1 token0 = INITIAL_RATE_TOKEN0_TO_TOKEN1 token1 NOTE THAT THIS RATE ASSUMPTION GUARDS THE FOLLOWING TESTING LOGIC
    const INITIAL_RATE_TOKEN0_TO_TOKEN1 = bigNumberify(1)
    await addLiquidity(
      token0Amount,
      INITIAL_RATE_TOKEN0_TO_TOKEN1.mul(token1Amount),
      defaultLiquidityProviderWallet.address
    )

    await printBalances('after addLiquidity & before transfer swapAmount')

    await token1.connect(defaultLiquidityTakerWallet).approve(pair.address, swapAmountIntoPoolInToken1)

    console.log(
      `await token1.allowance(taker.address, pair.address): ${await token1.allowance(
        defaultLiquidityTakerWallet.address,
        pair.address
      )}`
    )
    await token1.connect(defaultLiquidityTakerWallet).transfer(pair.address, swapAmountIntoPoolInToken1)

    await printBalances('after transfer swapAmount & before swap token0 out to taker')

    const expectedOutputAmountOfToken0 = bigNumberify('996006981039903216') // need to hardcode the expected amount because precision is not very good...
    const expectedOutputAmountOfToken1 = bigNumberify('0')
    await pair.swap(
      expectedOutputAmountOfToken0,
      expectedOutputAmountOfToken1,
      defaultLiquidityTakerWallet.address,
      '0x',
      overrides
    )

    expect(await token0.balanceOf(defaultLiquidityTakerWallet.address)).to.eq(
      expectedOutputAmountOfToken0,
      'taker balance of token 0 should increment by expectedOutputAmountOfToken0 after successful swap'
    )

    await printBalances(
      'after swap token0 out & before the provider transfers all LP tokens s/he can back to pair contract'
    )

    const expectedLiquidityTokenAmount = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidityTokenAmount.sub(MINIMUM_LIQUIDITY))

    await printBalances('after transfer out liquidity tokens & before burn')

    await pair.burn(defaultLiquidityProviderWallet.address, overrides)

    await printBalances('after burning LP tokens')

    const token0TotalBalanceAfterAllActions = await getTokenTotalBalance(token0)
    const token1TotalBalanceAfterAllActions = await getTokenTotalBalance(token1)

    console.log(`token0TotalBalanceAfterAllActions： ${token0TotalBalanceAfterAllActions}`)
    console.log(`token1TotalBalanceAfterAllActions： ${token1TotalBalanceAfterAllActions}`)
    expect(token0TotalBalanceBeforeAnyActions).to.deep.eq(
      token0TotalBalanceAfterAllActions,
      'token 0 total balance before and after should be the same'
    )
    expect(token1TotalBalanceBeforeAnyActions).to.deep.eq(
      token1TotalBalanceAfterAllActions,
      'token 1 total balance before and after should be the same'
    )

    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)

    /**
     * liquidity taker is trying to swap $expandTo18Decimals(1) units of token1 for token 0,
     * priced (according to pool reserves) roughly at $INITIAL_RATE_TOKEN0_TO_TOKEN1,
     * but taker get less instead after fees,
     * and the fee in the form of extra token 0 goes to liquidity provider
     *
     before providing liquidity: await token0.balanceOf(provider.address): 10000000000000000000000
     before providing liquidity: await token1.balanceOf(provider.address): 9998000000000000000000
     before providing liquidity: await token0.balanceOf(pair.address): 0
     before providing liquidity: await token1.balanceOf(pair.address): 0
     before providing liquidity: await token0.balanceOf(taker.address): 0
     before providing liquidity: await token1.balanceOf(taker.address): 2000000000000000000

     after swap & burn: await token0.balanceOf(provider.address): 9999003993018960095784
     after swap & burn: await token1.balanceOf(provider.address): 9998999999999999998999
     after swap & burn: await token0.balanceOf(pair.address): 1000
     after swap & burn: await token1.balanceOf(pair.address): 1001
     after swap & burn: await token0.balanceOf(taker.address): 996006981039903216
     after swap & burn: await token1.balanceOf(taker.address): 1000000000000000000
     */
    const token0BalanceChangeOfProvider = (await token0.balanceOf(defaultLiquidityProviderWallet.address)).sub(
      token0BalanceOfProviderBeforeAnyActions
    )
    const token0DeductibleFromProviderWithoutFees = swapAmountIntoPoolInToken1.div(INITIAL_RATE_TOKEN0_TO_TOKEN1)
    const feeEarnedInToken0 = token0BalanceChangeOfProvider.add(token0DeductibleFromProviderWithoutFees)
    const FEE_RATE_IN_BPS = bigNumberify(30)
    console.log(
      `feeEarnedInToken0: ${feeEarnedInToken0} token0DeductibleFromProviderWithoutFees: ${token0DeductibleFromProviderWithoutFees}`
    )
    expect(feeEarnedInToken0).to.gte(
      token0DeductibleFromProviderWithoutFees.mul(FEE_RATE_IN_BPS).div(10000),
      `liquidity provider should get >= ${FEE_RATE_IN_BPS} bps in fees when pulling out liquidity`
    )
  })

  // TODO make fees and number metrics configurable
  it('When feeTo:on, 5 bps of fees should go to feeToAddress, the rest 25 bps still go to liquidity providers', async () => {
    await expect(factory.setFeeTo(defaultFeeToWallet.address))
      .to.emit(factory, 'FeeToUpdated')
      .withArgs(defaultFeeToWallet.address, AddressZero)

    const swapAmountIntoPoolInToken1 = expandTo18Decimals(1)
    await token1.transfer(defaultLiquidityTakerWallet.address, swapAmountIntoPoolInToken1.mul(2)) // add some buffer to avoid underflow

    const token0TotalBalanceBeforeAnyActions = await getTokenTotalBalance(token0)
    const token1TotalBalanceBeforeAnyActions = await getTokenTotalBalance(token1)

    await printBalances('before providing liquidity')

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)

    // 1 token0 = INITIAL_RATE_TOKEN0_TO_TOKEN1 token1 NOTE THAT THIS RATE ASSUMPTION GUARDS THE FOLLOWING TESTING LOGIC
    const INITIAL_RATE_TOKEN0_TO_TOKEN1 = bigNumberify(1)

    await addLiquidity(
      token0Amount,
      INITIAL_RATE_TOKEN0_TO_TOKEN1.mul(token1Amount),
      defaultLiquidityProviderWallet.address
    )

    await printBalances('after addLiquidity & before transfer swapAmount')

    const expectedOutputAmountOfToken0 = bigNumberify('996006981039903216')
    const expectedOutputAmountOfToken1 = bigNumberify('0')

    await token1.connect(defaultLiquidityTakerWallet).transfer(pair.address, swapAmountIntoPoolInToken1)

    await printBalances('after transfer swapAmount & before swap token0 out to taker')

    await pair.swap(
      expectedOutputAmountOfToken0,
      expectedOutputAmountOfToken1,
      defaultLiquidityTakerWallet.address,
      '0x',
      overrides
    )

    await printBalances(
      'after swap token0 out & before the provider transfers all LP tokens s/he can back to pair contract'
    )

    const expectedLiquidityTokenAmount = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidityTokenAmount.sub(MINIMUM_LIQUIDITY))

    await printBalances('after transfer out liquidity tokens & before burn')

    await pair.burn(defaultLiquidityProviderWallet.address, overrides)

    await printBalances('after liquidity provider burning LP tokens')

    const expectedFeeToLiquidityTokenAmount = '249750499251388' // roughly 2.5 bps of the expectedOutputAmount
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add(expectedFeeToLiquidityTokenAmount))
    expect(await pair.balanceOf(defaultFeeToWallet.address)).to.eq(expectedFeeToLiquidityTokenAmount)

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    expect(await token0.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('249501683697445'))
    expect(await token1.balanceOf(pair.address)).to.eq(bigNumberify(1000).add('250000187312969'))

    await pair.connect(defaultFeeToWallet).transfer(pair.address, expectedFeeToLiquidityTokenAmount)
    await pair.connect(defaultFeeToWallet).burn(defaultFeeToWallet.address, overrides)

    await printBalances('after feeTo wallet burning LP tokens')

    const token0TotalBalanceAfterAllActions = await getTokenTotalBalance(token0)
    const token1TotalBalanceAfterAllActions = await getTokenTotalBalance(token1)

    expect(token0TotalBalanceBeforeAnyActions).to.deep.eq(
      token0TotalBalanceAfterAllActions,
      'token 0 total balance before and after should be the same'
    )
    expect(token1TotalBalanceBeforeAnyActions).to.deep.eq(
      token1TotalBalanceAfterAllActions,
      'token 1 total balance before and after should be the same'
    )

    expect(await token0.balanceOf(defaultFeeToWallet.address)).to.gt(
      0,
      'feeTo address should have collected some fees in token 0 after burning its allocated liquidity token'
    )
    expect(await token1.balanceOf(defaultFeeToWallet.address)).to.gt(
      0,
      'feeTo address should have collected some fees in token 1 after burning its allocated liquidity token'
    )
  })

  const printBalances = async (scenarioDescription: string) => {
    console.log(
      `${scenarioDescription}: await token0.balanceOf(provider.address): ${await token0.balanceOf(
        defaultLiquidityProviderWallet.address
      )}`
    )
    console.log(`${scenarioDescription}: await token0.balanceOf(pair.address): ${await token0.balanceOf(pair.address)}`)
    console.log(
      `${scenarioDescription}: await token0.balanceOf(taker.address): ${await token0.balanceOf(
        defaultLiquidityTakerWallet.address
      )}`
    )
    console.log(
      `${scenarioDescription}: await token0.balanceOf(feeTo.address): ${await token0.balanceOf(
        defaultFeeToWallet.address
      )}`
    )

    console.log(
      `${scenarioDescription}: await token1.balanceOf(provider.address): ${await token1.balanceOf(
        defaultLiquidityProviderWallet.address
      )}`
    )
    console.log(`${scenarioDescription}: await token1.balanceOf(pair.address): ${await token1.balanceOf(pair.address)}`)

    console.log(
      `${scenarioDescription}: await token1.balanceOf(taker.address): ${await token1.balanceOf(
        defaultLiquidityTakerWallet.address
      )}`
    )

    console.log(
      `${scenarioDescription}: await token1.balanceOf(feeTo.address): ${await token1.balanceOf(
        defaultFeeToWallet.address
      )}`
    )

    console.log(
      `${scenarioDescription}: await pair.balanceOf(provider.address): ${await pair.balanceOf(
        defaultLiquidityProviderWallet.address
      )}`
    )
    console.log(
      `${scenarioDescription}: await pair.balanceOf(taker.address): ${await pair.balanceOf(
        defaultLiquidityTakerWallet.address
      )}`
    )
    console.log(
      `${scenarioDescription}: await pair.balanceOf(feeTo.address): ${await pair.balanceOf(defaultFeeToWallet.address)}`
    )
  }
  async function getTokenTotalBalance(whichToken: Contract) {
    return (await whichToken.balanceOf(defaultLiquidityProviderWallet.address))
      .add(await whichToken.balanceOf(pair.address))
      .add(await whichToken.balanceOf(defaultLiquidityTakerWallet.address))
      .add(await whichToken.balanceOf(defaultFeeToWallet.address))
  }
})
