import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { SampleLendingPool } from '../typechain-types'

/**
 * Deploys a pool the way the factory does: behind a beacon proxy.
 *
 * Not `deployProxy`/UUPS any more — pools are beacon proxies now, and the
 * implementation deliberately no longer inherits `UUPSUpgradeable`, so a UUPS
 * deployment is rejected outright. Testing through a beacon is also the only
 * way these tests exercise the delegation path production actually uses.
 */
async function deployPoolBehindBeacon(args: unknown[]): Promise<SampleLendingPool> {
  const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
  const beacon = await upgrades.deployBeacon(SampleLendingPool)
  await beacon.waitForDeployment()

  const pool = (await upgrades.deployBeaconProxy(beacon, SampleLendingPool, args)) as unknown as SampleLendingPool
  await pool.waitForDeployment()

  return pool
}

describe('SampleLendingPool', function () {
  let lendingPool: SampleLendingPool
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
    lendingPool = await deployPoolBehindBeacon([owner.address, maxLoanAmount, interestRate, loanDuration])

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
      const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
      const beacon = await upgrades.deployBeacon(SampleLendingPool)
      await beacon.waitForDeployment()

      const first = (await upgrades.deployBeaconProxy(beacon, SampleLendingPool, [
        owner.address,
        maxLoanAmount,
        interestRate,
        loanDuration,
      ])) as unknown as SampleLendingPool
      const second = (await upgrades.deployBeaconProxy(beacon, SampleLendingPool, [
        owner.address,
        maxLoanAmount,
        interestRate,
        loanDuration,
      ])) as unknown as SampleLendingPool

      const before = await upgrades.beacon.getImplementationAddress(await beacon.getAddress())

      await upgrades.upgradeBeacon(beacon, SampleLendingPool, { redeployImplementation: 'always' })

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
})
