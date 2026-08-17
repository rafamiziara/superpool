import { time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { LendingPool } from '../typechain-types'

/**
 * Where `loans[loanId]` starts in storage, found rather than hardcoded.
 *
 * The declaration index of the `loans` mapping is not something a test should
 * know: it moves whenever a state variable is added above it, and a stale
 * constant would read some unrelated word and pass by reading zero. So the
 * candidate slots are tried until one hashes to a word whose low 20 bytes are
 * the borrower — which only the loan's own first slot can be.
 */
async function findLoanSlot(poolAddress: string, loanId: number, borrower: string): Promise<bigint> {
  for (let declared = 0; declared < 32; declared++) {
    const slot = BigInt(ethers.solidityPackedKeccak256(['uint256', 'uint256'], [loanId, declared]))
    const word = BigInt(await ethers.provider.getStorage(poolAddress, slot))

    if ((word & ((1n << 160n) - 1n)) === BigInt(borrower)) return slot
  }

  throw new Error(`No storage slot holds loan ${loanId} for ${borrower}`)
}

/**
 * Deploys a pool the way the factory does: behind a beacon proxy.
 *
 * Not `deployProxy`/UUPS any more — pools are beacon proxies now, and the
 * implementation deliberately no longer inherits `UUPSUpgradeable`, so a UUPS
 * deployment is rejected outright. Testing through a beacon is also the only
 * way these tests exercise the delegation path production actually uses.
 */
async function deployPoolBehindBeacon(args: unknown[]): Promise<LendingPool> {
  const LendingPool = await ethers.getContractFactory('LendingPool')
  const beacon = await upgrades.deployBeacon(LendingPool)
  await beacon.waitForDeployment()

  const pool = (await upgrades.deployBeaconProxy(beacon, LendingPool, args)) as unknown as LendingPool
  await pool.waitForDeployment()

  return pool
}

describe('LendingPool', function () {
  let lendingPool: LendingPool
  let owner: SignerWithAddress
  let borrower: SignerWithAddress
  let lender: SignerWithAddress
  let otherAccount: SignerWithAddress

  const maxLoanAmount = ethers.parseEther('10')
  const interestRate = 500 // 5%
  const loanDuration = 30 * 24 * 60 * 60 // 30 days

  beforeEach(async function () {
    // Get signers
    ;[owner, borrower, lender, otherAccount] = await ethers.getSigners()

    // Deploy the contract
    lendingPool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration, false])

    await lendingPool.waitForDeployment()
  })

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      expect(await lendingPool.owner()).to.equal(owner.address)
    })

    it('Should set the correct pool configuration', async function () {
      const poolConfig = await lendingPool.poolConfig()
      expect(poolConfig.maxLoanAmount).to.equal(maxLoanAmount)
      expect(poolConfig.interestRate).to.equal(interestRate)
      expect(poolConfig.loanDuration).to.equal(loanDuration)
      expect(poolConfig.isActive).to.be.true
    })

    it('Should initialize with zero total funds', async function () {
      expect(await lendingPool.totalFunds()).to.equal(0)
    })

    it('Should set next loan ID to 1', async function () {
      expect(await lendingPool.nextLoanId()).to.equal(1)
    })

    it('Should return correct version', async function () {
      expect(await lendingPool.version()).to.equal('2.0.0')
    })
  })

  describe('Deposit Funds', function () {
    it('Should allow deposits and update total funds', async function () {
      const depositAmount = ethers.parseEther('5')

      await expect(lendingPool.connect(lender).depositFunds({ value: depositAmount }))
        .to.emit(lendingPool, 'FundsDeposited')
        .withArgs(lender.address, depositAmount)

      expect(await lendingPool.totalFunds()).to.equal(depositAmount)
    })

    it('Should reject zero deposits', async function () {
      await expect(lendingPool.connect(lender).depositFunds({ value: 0 })).to.be.revertedWithCustomError(lendingPool, 'InvalidAmount')
    })

    it('Should allow multiple deposits', async function () {
      const deposit1 = ethers.parseEther('3')
      const deposit2 = ethers.parseEther('2')

      await lendingPool.connect(lender).depositFunds({ value: deposit1 })
      await lendingPool.connect(otherAccount).depositFunds({ value: deposit2 })

      expect(await lendingPool.totalFunds()).to.equal(deposit1 + deposit2)
    })

    it('Should credit the depositor and nobody else', async function () {
      const depositAmount = ethers.parseEther('5')

      await lendingPool.connect(lender).depositFunds({ value: depositAmount })

      expect(await lendingPool.contributions(lender.address)).to.equal(depositAmount)
      expect(await lendingPool.contributions(otherAccount.address)).to.equal(0)
    })

    it('Should accumulate repeated deposits from the same member', async function () {
      const deposit1 = ethers.parseEther('3')
      const deposit2 = ethers.parseEther('2')

      await lendingPool.connect(lender).depositFunds({ value: deposit1 })
      await lendingPool.connect(lender).depositFunds({ value: deposit2 })

      expect(await lendingPool.contributions(lender.address)).to.equal(deposit1 + deposit2)
    })

    it('Should track contributions separately per member', async function () {
      const lenderDeposit = ethers.parseEther('3')
      const otherDeposit = ethers.parseEther('2')

      await lendingPool.connect(lender).depositFunds({ value: lenderDeposit })
      await lendingPool.connect(otherAccount).depositFunds({ value: otherDeposit })

      expect(await lendingPool.contributions(lender.address)).to.equal(lenderDeposit)
      expect(await lendingPool.contributions(otherAccount.address)).to.equal(otherDeposit)
    })

    it('Should report zero for an address that never deposited', async function () {
      expect(await lendingPool.contributions(borrower.address)).to.equal(0)
    })
  })

  describe('Withdraw', function () {
    const depositAmount = ethers.parseEther('10')

    beforeEach(async function () {
      await lendingPool.connect(lender).depositFunds({ value: depositAmount })
    })

    it('Should withdraw a partial amount and debit the member', async function () {
      const withdrawAmount = ethers.parseEther('4')

      await expect(lendingPool.connect(lender).withdraw(withdrawAmount))
        .to.emit(lendingPool, 'FundsWithdrawn')
        .withArgs(lender.address, withdrawAmount)

      expect(await lendingPool.contributions(lender.address)).to.equal(depositAmount - withdrawAmount)
      expect(await lendingPool.totalFunds()).to.equal(depositAmount - withdrawAmount)
    })

    it('Should send the funds to the member', async function () {
      const withdrawAmount = ethers.parseEther('4')
      const balanceBefore = await ethers.provider.getBalance(lender.address)

      const tx = await lendingPool.connect(lender).withdraw(withdrawAmount)
      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice

      const balanceAfter = await ethers.provider.getBalance(lender.address)
      expect(balanceAfter).to.equal(balanceBefore + withdrawAmount - gasUsed)
    })

    it('Should allow withdrawing the full contribution', async function () {
      await lendingPool.connect(lender).withdraw(depositAmount)

      expect(await lendingPool.contributions(lender.address)).to.equal(0)
      expect(await lendingPool.totalFunds()).to.equal(0)
    })

    it('Should reject zero withdrawals', async function () {
      await expect(lendingPool.connect(lender).withdraw(0)).to.be.revertedWithCustomError(lendingPool, 'InvalidAmount')
    })

    it('Should reject withdrawing more than the member contributed', async function () {
      await expect(lendingPool.connect(lender).withdraw(depositAmount + 1n)).to.be.revertedWithCustomError(
        lendingPool,
        'InsufficientBalance'
      )
    })

    it("Should reject withdrawing another member's funds", async function () {
      await expect(lendingPool.connect(otherAccount).withdraw(ethers.parseEther('1'))).to.be.revertedWithCustomError(
        lendingPool,
        'InsufficientBalance'
      )
    })

    it('Should reject a withdrawal the pool cannot currently pay', async function () {
      // A borrower takes liquidity out, leaving less than the lender is owed.
      await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
      await lendingPool.connect(borrower).createLoan(ethers.parseEther('9'))

      // 10 + 1 - 9 = 2 free, but the lender is owed 10.
      expect(await lendingPool.totalFunds()).to.equal(ethers.parseEther('2'))

      await expect(lendingPool.connect(lender).withdraw(depositAmount)).to.be.revertedWithCustomError(lendingPool, 'InsufficientLiquidity')

      // The free liquidity is still withdrawable.
      await expect(lendingPool.connect(lender).withdraw(ethers.parseEther('2'))).to.not.be.reverted
    })

    it('Should reject withdrawals while paused', async function () {
      await lendingPool.connect(owner).pause()

      await expect(lendingPool.connect(lender).withdraw(ethers.parseEther('1'))).to.be.revertedWithCustomError(lendingPool, 'EnforcedPause')
    })

    it('Should not let interest earned by the pool be withdrawn as contribution', async function () {
      await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
      await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))
      const repayment = await lendingPool.calculateRepaymentAmount(1)
      await lendingPool.connect(borrower).repayLoan(1, { value: repayment })

      // The pool now holds more than the sum of contributions: the interest.
      const interest = repayment - ethers.parseEther('5')
      expect(await lendingPool.totalFunds()).to.equal(depositAmount + ethers.parseEther('1') + interest)

      // Each member is still capped at what they put in.
      await expect(lendingPool.connect(lender).withdraw(depositAmount + 1n)).to.be.revertedWithCustomError(
        lendingPool,
        'InsufficientBalance'
      )
    })

    describe('withdrawableAmount', function () {
      it('Should equal the contribution when the pool is liquid', async function () {
        expect(await lendingPool.withdrawableAmount(lender.address)).to.equal(depositAmount)
      })

      it('Should be capped by free liquidity when loans are outstanding', async function () {
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('9'))

        expect(await lendingPool.withdrawableAmount(lender.address)).to.equal(ethers.parseEther('2'))
      })

      it('Should be zero for a non-member', async function () {
        expect(await lendingPool.withdrawableAmount(otherAccount.address)).to.equal(0)
      })
    })
  })

  describe('Create Loan', function () {
    beforeEach(async function () {
      // Fund the pool
      await lendingPool.connect(lender).depositFunds({
        value: ethers.parseEther('20'),
      })

      // Borrowing is members-only, so the borrower needs a contribution of
      // their own. It is a gate, not collateral — it does not bound the loan.
      await lendingPool.connect(borrower).depositFunds({
        value: ethers.parseEther('1'),
      })
    })

    it('Should create a loan successfully', async function () {
      const loanAmount = ethers.parseEther('5')
      const borrowerBalanceBefore = await ethers.provider.getBalance(borrower.address)

      await expect(lendingPool.connect(borrower).createLoan(loanAmount))
        .to.emit(lendingPool, 'LoanCreated')
        .withArgs(1, borrower.address, loanAmount)

      // Check loan details
      const loan = await lendingPool.getLoan(1)
      expect(loan.borrower).to.equal(borrower.address)
      expect(loan.amount).to.equal(loanAmount)
      expect(loan.interestRate).to.equal(interestRate)
      expect(loan.isRepaid).to.be.false

      // Check borrower received funds
      const borrowerBalanceAfter = await ethers.provider.getBalance(borrower.address)
      expect(borrowerBalanceAfter).to.be.gt(borrowerBalanceBefore)

      // Check total funds decreased
      expect(await lendingPool.totalFunds()).to.equal(ethers.parseEther('16'))

      // Check next loan ID incremented
      expect(await lendingPool.nextLoanId()).to.equal(2)

      // Check the borrower is now locked to this loan
      expect(await lendingPool.activeLoanId(borrower.address)).to.equal(1)
    })

    it('Should reject a borrower who has never contributed', async function () {
      await expect(lendingPool.connect(otherAccount).createLoan(ethers.parseEther('5'))).to.be.revertedWithCustomError(
        lendingPool,
        'UnauthorizedBorrower'
      )
    })

    it('Should reject a second loan while one is outstanding', async function () {
      await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))

      await expect(lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))).to.be.revertedWithCustomError(
        lendingPool,
        'LoanOutstanding'
      )
    })

    it('Should allow a new loan once the previous one is repaid', async function () {
      await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))
      const repayment = await lendingPool.calculateRepaymentAmount(1)
      await lendingPool.connect(borrower).repayLoan(1, { value: repayment })

      expect(await lendingPool.activeLoanId(borrower.address)).to.equal(0)

      await expect(lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))).to.not.be.reverted
      expect(await lendingPool.activeLoanId(borrower.address)).to.equal(2)
    })

    it('Should lock the borrower out of withdrawing while the loan is open', async function () {
      await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))

      await expect(lendingPool.connect(borrower).withdraw(ethers.parseEther('1'))).to.be.revertedWithCustomError(
        lendingPool,
        'LoanOutstanding'
      )

      const repayment = await lendingPool.calculateRepaymentAmount(1)
      await lendingPool.connect(borrower).repayLoan(1, { value: repayment })

      await expect(lendingPool.connect(borrower).withdraw(ethers.parseEther('1'))).to.not.be.reverted
    })

    it('Should cap one borrower at maxLoanAmount rather than the whole pool', async function () {
      // Before v2 a single caller could drain the pool maxLoanAmount at a time.
      await lendingPool.connect(borrower).createLoan(maxLoanAmount)

      await expect(lendingPool.connect(borrower).createLoan(maxLoanAmount)).to.be.revertedWithCustomError(lendingPool, 'LoanOutstanding')

      // 21 deposited, 10 lent — the rest stays put.
      expect(await lendingPool.totalFunds()).to.equal(ethers.parseEther('11'))
    })

    it('Should reject loan exceeding max amount', async function () {
      const excessiveLoanAmount = ethers.parseEther('15')

      await expect(lendingPool.connect(borrower).createLoan(excessiveLoanAmount)).to.be.revertedWithCustomError(
        lendingPool,
        'ExceedsMaxLoanAmount'
      )
    })

    it('Should reject loan when insufficient funds', async function () {
      // Draining now takes several borrowers, since each is capped at one open
      // loan. 21 ETH available; two 8 ETH loans leave 5.
      const largeLoanAmount = ethers.parseEther('8') // Less than max but more than available

      await lendingPool.connect(borrower).createLoan(ethers.parseEther('8'))
      await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('1') })
      await lendingPool.connect(otherAccount).createLoan(ethers.parseEther('8'))

      // lender is a member with no open loan, but the pool only holds 6.
      await expect(lendingPool.connect(lender).createLoan(largeLoanAmount)).to.be.revertedWithCustomError(lendingPool, 'InsufficientFunds')
    })

    it('Should reject loan when pool is inactive', async function () {
      await lendingPool.connect(owner).togglePoolStatus()

      await expect(lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))).to.be.revertedWithCustomError(
        lendingPool,
        'PoolNotActive'
      )
    })
  })

  describe('Repay Loan', function () {
    let loanId: number
    const loanAmount = ethers.parseEther('5')

    beforeEach(async function () {
      // Fund the pool and create a loan
      await lendingPool.connect(lender).depositFunds({
        value: ethers.parseEther('20'),
      })

      // Borrowing is members-only.
      await lendingPool.connect(borrower).depositFunds({
        value: ethers.parseEther('1'),
      })

      await lendingPool.connect(borrower).createLoan(loanAmount)
      loanId = 1
    })

    it('Should repay loan with correct interest', async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)
      const expectedInterest = (loanAmount * BigInt(interestRate)) / BigInt(10000)
      const expectedTotal = loanAmount + expectedInterest

      expect(repaymentAmount).to.equal(expectedTotal)

      const poolBalanceBefore = await lendingPool.totalFunds()

      await expect(lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount }))
        .to.emit(lendingPool, 'LoanRepaid')
        .withArgs(loanId, borrower.address, repaymentAmount)

      // Check loan is marked as repaid
      const loan = await lendingPool.getLoan(loanId)
      expect(loan.isRepaid).to.be.true

      // Check pool funds increased
      expect(await lendingPool.totalFunds()).to.equal(poolBalanceBefore + repaymentAmount)
    })

    it('Should refund excess payment', async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)
      const excessPayment = repaymentAmount + ethers.parseEther('1')

      const borrowerBalanceBefore = await ethers.provider.getBalance(borrower.address)

      const tx = await lendingPool.connect(borrower).repayLoan(loanId, {
        value: excessPayment,
      })

      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice

      const borrowerBalanceAfter = await ethers.provider.getBalance(borrower.address)

      // Borrower should have received back approximately the excess (minus gas)
      const expectedBalance = borrowerBalanceBefore - repaymentAmount - gasUsed
      expect(borrowerBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther('0.01'))
    })

    it('Should reject repayment from wrong borrower', async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)

      await expect(lendingPool.connect(otherAccount).repayLoan(loanId, { value: repaymentAmount })).to.be.revertedWithCustomError(
        lendingPool,
        'UnauthorizedBorrower'
      )
    })

    it('Should reject insufficient repayment', async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)
      const insufficientAmount = repaymentAmount - ethers.parseEther('0.1')

      await expect(lendingPool.connect(borrower).repayLoan(loanId, { value: insufficientAmount })).to.be.revertedWithCustomError(
        lendingPool,
        'InsufficientRepaymentAmount'
      )
    })

    it('Should reject double repayment', async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)

      // First repayment
      await lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })

      // Second repayment attempt
      await expect(lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })).to.be.revertedWithCustomError(
        lendingPool,
        'LoanAlreadyRepaid'
      )
    })

    /**
     * When a loan was repaid, which is the one fact reputation is made of.
     *
     * `isRepaid` says whether, and said only that until now: a borrower who
     * settled on day 2 and one who settled on day 400 were the same record. The
     * log cannot fill the gap either — `LoanRepaid` carries no timestamp, and a
     * later reader has no way to ask the chain for a log by loan id.
     */
    describe('repaidAt', function () {
      it('Should be zero while the loan is outstanding', async function () {
        expect((await lendingPool.getLoan(loanId)).repaidAt).to.equal(0)
      })

      it('Should be stamped with the repaying block', async function () {
        const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)

        const tx = await lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })
        const receipt = await tx.wait()
        const block = await ethers.provider.getBlock(receipt!.blockNumber)

        expect((await lendingPool.getLoan(loanId)).repaidAt).to.equal(block!.timestamp)
      })

      it('Should let a repayment after the term be told from one inside it', async function () {
        const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)
        const { startTime, duration } = await lendingPool.getLoan(loanId)

        // A day past the due date. Nothing on chain stops this — the term is
        // recorded and unenforced — so the only trace it leaves is the stamp.
        await time.increaseTo(startTime + duration + BigInt(24 * 60 * 60))
        await lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })

        const loan = await lendingPool.getLoan(loanId)

        expect(loan.isRepaid).to.be.true
        expect(loan.repaidAt).to.be.greaterThan(loan.startTime + loan.duration)
      })

      it('Should pack into the slot the borrower already sits in', async function () {
        const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId)
        await lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })

        const address = await lendingPool.getAddress()
        const slot = await findLoanSlot(address, loanId, borrower.address)
        const packed = BigInt(await ethers.provider.getStorage(address, slot))
        const loan = await lendingPool.getLoan(loanId)

        // What the packing claim actually means: `borrower`, `isRepaid`,
        // `status` and `repaidAt` share one word, so the struct still spans
        // five slots and a pool already holding loans reads them unchanged
        // after the upgrade. Appending the field instead would have widened the
        // stride and shifted every loan's `amount` out from under its reader.
        expect(packed & ((1n << 160n) - 1n)).to.equal(BigInt(borrower.address))
        expect((packed >> 160n) & 0xffn).to.equal(1n) // isRepaid
        expect((packed >> 168n) & 0xffn).to.equal(0n) // LoanStatus.Disbursed
        expect((packed >> 176n) & ((1n << 64n) - 1n)).to.equal(loan.repaidAt)

        // The very next word is still `amount`, which is the stride assertion.
        expect(BigInt(await ethers.provider.getStorage(address, slot + 1n))).to.equal(loanAmount)
      })
    })
  })

  describe('Pool Configuration', function () {
    it('Should allow owner to update pool config', async function () {
      const newMaxLoan = ethers.parseEther('20')
      const newInterestRate = 750 // 7.5%
      const newDuration = 60 * 24 * 60 * 60 // 60 days

      await expect(lendingPool.connect(owner).updatePoolConfig(newMaxLoan, newInterestRate, newDuration))
        .to.emit(lendingPool, 'PoolConfigured')
        .withArgs(newMaxLoan, newInterestRate, newDuration)

      const poolConfig = await lendingPool.poolConfig()
      expect(poolConfig.maxLoanAmount).to.equal(newMaxLoan)
      expect(poolConfig.interestRate).to.equal(newInterestRate)
      expect(poolConfig.loanDuration).to.equal(newDuration)
    })

    it('Should reject config updates from non-owner', async function () {
      await expect(
        lendingPool.connect(borrower).updatePoolConfig(ethers.parseEther('20'), 750, 60 * 24 * 60 * 60)
      ).to.be.revertedWithCustomError(lendingPool, 'OwnableUnauthorizedAccount')
    })

    it('Should allow owner to toggle pool status', async function () {
      expect((await lendingPool.poolConfig()).isActive).to.be.true

      await lendingPool.connect(owner).togglePoolStatus()
      expect((await lendingPool.poolConfig()).isActive).to.be.false

      await lendingPool.connect(owner).togglePoolStatus()
      expect((await lendingPool.poolConfig()).isActive).to.be.true
    })
  })

  describe('Pausable', function () {
    it('Should allow owner to pause and unpause', async function () {
      await lendingPool.connect(owner).pause()
      expect(await lendingPool.paused()).to.be.true

      // Should reject operations when paused
      await expect(lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('1') })).to.be.revertedWithCustomError(
        lendingPool,
        'EnforcedPause'
      )

      await lendingPool.connect(owner).unpause()
      expect(await lendingPool.paused()).to.be.false

      // Should allow operations when unpaused
      await expect(lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('1') })).to.not.be.reverted
    })
  })

  describe('Upgradeability', function () {
    it('Should upgrade every pool on the beacon at once', async function () {
      // The whole reason for the beacon. Under ERC-1167 clones each pool
      // hardcoded its implementation, so an upgrade reached only pools created
      // afterwards and the population forked on every change.
      const LendingPool = await ethers.getContractFactory('LendingPool')
      const beacon = await upgrades.deployBeacon(LendingPool)
      await beacon.waitForDeployment()

      const first = (await upgrades.deployBeaconProxy(beacon, LendingPool, [
        owner.address,
        maxLoanAmount,
        interestRate,
        loanDuration,
        false,
      ])) as unknown as LendingPool
      const second = (await upgrades.deployBeaconProxy(beacon, LendingPool, [
        owner.address,
        maxLoanAmount,
        interestRate,
        loanDuration,
        false,
      ])) as unknown as LendingPool

      const before = await upgrades.beacon.getImplementationAddress(await beacon.getAddress())

      await upgrades.upgradeBeacon(beacon, LendingPool, { redeployImplementation: 'always' })

      const after = await upgrades.beacon.getImplementationAddress(await beacon.getAddress())
      expect(after).to.not.equal(before)

      // Both pools follow the beacon without being touched individually, and
      // their state survives — the point of upgrading rather than redeploying.
      expect(await first.owner()).to.equal(owner.address)
      expect(await second.owner()).to.equal(owner.address)
      expect((await first.poolConfig()).maxLoanAmount).to.equal(maxLoanAmount)
    })

    it('Should not pretend to be individually upgradeable', async function () {
      // The implementation used to inherit UUPSUpgradeable while being deployed
      // as a minimal clone, so `upgradeToAndCall` existed, wrote the ERC-1967
      // slot that a clone never reads, and reported success having changed
      // nothing. Removing it is what makes the upgrade path honest.
      const pool = lendingPool as unknown as { upgradeToAndCall?: unknown }

      expect(pool.upgradeToAndCall).to.be.undefined
    })
  })
  describe('Loan approval', function () {
    const requested = ethers.parseEther('5')

    beforeEach(async function () {
      // Both parties must be members: borrowing at all requires a contribution.
      await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('50') })
      await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('10') })
    })

    it('lends on demand until the owner asks to review requests', async function () {
      // The default has to stay what every earlier pool did, or turning this on
      // by accident would be a silent behaviour change.
      expect((await lendingPool.poolConfig()).requiresApproval).to.be.false

      await expect(lendingPool.connect(borrower).createLoan(requested)).to.not.be.reverted
    })

    it('closes the side door once approval is on', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)

      await expect(lendingPool.connect(borrower).createLoan(requested)).to.be.revertedWithCustomError(lendingPool, 'ApprovalRequired')
    })

    it('only lets the owner change the requirement', async function () {
      await expect(lendingPool.connect(borrower).setRequiresApproval(true)).to.be.reverted
    })

    it('records a request without moving any funds', async function () {
      // A request reserves nothing, which is why liquidity is checked at
      // approval instead.
      await lendingPool.connect(owner).setRequiresApproval(true)
      const fundsBefore = await lendingPool.totalFunds()

      await expect(lendingPool.connect(borrower).requestLoan(requested))
        .to.emit(lendingPool, 'LoanRequested')
        .withArgs(1, borrower.address, requested)

      expect(await lendingPool.totalFunds()).to.equal(fundsBefore)
      const loan = await lendingPool.getLoan(1)
      expect(loan.status).to.equal(1) // Requested
      expect(loan.isRepaid).to.be.false
    })

    it('disburses on approval and starts the term then', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)
      const requestedAt = (await lendingPool.getLoan(1)).startTime

      await ethers.provider.send('evm_increaseTime', [3600])
      await expect(lendingPool.connect(owner).approveLoan(1)).to.changeEtherBalance(borrower, requested)

      const loan = await lendingPool.getLoan(1)
      expect(loan.status).to.equal(0) // Disbursed
      // The clock runs from when the money arrived, not from when it was asked for.
      expect(loan.startTime).to.be.greaterThan(requestedAt)
    })

    it('refuses to approve more than the pool holds', async function () {
      // Checked at approval, not at request: the balance moves in between.
      await lendingPool.connect(owner).setRequiresApproval(true)
      // A member with a small stake asks for the full cap, so the others can
      // withdraw everything else and leave the pool unable to cover it. The
      // requester's own stake is locked by the request, hence the small one.
      await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('1') })
      await lendingPool.connect(otherAccount).requestLoan(maxLoanAmount)

      await lendingPool.connect(lender).withdraw(ethers.parseEther('50'))
      await lendingPool.connect(borrower).withdraw(ethers.parseEther('10'))

      await expect(lendingPool.connect(owner).approveLoan(1)).to.be.revertedWithCustomError(lendingPool, 'InsufficientFunds')
    })

    it('only lets the owner approve', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)

      await expect(lendingPool.connect(borrower).approveLoan(1)).to.be.reverted
    })

    it('frees the borrower when a request is rejected', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)

      await expect(lendingPool.connect(owner).rejectLoan(1)).to.emit(lendingPool, 'LoanRejected').withArgs(1, borrower.address, requested)

      expect((await lendingPool.getLoan(1)).status).to.equal(2) // Rejected
      expect(await lendingPool.activeLoanId(borrower.address)).to.equal(0)
      await expect(lendingPool.connect(borrower).requestLoan(requested)).to.not.be.reverted
    })

    it('lets a borrower withdraw their own request', async function () {
      // Without this a borrower whose owner never decides is stuck forever:
      // the request holds their one open-loan slot.
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)

      await expect(lendingPool.connect(borrower).cancelLoanRequest(1)).to.emit(lendingPool, 'LoanRejected')

      expect(await lendingPool.activeLoanId(borrower.address)).to.equal(0)
    })

    it('does not let one member cancel a request that is not theirs', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)

      await expect(lendingPool.connect(lender).cancelLoanRequest(1)).to.be.revertedWithCustomError(lendingPool, 'UnauthorizedBorrower')
    })

    it('allows one open request or loan, never both', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)

      await expect(lendingPool.connect(borrower).requestLoan(requested)).to.be.revertedWithCustomError(lendingPool, 'LoanOutstanding')
    })

    it('refuses to act twice on the same request', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)
      await lendingPool.connect(owner).approveLoan(1)

      await expect(lendingPool.connect(owner).approveLoan(1)).to.be.revertedWithCustomError(lendingPool, 'LoanNotPending')
      await expect(lendingPool.connect(owner).rejectLoan(1)).to.be.revertedWithCustomError(lendingPool, 'LoanNotPending')
    })

    it('refuses a request from someone who has never contributed', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)

      await expect(lendingPool.connect(otherAccount).requestLoan(requested)).to.be.revertedWithCustomError(
        lendingPool,
        'UnauthorizedBorrower'
      )
    })

    it('refuses a request above the per-loan cap', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)

      await expect(lendingPool.connect(borrower).requestLoan(maxLoanAmount + 1n)).to.be.revertedWithCustomError(
        lendingPool,
        'ExceedsMaxLoanAmount'
      )
    })

    it('reads a loan created before the status field as disbursed', async function () {
      // The enum zero value. A loan written before `status` existed reads zero
      // for it, and every one of those was disbursed on creation, so
      // reordering the enum would silently relabel them all.
      await lendingPool.connect(borrower).createLoan(requested)

      expect((await lendingPool.getLoan(1)).status).to.equal(0)
    })

    it('repays an approved loan like any other', async function () {
      await lendingPool.connect(owner).setRequiresApproval(true)
      await lendingPool.connect(borrower).requestLoan(requested)
      await lendingPool.connect(owner).approveLoan(1)

      const due = await lendingPool.calculateRepaymentAmount(1)
      await expect(lendingPool.connect(borrower).repayLoan(1, { value: due })).to.emit(lendingPool, 'LoanRepaid')

      expect((await lendingPool.getLoan(1)).isRepaid).to.be.true
    })
  })

  describe('Membership', function () {
    const deposit = ethers.parseEther('10')

    // Membership.None = 0, Requested = 1, Active = 2, Rejected = 3,
    // Removed = 4, Left = 5
    const NONE = 0n
    const REQUESTED = 1n
    const ACTIVE = 2n
    const REJECTED = 3n
    const REMOVED = 4n
    const LEFT = 5n

    /**
     * Every count here is relative to the owner, who is `Active` in their own
     * pool from the moment they own it — otherwise a permissioned pool would
     * refuse its own creator's deposit.
     */
    const OWNER_ONLY = 1n

    it('starts every address at None with the correct zero value', async function () {
      // Unlike LoanStatus, this enum gets to put the semantically right value at
      // zero: an address nobody has heard of has no membership.
      expect(await lendingPool.membership(otherAccount.address)).to.equal(NONE)
      expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
    })

    it('makes the pool’s creator a member of it', async function () {
      // `initialize` reaches `_transferOwnership`, so the grant happens at
      // birth and the first log a pool ever emits is its owner joining.
      expect(await lendingPool.membership(owner.address)).to.equal(ACTIVE)
    })

    it('leaves a new pool open, as every pool was before this existed', async function () {
      expect((await lendingPool.poolConfig()).requiresMembership).to.be.false
    })

    describe('an open pool', function () {
      it('enrols a first-time depositor', async function () {
        await expect(lendingPool.connect(lender).depositFunds({ value: deposit }))
          .to.emit(lendingPool, 'MemberJoined')
          .withArgs(lender.address)

        expect(await lendingPool.membership(lender.address)).to.equal(ACTIVE)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY + 1n)
      })

      it('does not enrol the same depositor twice', async function () {
        await lendingPool.connect(lender).depositFunds({ value: deposit })
        await expect(lendingPool.connect(lender).depositFunds({ value: deposit })).to.not.emit(lendingPool, 'MemberJoined')

        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY + 1n)
      })

      it('does not readmit someone the owner removed', async function () {
        // The gate being off must not undo the owner's decision, or turning it
        // back on would silently let them in again.
        await lendingPool.connect(lender).depositFunds({ value: deposit })
        await lendingPool.connect(owner).removeMember(lender.address)

        await lendingPool.connect(lender).depositFunds({ value: deposit })

        expect(await lendingPool.membership(lender.address)).to.equal(REMOVED)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
      })

      it('re-enrols someone who left of their own accord', async function () {
        await lendingPool.connect(lender).depositFunds({ value: deposit })
        await lendingPool.connect(lender).leavePool()

        await lendingPool.connect(lender).depositFunds({ value: deposit })

        expect(await lendingPool.membership(lender.address)).to.equal(ACTIVE)
      })
    })

    describe('a permissioned pool', function () {
      beforeEach(async function () {
        await lendingPool.connect(owner).setRequiresMembership(true)
      })

      it('refuses a deposit from a non-member', async function () {
        await expect(lendingPool.connect(otherAccount).depositFunds({ value: deposit })).to.be.revertedWithCustomError(
          lendingPool,
          'NotAMember'
        )
      })

      it('refuses a deposit from someone merely waiting', async function () {
        await lendingPool.connect(otherAccount).requestMembership()

        await expect(lendingPool.connect(otherAccount).depositFunds({ value: deposit })).to.be.revertedWithCustomError(
          lendingPool,
          'NotAMember'
        )
      })

      it('takes a deposit once the owner admits them', async function () {
        await lendingPool.connect(lender).requestMembership()
        await lendingPool.connect(owner).approveMember(lender.address)

        await expect(lendingPool.connect(lender).depositFunds({ value: deposit })).to.not.be.reverted
      })

      it('strands nobody when the owner closes an open pool', async function () {
        // The whole point of writing the register in both modes: everyone who
        // deposited while it was open is already Active.
        await lendingPool.connect(owner).setRequiresMembership(false)
        await lendingPool.connect(lender).depositFunds({ value: deposit })
        await lendingPool.connect(owner).setRequiresMembership(true)

        await expect(lendingPool.connect(lender).depositFunds({ value: deposit })).to.not.be.reverted
      })

      it('only lets the owner change the requirement', async function () {
        await expect(lendingPool.connect(borrower).setRequiresMembership(false)).to.be.reverted
      })
    })

    describe('the request lifecycle', function () {
      it('records a request', async function () {
        await expect(lendingPool.connect(otherAccount).requestMembership())
          .to.emit(lendingPool, 'MembershipRequested')
          .withArgs(otherAccount.address)

        expect(await lendingPool.membership(otherAccount.address)).to.equal(REQUESTED)
        // Asking is not joining.
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
      })

      it('refuses a second request while one is waiting', async function () {
        await lendingPool.connect(otherAccount).requestMembership()

        await expect(lendingPool.connect(otherAccount).requestMembership()).to.be.revertedWithCustomError(lendingPool, 'AlreadyMember')
      })

      it('refuses a request from someone already in', async function () {
        await lendingPool.connect(lender).depositFunds({ value: deposit })

        await expect(lendingPool.connect(lender).requestMembership()).to.be.revertedWithCustomError(lendingPool, 'AlreadyMember')
      })

      it('admits an applicant', async function () {
        await lendingPool.connect(otherAccount).requestMembership()

        await expect(lendingPool.connect(owner).approveMember(otherAccount.address))
          .to.emit(lendingPool, 'MembershipApproved')
          .withArgs(otherAccount.address)

        expect(await lendingPool.membership(otherAccount.address)).to.equal(ACTIVE)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY + 1n)
      })

      it('turns an applicant down', async function () {
        await lendingPool.connect(otherAccount).requestMembership()

        await expect(lendingPool.connect(owner).rejectMember(otherAccount.address))
          .to.emit(lendingPool, 'MembershipRejected')
          .withArgs(otherAccount.address)

        expect(await lendingPool.membership(otherAccount.address)).to.equal(REJECTED)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
      })

      it('lets a rejected applicant ask again', async function () {
        await lendingPool.connect(otherAccount).requestMembership()
        await lendingPool.connect(owner).rejectMember(otherAccount.address)

        await expect(lendingPool.connect(otherAccount).requestMembership()).to.not.be.reverted
      })

      it('cannot decide the same request twice', async function () {
        await lendingPool.connect(otherAccount).requestMembership()
        await lendingPool.connect(owner).approveMember(otherAccount.address)

        await expect(lendingPool.connect(owner).approveMember(otherAccount.address)).to.be.revertedWithCustomError(
          lendingPool,
          'NoPendingRequest'
        )
      })

      it('cannot decide on someone who never asked', async function () {
        await expect(lendingPool.connect(owner).rejectMember(otherAccount.address)).to.be.revertedWithCustomError(
          lendingPool,
          'NoPendingRequest'
        )
      })

      it('only lets the owner decide', async function () {
        await lendingPool.connect(otherAccount).requestMembership()

        await expect(lendingPool.connect(borrower).approveMember(otherAccount.address)).to.be.reverted
      })

      it('queues two applicants independently', async function () {
        await lendingPool.connect(borrower).requestMembership()
        await lendingPool.connect(otherAccount).requestMembership()

        await lendingPool.connect(owner).approveMember(borrower.address)

        expect(await lendingPool.membership(borrower.address)).to.equal(ACTIVE)
        expect(await lendingPool.membership(otherAccount.address)).to.equal(REQUESTED)
      })
    })

    describe('leaving and removal', function () {
      beforeEach(async function () {
        await lendingPool.connect(lender).depositFunds({ value: deposit })
      })

      it('removes a member', async function () {
        await expect(lendingPool.connect(owner).removeMember(lender.address))
          .to.emit(lendingPool, 'MembershipRevoked')
          .withArgs(lender.address)

        expect(await lendingPool.membership(lender.address)).to.equal(REMOVED)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
      })

      it('lets a member leave', async function () {
        await expect(lendingPool.connect(lender).leavePool()).to.emit(lendingPool, 'MembershipLeft').withArgs(lender.address)

        expect(await lendingPool.membership(lender.address)).to.equal(LEFT)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
      })

      it('cannot remove someone who is not a member', async function () {
        await expect(lendingPool.connect(owner).removeMember(otherAccount.address)).to.be.revertedWithCustomError(lendingPool, 'NotAMember')
      })

      it('only lets the owner remove', async function () {
        await expect(lendingPool.connect(borrower).removeMember(lender.address)).to.be.reverted
      })

      it('leaves a removed member able to withdraw everything', async function () {
        // The rule that matters most in this milestone: removal takes away what
        // you may do next, never what you already put in.
        await lendingPool.connect(owner).removeMember(lender.address)

        await expect(lendingPool.connect(lender).withdraw(deposit)).to.changeEtherBalance(lender, deposit)
        expect(await lendingPool.contributions(lender.address)).to.equal(0)
      })

      it('leaves a departed member able to withdraw everything', async function () {
        await lendingPool.connect(lender).leavePool()

        await expect(lendingPool.connect(lender).withdraw(deposit)).to.changeEtherBalance(lender, deposit)
      })

      it('leaves a removed borrower able to repay', async function () {
        await lendingPool.connect(borrower).depositFunds({ value: deposit })
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))
        await lendingPool.connect(owner).removeMember(borrower.address)

        const due = await lendingPool.calculateRepaymentAmount(1)
        await expect(lendingPool.connect(borrower).repayLoan(1, { value: due })).to.emit(lendingPool, 'LoanRepaid')
      })

      it('refuses to remove the owner from their own pool', async function () {
        await expect(lendingPool.connect(owner).removeMember(owner.address)).to.be.revertedWithCustomError(
          lendingPool,
          'OwnerIsAlwaysAMember'
        )
      })

      it('refuses to let the owner leave', async function () {
        await expect(lendingPool.connect(owner).leavePool()).to.be.revertedWithCustomError(lendingPool, 'OwnerIsAlwaysAMember')
      })
    })

    describe('the owner’s own standing', function () {
      // The lockout this exists to prevent: `depositFunds` on a permissioned
      // pool requires `Active`, and nothing used to grant it to the creator —
      // so the owner could not fund the pool they had just made, and the only
      // way in was to ask themselves and then approve it.

      it('lets the owner fund a permissioned pool', async function () {
        await lendingPool.connect(owner).setRequiresMembership(true)

        await expect(lendingPool.connect(owner).depositFunds({ value: deposit })).to.not.be.reverted
      })

      it('lets the owner borrow from it', async function () {
        await lendingPool.connect(owner).setRequiresMembership(true)
        await lendingPool.connect(owner).depositFunds({ value: ethers.parseEther('50') })

        await expect(lendingPool.connect(owner).createLoan(ethers.parseEther('5'))).to.not.be.reverted
      })

      it('does not enrol the owner twice when they deposit', async function () {
        await expect(lendingPool.connect(owner).depositFunds({ value: deposit })).to.not.emit(lendingPool, 'MemberJoined')

        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY)
      })

      it('refuses the owner a request to join what they already own', async function () {
        await expect(lendingPool.connect(owner).requestMembership()).to.be.revertedWithCustomError(lendingPool, 'AlreadyMember')
      })

      it('enrols a new owner on transfer', async function () {
        // Otherwise handing the pool over recreates the lockout for its new
        // owner, on a pool that may already be permissioned.
        await expect(lendingPool.connect(owner).transferOwnership(otherAccount.address))
          .to.emit(lendingPool, 'MemberJoined')
          .withArgs(otherAccount.address)

        expect(await lendingPool.membership(otherAccount.address)).to.equal(ACTIVE)
        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY + 1n)
      })

      it('leaves the outgoing owner a member', async function () {
        // They may still hold a contribution, and being demoted is not being
        // turned out.
        await lendingPool.connect(owner).transferOwnership(otherAccount.address)

        expect(await lendingPool.membership(owner.address)).to.equal(ACTIVE)
      })

      it('does not count a member promoted to owner twice', async function () {
        await lendingPool.connect(lender).depositFunds({ value: deposit })

        await lendingPool.connect(owner).transferOwnership(lender.address)

        expect(await lendingPool.memberCount()).to.equal(OWNER_ONLY + 1n)
      })

      it('lets the new owner leave once they are only a member again', async function () {
        await lendingPool.connect(owner).transferOwnership(otherAccount.address)

        await expect(lendingPool.connect(owner).leavePool()).to.emit(lendingPool, 'MembershipLeft').withArgs(owner.address)
      })
    })

    describe('the borrow gate', function () {
      it('refuses a non-member', async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('50') })

        await expect(lendingPool.connect(otherAccount).createLoan(ethers.parseEther('5'))).to.be.revertedWithCustomError(
          lendingPool,
          'UnauthorizedBorrower'
        )
      })

      it('refuses a removed member', async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('50') })
        await lendingPool.connect(borrower).depositFunds({ value: deposit })
        await lendingPool.connect(owner).removeMember(borrower.address)

        await expect(lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))).to.be.revertedWithCustomError(
          lendingPool,
          'UnauthorizedBorrower'
        )
      })

      it('allows a member the owner admitted but who never lent', async function () {
        // The deliberate change: membership is the gate now, not a contribution.
        // A trust circle can lend to someone who has not funded it.
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('50') })
        await lendingPool.connect(owner).setRequiresMembership(true)
        await lendingPool.connect(borrower).requestMembership()
        await lendingPool.connect(owner).approveMember(borrower.address)

        expect(await lendingPool.contributions(borrower.address)).to.equal(0)
        await expect(lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))).to.not.be.reverted
      })

      it('refuses a non-member asking on a reviewing pool', async function () {
        await lendingPool.connect(owner).setRequiresApproval(true)

        await expect(lendingPool.connect(otherAccount).requestLoan(ethers.parseEther('5'))).to.be.revertedWithCustomError(
          lendingPool,
          'UnauthorizedBorrower'
        )
      })
    })
  })

  describe('Interest accrual', function () {
    /** Borrows `amount` and repays it, returning the interest that produced. */
    async function borrowAndRepay(who: SignerWithAddress, amount: bigint): Promise<bigint> {
      await lendingPool.connect(who).createLoan(amount)
      const loanId = (await lendingPool.nextLoanId()) - 1n
      const due = await lendingPool.calculateRepaymentAmount(loanId)
      await lendingPool.connect(who).repayLoan(loanId, { value: due })

      return due - amount
    }

    describe('totalContributions', function () {
      it('rises with deposits and falls with withdrawals', async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('10') })
        await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('6') })

        expect(await lendingPool.totalContributions()).to.equal(ethers.parseEther('16'))

        await lendingPool.connect(lender).withdraw(ethers.parseEther('4'))

        expect(await lendingPool.totalContributions()).to.equal(ethers.parseEther('12'))
      })

      it('does not move when a loan goes out, unlike totalFunds', async function () {
        // The distinction the whole design turns on: lending money out empties
        // the pool without reducing what it owes its members.
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })

        await lendingPool.connect(borrower).createLoan(ethers.parseEther('10'))

        expect(await lendingPool.totalFunds()).to.equal(ethers.parseEther('11'))
        expect(await lendingPool.totalContributions()).to.equal(ethers.parseEther('21'))
      })

      it('is unchanged by membership decisions', async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('10') })

        await lendingPool.connect(owner).removeMember(lender.address)

        expect(await lendingPool.totalContributions()).to.equal(ethers.parseEther('10'))
      })
    })

    describe('distribution', function () {
      beforeEach(async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
      })

      it('credits the whole interest out, and never more', async function () {
        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))

        const total = (await lendingPool.claimable(lender.address)) + (await lendingPool.claimable(borrower.address))

        // Integer division leaves dust in the pool; it never overpays.
        expect(total).to.be.lte(interest)
        expect(total).to.be.closeTo(interest, 100n)
      })

      it('splits pro rata between unequal contributors', async function () {
        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))

        // 20 : 1, so the lender takes twenty twenty-firsts.
        expect(await lendingPool.claimable(lender.address)).to.be.closeTo((interest * 20n) / 21n, 100n)
        expect(await lendingPool.claimable(borrower.address)).to.be.closeTo(interest / 21n, 100n)
      })

      it('emits InterestDistributed with the interest alone, not the repayment', async function () {
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('10'))
        const due = await lendingPool.calculateRepaymentAmount(1)
        const interest = due - ethers.parseEther('10')

        await expect(lendingPool.connect(borrower).repayLoan(1, { value: due }))
          .to.emit(lendingPool, 'InterestDistributed')
          .withArgs(1, interest)
      })

      it('distributes correctly while another loan is still outstanding', async function () {
        // The check that catches `totalFunds` being used as the denominator:
        // with 10 of 21 lent out, that mistake would pay roughly double.
        await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('9') })
        await lendingPool.connect(otherAccount).createLoan(ethers.parseEther('10'))

        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))

        // 30 contributed in total, of which the lender put in 20.
        expect(await lendingPool.claimable(lender.address)).to.be.closeTo((interest * 20n) / 30n, 100n)
      })

      it('leaves the interest in the pool when nobody is contributing', async function () {
        // Only reachable because an admitted member can borrow without lending:
        // that lets every contributor leave while a loan is still running.
        await lendingPool.connect(lender).withdraw(ethers.parseEther('20'))
        await lendingPool.connect(borrower).withdraw(ethers.parseEther('1'))
        expect(await lendingPool.totalContributions()).to.equal(0)

        await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('10') })
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))
        await lendingPool.connect(otherAccount).withdraw(ethers.parseEther('5'))

        const due = await lendingPool.calculateRepaymentAmount(1)
        await lendingPool.connect(borrower).repayLoan(1, { value: due })
        await lendingPool.connect(otherAccount).withdraw(ethers.parseEther('5'))
        expect(await lendingPool.totalContributions()).to.equal(0)

        // A second loan out of what is left, repaid into an empty register.
        const stranded = await lendingPool.totalFunds()
        const accBefore = await lendingPool.accInterestPerShare()

        await lendingPool.connect(borrower).createLoan(stranded)
        const due2 = await lendingPool.calculateRepaymentAmount(2)
        await expect(lendingPool.connect(borrower).repayLoan(2, { value: due2 })).to.not.emit(lendingPool, 'InterestDistributed')

        expect(await lendingPool.accInterestPerShare()).to.equal(accBefore)
      })
    })

    describe('interestDebt', function () {
      beforeEach(async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
      })

      it('earns nothing from a repayment that predates the deposit', async function () {
        // The test the design turns on. Without `interestDebt`, a latecomer
        // would take a share of every repayment the pool ever collected.
        await borrowAndRepay(borrower, ethers.parseEther('10'))

        await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('20') })

        expect(await lendingPool.claimable(otherAccount.address)).to.equal(0)
      })

      it('earns from repayments after the deposit, at the new weight', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(otherAccount).depositFunds({ value: ethers.parseEther('21') })

        const before = await lendingPool.claimable(lender.address)
        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))

        // 42 contributed now, half of it the newcomer's.
        expect(await lendingPool.claimable(otherAccount.address)).to.be.closeTo(interest / 2n, 100n)
        expect((await lendingPool.claimable(lender.address)) - before).to.be.closeTo((interest * 20n) / 42n, 100n)
      })

      it('does not multiply what a second deposit earned before it', async function () {
        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))
        const earned = await lendingPool.claimable(lender.address)

        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })

        // Topping up banks the accrual; it does not re-scale it against the
        // larger stake.
        expect(await lendingPool.claimable(lender.address)).to.equal(earned)
        expect(earned).to.be.closeTo((interest * 20n) / 21n, 100n)
      })

      it('keeps the accrual when the contribution is withdrawn', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        const earned = await lendingPool.claimable(lender.address)
        expect(earned).to.be.gt(0)

        await lendingPool.connect(lender).withdraw(ethers.parseEther('20'))

        expect(await lendingPool.contributions(lender.address)).to.equal(0)
        expect(await lendingPool.claimable(lender.address)).to.equal(earned)
      })

      it('stops accruing once the stake is gone', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(lender).withdraw(ethers.parseEther('20'))
        const earned = await lendingPool.claimable(lender.address)

        // Small: the lender just took 20 of the pool's liquidity out with them.
        await borrowAndRepay(borrower, ethers.parseEther('1'))

        expect(await lendingPool.claimable(lender.address)).to.equal(earned)
      })

      it('keeps accruing for a removed member whose stake is still in', async function () {
        // Removal takes away what you may do next, not what your money is
        // still doing for the pool.
        await lendingPool.connect(owner).removeMember(lender.address)

        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))

        expect(await lendingPool.claimable(lender.address)).to.be.closeTo((interest * 20n) / 21n, 100n)
      })
    })

    describe('claimable', function () {
      it('is zero for an address that never contributed', async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
        await borrowAndRepay(borrower, ethers.parseEther('10'))

        expect(await lendingPool.claimable(otherAccount.address)).to.equal(0)
      })

      it('is zero before any repayment', async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })

        expect(await lendingPool.claimable(lender.address)).to.equal(0)
      })

      it('is not capped by free liquidity', async function () {
        // Unlike `withdrawableAmount`: an outstanding loan must not make an
        // earnings figure appear to shrink.
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
        await borrowAndRepay(borrower, ethers.parseEther('10'))

        const earned = await lendingPool.claimable(lender.address)
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('10'))
        await lendingPool.connect(lender).withdraw(await lendingPool.totalFunds())

        expect(await lendingPool.totalFunds()).to.equal(0)
        expect(await lendingPool.claimable(lender.address)).to.equal(earned)
      })
    })

    describe('claimInterest', function () {
      beforeEach(async function () {
        await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
        await lendingPool.connect(borrower).depositFunds({ value: ethers.parseEther('1') })
      })

      it('pays out what claimable reported', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        const earned = await lendingPool.claimable(lender.address)
        expect(earned).to.be.gt(0)

        const balanceBefore = await ethers.provider.getBalance(lender.address)
        const tx = await lendingPool.connect(lender).claimInterest()
        const receipt = await tx.wait()
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice

        expect(await ethers.provider.getBalance(lender.address)).to.equal(balanceBefore + earned - gasUsed)
      })

      it('emits InterestClaimed', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        const earned = await lendingPool.claimable(lender.address)

        await expect(lendingPool.connect(lender).claimInterest()).to.emit(lendingPool, 'InterestClaimed').withArgs(lender.address, earned)
      })

      it('takes the payout out of pool liquidity', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        const earned = await lendingPool.claimable(lender.address)
        const fundsBefore = await lendingPool.totalFunds()

        await lendingPool.connect(lender).claimInterest()

        expect(await lendingPool.totalFunds()).to.equal(fundsBefore - earned)
      })

      it('leaves the contribution untouched', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))

        await lendingPool.connect(lender).claimInterest()

        expect(await lendingPool.contributions(lender.address)).to.equal(ethers.parseEther('20'))
        expect(await lendingPool.totalContributions()).to.equal(ethers.parseEther('21'))
      })

      it('pays once, not twice', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(lender).claimInterest()

        expect(await lendingPool.claimable(lender.address)).to.equal(0)
        await expect(lendingPool.connect(lender).claimInterest()).to.be.revertedWithCustomError(lendingPool, 'NothingToClaim')
      })

      it('refuses an account that has earned nothing', async function () {
        await expect(lendingPool.connect(otherAccount).claimInterest()).to.be.revertedWithCustomError(lendingPool, 'NothingToClaim')
      })

      it('keeps earning after a claim', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(lender).claimInterest()

        const interest = await borrowAndRepay(borrower, ethers.parseEther('10'))

        expect(await lendingPool.claimable(lender.address)).to.be.closeTo((interest * 20n) / 21n, 100n)
      })

      it('refuses a claim the pool cannot cover, rather than paying part of it', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        const earned = await lendingPool.claimable(lender.address)

        // Drain the free liquidity into a loan.
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('10'))
        await lendingPool.connect(lender).withdraw(await lendingPool.totalFunds())
        expect(await lendingPool.totalFunds()).to.equal(0)

        await expect(lendingPool.connect(lender).claimInterest()).to.be.revertedWithCustomError(lendingPool, 'InsufficientLiquidity')

        // Delayed, not lost: repaying the loan makes the claim work.
        const due = await lendingPool.calculateRepaymentAmount(2)
        await lendingPool.connect(borrower).repayLoan(2, { value: due })

        await expect(lendingPool.connect(lender).claimInterest()).to.emit(lendingPool, 'InterestClaimed')
        expect(await lendingPool.claimable(lender.address)).to.be.gte(0)
        expect(earned).to.be.gt(0)
      })

      it('lets a removed member claim', async function () {
        // Same rule as `withdraw`: removal takes away what you may do next, not
        // what you already earned.
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(owner).removeMember(lender.address)

        await expect(lendingPool.connect(lender).claimInterest()).to.emit(lendingPool, 'InterestClaimed')
      })

      it('lets a member who has left claim', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(lender).leavePool()

        await expect(lendingPool.connect(lender).claimInterest()).to.emit(lendingPool, 'InterestClaimed')
      })

      it('lets someone who withdrew their whole contribution claim', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(lender).withdraw(ethers.parseEther('20'))

        await expect(lendingPool.connect(lender).claimInterest()).to.emit(lendingPool, 'InterestClaimed')
      })

      it('lets a borrower with an outstanding loan claim', async function () {
        // Unlike `withdraw`, which locks the stake: interest was never part of
        // what borrowing puts up.
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(borrower).createLoan(ethers.parseEther('5'))

        expect(await lendingPool.activeLoanId(borrower.address)).to.not.equal(0)
        await expect(lendingPool.connect(borrower).claimInterest()).to.emit(lendingPool, 'InterestClaimed')
      })

      it('refuses claims while paused', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))
        await lendingPool.connect(owner).pause()

        await expect(lendingPool.connect(lender).claimInterest()).to.be.revertedWithCustomError(lendingPool, 'EnforcedPause')
      })

      it('never pays out more than the pool earned', async function () {
        await borrowAndRepay(borrower, ethers.parseEther('10'))

        await lendingPool.connect(lender).claimInterest()
        await lendingPool.connect(borrower).claimInterest()

        // Everything is back to principal, give or take the rounding dust.
        expect(await lendingPool.totalFunds()).to.be.gte(ethers.parseEther('21'))
        expect(await lendingPool.totalFunds()).to.be.closeTo(ethers.parseEther('21'), 100n)
      })
    })
  })
})
