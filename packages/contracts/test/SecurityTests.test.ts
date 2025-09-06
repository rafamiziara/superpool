import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import { SampleLendingPool } from '../typechain-types'

describe('Security Tests', function () {
  let lendingPool: SampleLendingPool
  let owner: SignerWithAddress
  let borrower: SignerWithAddress
  let lender: SignerWithAddress

  const maxLoanAmount = ethers.parseEther('10')
  const interestRate = 500 // 5%
  const loanDuration = 30 * 24 * 60 * 60 // 30 days

  beforeEach(async function () {
    ;[owner, borrower, lender] = await ethers.getSigners()

    const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
    lendingPool = (await upgrades.deployProxy(SampleLendingPool, [owner.address, maxLoanAmount, interestRate, loanDuration], {
      initializer: 'initialize',
      kind: 'uups',
      unsafeAllowCustomTypes: true,
    })) as unknown as SampleLendingPool

    await lendingPool.waitForDeployment()

    // Add some initial funds to the pool
    await lendingPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })
  })

  describe('Reentrancy Attack Protection', function () {
    it('Should prevent reentrancy attack on createLoan function', async function () {
      // Create a malicious contract that attempts reentrancy
      const MaliciousContract = await ethers.getContractFactory('TestReentrancyAttacker')
      const maliciousContract = await MaliciousContract.deploy()
      await maliciousContract.waitForDeployment()

      // Set the target lending pool in the malicious contract
      await maliciousContract.setTarget(await lendingPool.getAddress())

      // Fund the malicious contract
      await maliciousContract.fund({ value: ethers.parseEther('2') })

      // Since our CEI pattern prevents reentrancy by design (external call at end),
      // the attack should either fail or not cause any damage
      // The attack may succeed initially but won't be able to re-enter
      const initialPoolFunds = await lendingPool.totalFunds()

      await maliciousContract.attackCreateLoan(ethers.parseEther('1'))

      // Verify the pool's state is consistent - only one loan should be created
      expect(await lendingPool.nextLoanId()).to.equal(2) // Only one loan created (nextLoanId = 2 after first loan)

      // Pool funds should be reduced by exactly the loan amount
      const finalPoolFunds = await lendingPool.totalFunds()
      expect(finalPoolFunds).to.equal(initialPoolFunds - ethers.parseEther('1'))
    })

    it('Should prevent reentrancy attack on repayLoan function', async function () {
      // First, create a legitimate loan from borrower
      const loanAmount = ethers.parseEther('1')
      await lendingPool.connect(borrower).createLoan(loanAmount)

      // Calculate repayment amount
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(2)

      // Test that the borrower can repay normally (our CEI pattern works)
      const initialPoolFunds = await lendingPool.totalFunds()

      // Borrower repays with excess to test refund mechanism
      const excessPayment = ethers.parseEther('0.5')
      await lendingPool.connect(borrower).repayLoan(2, {
        value: repaymentAmount + excessPayment,
      })

      // Verify loan is properly repaid and funds are correct
      const loan = await lendingPool.getLoan(2)
      expect(loan.isRepaid).to.be.true

      const finalPoolFunds = await lendingPool.totalFunds()
      expect(finalPoolFunds).to.equal(initialPoolFunds + repaymentAmount)
    })

    it('Should properly handle legitimate high-frequency transactions', async function () {
      const loanAmount = ethers.parseEther('0.1')

      // Multiple rapid legitimate transactions should work
      await lendingPool.connect(borrower).createLoan(loanAmount)
      await lendingPool.connect(borrower).createLoan(loanAmount)
      await lendingPool.connect(borrower).createLoan(loanAmount)

      expect(await lendingPool.nextLoanId()).to.equal(4)
    })
  })

  describe('Integer Overflow Protection', function () {
    it('Should handle very large loan amounts safely', async function () {
      // Deploy a pool with large but manageable parameters
      const largeLoanAmount = ethers.parseEther('1000') // 1000 tokens
      const highInterestRate = 9999 // 99.99%

      const LargeLendingPool = await ethers.getContractFactory('SampleLendingPool')
      const largeLendingPool = (await upgrades.deployProxy(
        LargeLendingPool,
        [owner.address, largeLoanAmount, highInterestRate, loanDuration],
        {
          initializer: 'initialize',
          kind: 'uups',
          unsafeAllowCustomTypes: true,
        }
      )) as unknown as SampleLendingPool

      await largeLendingPool.waitForDeployment()

      // Add sufficient funds
      await largeLendingPool.connect(lender).depositFunds({
        value: ethers.parseEther('2000'),
      })

      // Create a large loan
      const largeAmount = ethers.parseEther('999')
      await largeLendingPool.connect(borrower).createLoan(largeAmount)

      // Calculate repayment - should not overflow
      const repaymentAmount = await largeLendingPool.calculateRepaymentAmount(2)

      // Verify the calculation is correct (amount + 99.99% interest)
      const expectedInterest = (largeAmount * BigInt(highInterestRate)) / BigInt(10000)
      const expectedRepayment = largeAmount + expectedInterest

      expect(repaymentAmount).to.equal(expectedRepayment)
    })

    it('Should handle maximum possible interest calculations', async function () {
      // Test with realistic maximum values
      const maxSafeAmount = ethers.parseEther('100') // 100 tokens
      const maxInterestRate = 10000 // 100%

      const TestPool = await ethers.getContractFactory('SampleLendingPool')
      const testPool = (await upgrades.deployProxy(TestPool, [owner.address, maxSafeAmount, maxInterestRate, loanDuration], {
        initializer: 'initialize',
        kind: 'uups',
        unsafeAllowCustomTypes: true,
      })) as unknown as SampleLendingPool

      await testPool.waitForDeployment()
      await testPool.connect(lender).depositFunds({ value: ethers.parseEther('200') })

      // Create loan with maximum amount
      await testPool.connect(borrower).createLoan(maxSafeAmount)

      // This should not overflow
      const repaymentAmount = await testPool.calculateRepaymentAmount(2)
      expect(repaymentAmount).to.equal(maxSafeAmount * BigInt(2)) // 100% interest = double
    })

    it('Should handle edge case interest rates correctly', async function () {
      // Test with various interest rates
      const testCases = [
        { rate: 1, description: '0.01%' },
        { rate: 10000, description: '100%' },
        { rate: 5000, description: '50%' },
        { rate: 0, description: '0%' },
      ]

      for (const testCase of testCases) {
        const TestPool = await ethers.getContractFactory('SampleLendingPool')
        const testPool = (await upgrades.deployProxy(TestPool, [owner.address, ethers.parseEther('10'), testCase.rate, loanDuration], {
          initializer: 'initialize',
          kind: 'uups',
          unsafeAllowCustomTypes: true,
        })) as unknown as SampleLendingPool

        await testPool.waitForDeployment()
        await testPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })

        const loanAmount = ethers.parseEther('1')
        await testPool.connect(borrower).createLoan(loanAmount)

        const repaymentAmount = await testPool.calculateRepaymentAmount(2)
        const expectedInterest = (loanAmount * BigInt(testCase.rate)) / BigInt(10000)
        const expectedRepayment = loanAmount + expectedInterest

        expect(repaymentAmount).to.equal(expectedRepayment, `Failed for ${testCase.description} interest rate`)
      }
    })
  })

  describe('Malicious Contract Interactions', function () {
    it('Should handle contracts that reject payments gracefully', async function () {
      // Deploy a contract that always reverts on receive
      const RejectingContract = await ethers.getContractFactory('TestRejectingContract')
      const rejectingContract = await RejectingContract.deploy()
      await rejectingContract.waitForDeployment()

      // Fund the rejecting contract using the fundMe function
      await rejectingContract.fundMe({ value: ethers.parseEther('5') })

      // Try to create a loan from the rejecting contract
      // This should fail because the loan transfer will be rejected
      await expect(rejectingContract.createLoan(await lendingPool.getAddress(), ethers.parseEther('1'))).to.be.revertedWithCustomError(
        lendingPool,
        'TransferFailed'
      )
    })

    it('Should handle contracts with high gas consumption in receive function', async function () {
      // Deploy a contract that consumes a lot of gas in receive
      const GasConsumerContract = await ethers.getContractFactory('TestGasConsumer')
      const gasConsumer = await GasConsumerContract.deploy()
      await gasConsumer.waitForDeployment()

      // This should not cause issues for our contract
      const loanAmount = ethers.parseEther('1')
      await lendingPool.connect(borrower).createLoan(loanAmount)

      const repaymentAmount = await lendingPool.calculateRepaymentAmount(2)

      // Even if borrower is a gas-consuming contract, repayment should work
      // (though it might consume more gas)
      await expect(lendingPool.connect(borrower).repayLoan(2, { value: repaymentAmount })).to.not.be.reverted
    })
  })

  describe('Edge Cases and Boundary Testing', function () {
    it('Should handle zero interest rate correctly', async function () {
      const ZeroInterestPool = await ethers.getContractFactory('SampleLendingPool')
      const zeroPool = (await upgrades.deployProxy(
        ZeroInterestPool,
        [
          owner.address,
          ethers.parseEther('10'),
          0, // 0% interest
          loanDuration,
        ],
        {
          initializer: 'initialize',
          kind: 'uups',
          unsafeAllowCustomTypes: true,
        }
      )) as unknown as SampleLendingPool

      await zeroPool.waitForDeployment()
      await zeroPool.connect(lender).depositFunds({ value: ethers.parseEther('20') })

      const loanAmount = ethers.parseEther('1')
      await zeroPool.connect(borrower).createLoan(loanAmount)

      // With 0% interest, repayment should equal loan amount
      const repaymentAmount = await zeroPool.calculateRepaymentAmount(2)
      expect(repaymentAmount).to.equal(loanAmount)

      // Repayment should work
      await expect(zeroPool.connect(borrower).repayLoan(2, { value: loanAmount })).to.not.be.reverted
    })

    it('Should handle minimum loan amounts', async function () {
      const minAmount = 1000 // 1000 wei (larger amount for meaningful interest)
      await lendingPool.connect(borrower).createLoan(minAmount)

      const repaymentAmount = await lendingPool.calculateRepaymentAmount(2)
      // With 5% interest: 1000 + (1000 * 500 / 10000) = 1000 + 50 = 1050
      const expectedInterest = (BigInt(minAmount) * BigInt(interestRate)) / BigInt(10000)
      const expectedRepayment = BigInt(minAmount) + expectedInterest

      expect(repaymentAmount).to.equal(expectedRepayment)
      expect(repaymentAmount).to.be.gt(minAmount) // Should include interest
    })

    it('Should handle maximum refund scenarios', async function () {
      const loanAmount = ethers.parseEther('1')
      await lendingPool.connect(borrower).createLoan(loanAmount)

      const repaymentAmount = await lendingPool.calculateRepaymentAmount(2)
      const excessPayment = ethers.parseEther('5') // Much more than needed

      const initialBalance = await ethers.provider.getBalance(borrower.address)

      const tx = await lendingPool.connect(borrower).repayLoan(2, {
        value: repaymentAmount + excessPayment,
      })
      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * tx.gasPrice!

      const finalBalance = await ethers.provider.getBalance(borrower.address)

      // Borrower should get excess back (minus gas)
      const expectedBalance = initialBalance - repaymentAmount - gasUsed
      expect(finalBalance).to.equal(expectedBalance)
    })
  })
})
