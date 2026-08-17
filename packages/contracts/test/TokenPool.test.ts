import { time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import { LendingPool, PoolFactory, TestERC20, TestFeeOnTransferERC20, TestNoReturnERC20 } from '../typechain-types'

/**
 * Six decimals throughout, deliberately.
 *
 * USDC has six and the app has eighteen baked into every `formatEther` it
 * owns, so a token fixture that quietly used eighteen would let an
 * off-by-10^12 pass every assertion here and surface for the first time
 * against a real stablecoin. Amounts are written with `units` rather than
 * `ethers.parseEther` for the same reason.
 */
const DECIMALS = 6

function units(amount: string): bigint {
  return ethers.parseUnits(amount, DECIMALS)
}

const maxLoanAmount = units('10')
const interestRate = 500 // 5% over the full term
const loanDuration = 30 * 24 * 60 * 60 // 30 days

/**
 * Deploys a pool the way the factory does: behind a beacon proxy.
 *
 * Mirrors the helper in `LendingPool.test.ts`. Pools are beacon proxies and
 * the implementation deliberately no longer inherits `UUPSUpgradeable`, so a
 * UUPS deployment is rejected outright.
 */
async function deployPoolBehindBeacon(args: unknown[]): Promise<LendingPool> {
  const LendingPool = await ethers.getContractFactory('LendingPool')
  const beacon = await upgrades.deployBeacon(LendingPool)
  await beacon.waitForDeployment()

  const pool = (await upgrades.deployBeaconProxy(beacon, LendingPool, args)) as unknown as LendingPool
  await pool.waitForDeployment()

  return pool
}

/**
 * Settles a token loan in one payment.
 *
 * Quotes an hour ahead exactly as the native helper does — but for a different
 * reason, and the difference is the point of the token path. Native has to
 * over-send and be refunded; here the quote only has to be *big enough*,
 * because the pool pulls what is owed at execution time and leaves the rest in
 * the borrower's wallet.
 */
async function repayInFull(pool: LendingPool, token: TestERC20, borrower: SignerWithAddress, loanId: number) {
  const quote = await pool.outstandingBalanceAt(loanId, (await time.latest()) + 3600)

  await token.connect(borrower).approve(await pool.getAddress(), quote)

  return pool.connect(borrower).repayLoanWithTokens(loanId, quote)
}

describe('Token pools', function () {
  let owner: SignerWithAddress
  let borrower: SignerWithAddress
  let lender: SignerWithAddress
  let otherLender: SignerWithAddress

  beforeEach(async function () {
    ;[owner, borrower, lender, otherLender] = await ethers.getSigners()
  })

  describe('Denomination', function () {
    let token: TestERC20
    let tokenPool: LendingPool
    let nativePool: LendingPool

    beforeEach(async function () {
      const TestERC20 = await ethers.getContractFactory('TestERC20')
      token = await TestERC20.deploy('Test USD', 'TUSD', DECIMALS)
      await token.waitForDeployment()

      tokenPool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false, await token.getAddress()])
      nativePool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false, ethers.ZeroAddress])
    })

    it('records what the pool is denominated in', async function () {
      expect((await tokenPool.poolConfig()).loanToken).to.equal(await token.getAddress())
    })

    it('reads a pool with no token as native', async function () {
      // The retrofit that means nothing has to migrate: `address(0)` is the
      // zero value, so a pool written before the field existed answers this
      // question correctly without anybody touching it.
      expect((await nativePool.poolConfig()).loanToken).to.equal(ethers.ZeroAddress)
    })

    it('refuses native value sent to a token pool', async function () {
      await expect(tokenPool.connect(lender).depositFunds({ value: units('1') })).to.be.revertedWithCustomError(tokenPool, 'TokenPoolOnly')
    })

    it('refuses a token deposit into a native pool', async function () {
      await expect(nativePool.connect(lender).depositTokens(units('1'))).to.be.revertedWithCustomError(nativePool, 'NativePoolOnly')
    })

    it('refuses native repayment of a token loan', async function () {
      await expect(tokenPool.connect(borrower).repayLoan(1, { value: units('1') })).to.be.revertedWithCustomError(
        tokenPool,
        'TokenPoolOnly'
      )
    })

    it('refuses token repayment of a native loan', async function () {
      await expect(nativePool.connect(borrower).repayLoanWithTokens(1, units('1'))).to.be.revertedWithCustomError(
        nativePool,
        'NativePoolOnly'
      )
    })

    it('has no setter for the denomination', async function () {
      // A pool is denominated once. Re-denominating it would reinterpret every
      // `contributions` entry and every outstanding debt as a quantity of
      // something else, so `updatePoolConfig` deliberately cannot reach it.
      await tokenPool.connect(owner).updatePoolConfig(units('50'), 750, loanDuration)

      expect((await tokenPool.poolConfig()).loanToken).to.equal(await token.getAddress())
    })
  })

  describe('The money loop, in a six-decimal token', function () {
    let token: TestERC20
    let pool: LendingPool
    let poolAddress: string

    beforeEach(async function () {
      const TestERC20 = await ethers.getContractFactory('TestERC20')
      token = await TestERC20.deploy('Test USD', 'TUSD', DECIMALS)
      await token.waitForDeployment()

      pool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false, await token.getAddress()])
      poolAddress = await pool.getAddress()

      for (const account of [lender, otherLender, borrower]) {
        await token.mint(account.address, units('1000'))
        await token.connect(account).approve(poolAddress, units('1000'))
      }
    })

    it('credits a deposit and moves the tokens', async function () {
      await expect(pool.connect(lender).depositTokens(units('100')))
        .to.emit(pool, 'FundsDeposited')
        .withArgs(lender.address, units('100'))

      expect(await pool.contributions(lender.address)).to.equal(units('100'))
      expect(await pool.totalContributions()).to.equal(units('100'))
      expect(await pool.totalFunds()).to.equal(units('100'))

      expect(await token.balanceOf(poolAddress)).to.equal(units('100'))
      expect(await token.balanceOf(lender.address)).to.equal(units('900'))
    })

    it('enrols a first-time depositor in an open pool, as a native one does', async function () {
      await expect(pool.connect(lender).depositTokens(units('100')))
        .to.emit(pool, 'MemberJoined')
        .withArgs(lender.address)

      // Membership.Active
      expect(await pool.membership(lender.address)).to.equal(2)
    })

    it('refuses a deposit of nothing', async function () {
      await expect(pool.connect(lender).depositTokens(0)).to.be.revertedWithCustomError(pool, 'InvalidAmount')
    })

    it('lends tokens out and takes them back with interest', async function () {
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(borrower).depositTokens(units('1'))

      const borrowed = units('10')
      const balanceBeforeLoan = await token.balanceOf(borrower.address)

      await pool.connect(borrower).createLoan(borrowed)

      expect(await token.balanceOf(borrower.address)).to.equal(balanceBeforeLoan + borrowed)
      expect(await token.balanceOf(poolAddress)).to.equal(units('101') - borrowed)

      await time.increase(loanDuration)
      await repayInFull(pool, token, borrower, 1)

      const loan = await pool.getLoan(1)
      expect(loan.isRepaid).to.be.true

      // A full term at 500bp. Accrual is per second, so the settling block
      // lands a moment past the term and the debt is a sliver above 5%.
      expect(loan.amountRepaid).to.be.gte(units('10.5'))
      expect(loan.amountRepaid).to.be.lt(units('10.51'))
    })

    it('pulls only what is owed, however much is offered', async function () {
      // The native path has to take the value up front and refund the excess,
      // which is why the app quotes an hour ahead and warns that the wallet
      // will ask for more than the screen says. Here the surplus never leaves
      // the borrower at all.
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(borrower).depositTokens(units('1'))
      await pool.connect(borrower).createLoan(units('10'))

      await time.increase(loanDuration)

      const offered = units('500')
      const balanceBefore = await token.balanceOf(borrower.address)

      await pool.connect(borrower).repayLoanWithTokens(1, offered)

      const loan = await pool.getLoan(1)
      expect(loan.isRepaid).to.be.true

      const spent = balanceBefore - (await token.balanceOf(borrower.address))
      expect(spent).to.equal(loan.amountRepaid)
      expect(spent).to.be.lt(offered)
    })

    it('takes a loan down in instalments', async function () {
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(borrower).depositTokens(units('1'))
      await pool.connect(borrower).createLoan(units('10'))

      await pool.connect(borrower).repayLoanWithTokens(1, units('4'))

      let loan = await pool.getLoan(1)
      expect(loan.isRepaid).to.be.false
      expect(loan.amountRepaid).to.equal(units('4'))

      await repayInFull(pool, token, borrower, 1)

      loan = await pool.getLoan(1)
      expect(loan.isRepaid).to.be.true
      expect(loan.repaidAt).to.be.gt(0)
    })

    it('pays interest out in the pool token', async function () {
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(borrower).depositTokens(units('1'))
      await pool.connect(borrower).createLoan(units('10'))

      await time.increase(loanDuration)
      await repayInFull(pool, token, borrower, 1)

      const claimable = await pool.claimable(lender.address)
      expect(claimable).to.be.gt(0)

      const balanceBefore = await token.balanceOf(lender.address)
      await pool.connect(lender).claimInterest()

      expect((await token.balanceOf(lender.address)) - balanceBefore).to.equal(claimable)
    })

    it('returns a contribution in the pool token', async function () {
      await pool.connect(lender).depositTokens(units('100'))

      const balanceBefore = await token.balanceOf(lender.address)
      await pool.connect(lender).withdraw(units('40'))

      expect((await token.balanceOf(lender.address)) - balanceBefore).to.equal(units('40'))
      expect(await pool.contributions(lender.address)).to.equal(units('60'))
    })

    it('keeps its token balance equal to what it says it holds', async function () {
      // The invariant that catches an accounting slip anywhere in the loop:
      // `totalFunds` is what the pool can lend or return, so with nothing
      // outstanding it is exactly the balance sitting in the token contract.
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(otherLender).depositTokens(units('50'))
      await pool.connect(borrower).depositTokens(units('1'))
      await pool.connect(borrower).createLoan(units('10'))

      await time.increase(loanDuration)
      await repayInFull(pool, token, borrower, 1)

      expect(await token.balanceOf(poolAddress)).to.equal(await pool.totalFunds())
    })
  })

  describe('A token that takes a fee on transfer', function () {
    let token: TestFeeOnTransferERC20
    let pool: LendingPool
    let poolAddress: string

    // 1%. Enough to be unmistakable in an assertion, small enough that a loan
    // still behaves like a loan.
    const feeBasisPoints = 100n

    function afterFee(amount: bigint): bigint {
      return amount - (amount * feeBasisPoints) / 10000n
    }

    beforeEach(async function () {
      const TestFeeOnTransferERC20 = await ethers.getContractFactory('TestFeeOnTransferERC20')
      token = await TestFeeOnTransferERC20.deploy('Fee USD', 'FUSD', DECIMALS, feeBasisPoints)
      await token.waitForDeployment()

      pool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false, await token.getAddress()])
      poolAddress = await pool.getAddress()

      for (const account of [lender, otherLender, borrower]) {
        await token.mint(account.address, units('1000'))
        await token.connect(account).approve(poolAddress, units('1000'))
      }
    })

    it('credits what arrived, not what was asked for', async function () {
      await pool.connect(lender).depositTokens(units('100'))

      const received = afterFee(units('100'))

      expect(await pool.contributions(lender.address)).to.equal(received)
      expect(await pool.totalContributions()).to.equal(received)
      expect(await pool.totalFunds()).to.equal(received)
      expect(await token.balanceOf(poolAddress)).to.equal(received)
    })

    it('reports the credited amount in the event, not the requested one', async function () {
      // The indexer builds every balance in the app from these logs. An event
      // carrying the requested amount would put the whole app permanently out
      // of step with the chain, with nothing to reconcile against.
      await expect(pool.connect(lender).depositTokens(units('100')))
        .to.emit(pool, 'FundsDeposited')
        .withArgs(lender.address, afterFee(units('100')))
    })

    it('does not let one lender dilute another', async function () {
      // The failure this fixture exists for. Crediting the requested amount
      // would leave `totalContributions` above the tokens the pool actually
      // holds, and every interest distribution divides by it — so each lender
      // would be paid a share of a pot larger than the one that exists, and
      // the last to claim would find it empty.
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(otherLender).depositTokens(units('100'))

      expect(await pool.totalContributions()).to.equal(await token.balanceOf(poolAddress))

      await pool.connect(borrower).depositTokens(units('10'))
      await pool.connect(borrower).createLoan(units('10'))

      await time.increase(loanDuration)

      const quote = await pool.outstandingBalanceAt(1, (await time.latest()) + 3600)
      await pool.connect(borrower).repayLoanWithTokens(1, quote)

      // Equal stakes, equal shares — and both claims are payable out of what
      // the pool really holds.
      const lenderClaim = await pool.claimable(lender.address)
      const otherClaim = await pool.claimable(otherLender.address)
      expect(lenderClaim).to.equal(otherClaim)

      await pool.connect(lender).claimInterest()
      await pool.connect(otherLender).claimInterest()

      expect(await pool.totalFunds()).to.be.lte(await token.balanceOf(poolAddress))
    })

    it('leaves a loan open when the payment under-delivers', async function () {
      // Sending the exact debt through a taxing token settles nothing, because
      // less than the debt arrives. The pool credits the shortfall honestly and
      // the loan stays open rather than being marked repaid for money it never
      // received.
      await pool.connect(lender).depositTokens(units('100'))
      await pool.connect(borrower).depositTokens(units('10'))
      await pool.connect(borrower).createLoan(units('10'))

      const outstanding = await pool.outstandingBalance(1)
      await pool.connect(borrower).repayLoanWithTokens(1, outstanding)

      const loan = await pool.getLoan(1)
      expect(loan.isRepaid).to.be.false
      expect(loan.amountRepaid).to.be.lt(outstanding)
      expect(await pool.outstandingBalance(1)).to.be.gt(0)
    })

    it('refuses a deposit that delivers nothing at all', async function () {
      await token.setFeeBasisPoints(10000)

      await expect(pool.connect(lender).depositTokens(units('100'))).to.be.revertedWithCustomError(pool, 'InvalidAmount')
    })
  })

  describe('A token that returns no boolean', function () {
    let token: TestNoReturnERC20
    let pool: LendingPool
    let poolAddress: string

    beforeEach(async function () {
      const TestNoReturnERC20 = await ethers.getContractFactory('TestNoReturnERC20')
      token = await TestNoReturnERC20.deploy()
      await token.waitForDeployment()

      pool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false, await token.getAddress()])
      poolAddress = await pool.getAddress()

      for (const account of [lender, borrower]) {
        await token.mint(account.address, units('1000'))
        await token.connect(account).approve(poolAddress, units('1000'))
      }
    })

    it('runs the whole loop against a USDT-shaped token', async function () {
      // Nothing here is subtle: any of these calls reaching for `IERC20`
      // directly would revert on decoding a `bool` that was never returned.
      // `SafeERC20` is what makes the largest stablecoin in circulation usable.
      await pool.connect(lender).depositTokens(units('100'))
      expect(await pool.contributions(lender.address)).to.equal(units('100'))

      await pool.connect(borrower).depositTokens(units('10'))
      await pool.connect(borrower).createLoan(units('10'))
      expect(await token.balanceOf(borrower.address)).to.equal(units('1000'))

      await time.increase(loanDuration)

      const quote = await pool.outstandingBalanceAt(1, (await time.latest()) + 3600)
      await pool.connect(borrower).repayLoanWithTokens(1, quote)
      expect((await pool.getLoan(1)).isRepaid).to.be.true

      await pool.connect(lender).claimInterest()
      await pool.connect(lender).withdraw(units('100'))
      expect(await pool.contributions(lender.address)).to.equal(0)
    })
  })

  describe('Zero-value transfers', function () {
    it('disburses a zero loan without asking the token to move nothing', async function () {
      // Some ERC-20s revert on a zero-value transfer, and `createLoan` does not
      // refuse a zero amount anywhere — `requestLoan` does, but this path never
      // has. A native pool was unbothered, so a token pool must be too, or the
      // two denominations diverge on an edge nothing else guards.
      const TestERC20 = await ethers.getContractFactory('TestERC20')
      const token = await TestERC20.deploy('Test USD', 'TUSD', DECIMALS)
      await token.waitForDeployment()

      const pool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false, await token.getAddress()])

      await token.mint(lender.address, units('100'))
      await token.connect(lender).approve(await pool.getAddress(), units('100'))
      await pool.connect(lender).depositTokens(units('100'))

      // Switched on only now: the deposit above has to go through untaxed, and
      // OpenZeppelin's own ERC-20 moves zero happily, so without this the test
      // would pass whether the pool guarded the case or not.
      await token.setRejectsZeroTransfers(true)

      await expect(pool.connect(lender).createLoan(0)).to.not.be.reverted
    })
  })

  describe('The factory allowlist', function () {
    let poolFactory: PoolFactory
    let token: TestERC20

    const defaultPoolParams = {
      maxLoanAmount,
      interestRate,
      loanDuration,
      name: 'Stable Circle',
      description: 'A pool denominated in a stablecoin',
      requiresMembership: false,
      loanToken: ethers.ZeroAddress as string,
    }

    beforeEach(async function () {
      const LendingPool = await ethers.getContractFactory('LendingPool')
      const lendingPoolImplementation = await LendingPool.deploy()
      await lendingPoolImplementation.waitForDeployment()

      const PoolFactory = await ethers.getContractFactory('PoolFactory')
      poolFactory = await PoolFactory.deploy()
      await poolFactory.waitForDeployment()
      await poolFactory.initialize(owner.address, await lendingPoolImplementation.getAddress())

      const TestERC20 = await ethers.getContractFactory('TestERC20')
      token = await TestERC20.deploy('Test USD', 'TUSD', DECIMALS)
      await token.waitForDeployment()
    })

    it('refuses a pool denominated in a token nobody allowed', async function () {
      await expect(
        poolFactory.connect(owner).createPool({ ...defaultPoolParams, loanToken: await token.getAddress() })
      ).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedLoanToken')
    })

    it('allows a native pool without anyone allowing anything', async function () {
      // `address(0)` is the absence of a token, not a token to be permitted.
      await expect(poolFactory.connect(owner).createPool(defaultPoolParams)).to.not.be.reverted
      expect(await poolFactory.isAuthorizedLoanToken(ethers.ZeroAddress)).to.be.true
    })

    it('creates a token pool once the token is allowed', async function () {
      const tokenAddress = await token.getAddress()

      await expect(poolFactory.connect(owner).setLoanTokenAuthorization(tokenAddress, true))
        .to.emit(poolFactory, 'LoanTokenAuthorized')
        .withArgs(tokenAddress, true)

      await poolFactory.connect(owner).createPool({ ...defaultPoolParams, loanToken: tokenAddress })

      const pool = (await ethers.getContractAt('LendingPool', await poolFactory.getPoolAddress(1))) as unknown as LendingPool
      expect((await pool.poolConfig()).loanToken).to.equal(tokenAddress)
    })

    it('carries the denomination into the registry', async function () {
      // So a list can be denominated in one call. Reading it per pool would
      // cost an RPC round trip per card in a scrolling list.
      const tokenAddress = await token.getAddress()
      await poolFactory.connect(owner).setLoanTokenAuthorization(tokenAddress, true)
      await poolFactory.connect(owner).createPool({ ...defaultPoolParams, loanToken: tokenAddress })

      expect((await poolFactory.getPoolInfo(1)).loanToken).to.equal(tokenAddress)

      const [, poolInfos] = await poolFactory.getPoolsRange(1, 10)
      expect(poolInfos[0].loanToken).to.equal(tokenAddress)
    })

    it('reports a native pool in the registry as having no token', async function () {
      await poolFactory.connect(owner).createPool(defaultPoolParams)

      expect((await poolFactory.getPoolInfo(1)).loanToken).to.equal(ethers.ZeroAddress)
    })

    it('refuses to allow the zero address', async function () {
      await expect(poolFactory.connect(owner).setLoanTokenAuthorization(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        poolFactory,
        'InvalidLoanToken'
      )
    })

    it('refuses to allow an address with no code', async function () {
      // The shape a mistyped token address takes. Caught here, where the owner
      // is watching, rather than at the first deposit into a pool that could
      // never hold anything.
      await expect(poolFactory.connect(owner).setLoanTokenAuthorization(lender.address, true)).to.be.revertedWithCustomError(
        poolFactory,
        'InvalidLoanToken'
      )
    })

    it('is the factory owner’s decision alone', async function () {
      await expect(poolFactory.connect(lender).setLoanTokenAuthorization(await token.getAddress(), true)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })

    it('stops new pools but not existing ones when a token is disallowed', async function () {
      const tokenAddress = await token.getAddress()
      await poolFactory.connect(owner).setLoanTokenAuthorization(tokenAddress, true)
      await poolFactory.connect(owner).createPool({ ...defaultPoolParams, loanToken: tokenAddress })

      await poolFactory.connect(owner).setLoanTokenAuthorization(tokenAddress, false)

      await expect(poolFactory.connect(owner).createPool({ ...defaultPoolParams, loanToken: tokenAddress })).to.be.revertedWithCustomError(
        poolFactory,
        'UnauthorizedLoanToken'
      )

      // The pool that already exists holds real balances and real debts in
      // that token. A denomination the factory changed its mind about must not
      // strand both sides of a loan.
      const pool = (await ethers.getContractAt('LendingPool', await poolFactory.getPoolAddress(1))) as unknown as LendingPool
      await token.mint(lender.address, units('100'))
      await token.connect(lender).approve(await pool.getAddress(), units('100'))

      await expect(pool.connect(lender).depositTokens(units('100'))).to.not.be.reverted
    })
  })
})
