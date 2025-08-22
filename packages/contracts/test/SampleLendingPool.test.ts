import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SampleLendingPool } from "../typechain-types";

describe("SampleLendingPool", function () {
  let lendingPool: SampleLendingPool;
  let owner: SignerWithAddress;
  let borrower: SignerWithAddress;
  let lender: SignerWithAddress;
  let otherAccount: SignerWithAddress;

  const maxLoanAmount = ethers.parseEther("10");
  const interestRate = 500; // 5%
  const loanDuration = 30 * 24 * 60 * 60; // 30 days

  beforeEach(async function () {
    // Get signers
    [owner, borrower, lender, otherAccount] = await ethers.getSigners();

    // Deploy the contract
    const SampleLendingPool = await ethers.getContractFactory("SampleLendingPool");
    lendingPool = await upgrades.deployProxy(SampleLendingPool, [
      owner.address,
      maxLoanAmount,
      interestRate,
      loanDuration
    ], {
      initializer: "initialize",
      kind: "uups"
    }) as unknown as SampleLendingPool;

    await lendingPool.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await lendingPool.owner()).to.equal(owner.address);
    });

    it("Should set the correct pool configuration", async function () {
      const poolConfig = await lendingPool.poolConfig();
      expect(poolConfig.maxLoanAmount).to.equal(maxLoanAmount);
      expect(poolConfig.interestRate).to.equal(interestRate);
      expect(poolConfig.loanDuration).to.equal(loanDuration);
      expect(poolConfig.isActive).to.be.true;
    });

    it("Should initialize with zero total funds", async function () {
      expect(await lendingPool.totalFunds()).to.equal(0);
    });

    it("Should set next loan ID to 1", async function () {
      expect(await lendingPool.nextLoanId()).to.equal(1);
    });

    it("Should return correct version", async function () {
      expect(await lendingPool.version()).to.equal("1.0.0");
    });
  });

  describe("Deposit Funds", function () {
    it("Should allow deposits and update total funds", async function () {
      const depositAmount = ethers.parseEther("5");
      
      await expect(
        lendingPool.connect(lender).depositFunds({ value: depositAmount })
      ).to.emit(lendingPool, "FundsDeposited")
        .withArgs(lender.address, depositAmount);

      expect(await lendingPool.totalFunds()).to.equal(depositAmount);
    });

    it("Should reject zero deposits", async function () {
      await expect(
        lendingPool.connect(lender).depositFunds({ value: 0 })
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should allow multiple deposits", async function () {
      const deposit1 = ethers.parseEther("3");
      const deposit2 = ethers.parseEther("2");
      
      await lendingPool.connect(lender).depositFunds({ value: deposit1 });
      await lendingPool.connect(otherAccount).depositFunds({ value: deposit2 });
      
      expect(await lendingPool.totalFunds()).to.equal(deposit1 + deposit2);
    });
  });

  describe("Create Loan", function () {
    beforeEach(async function () {
      // Fund the pool
      await lendingPool.connect(lender).depositFunds({ 
        value: ethers.parseEther("20") 
      });
    });

    it("Should create a loan successfully", async function () {
      const loanAmount = ethers.parseEther("5");
      const borrowerBalanceBefore = await ethers.provider.getBalance(borrower.address);
      
      await expect(
        lendingPool.connect(borrower).createLoan(loanAmount)
      ).to.emit(lendingPool, "LoanCreated")
        .withArgs(1, borrower.address, loanAmount);

      // Check loan details
      const loan = await lendingPool.getLoan(1);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.amount).to.equal(loanAmount);
      expect(loan.interestRate).to.equal(interestRate);
      expect(loan.isRepaid).to.be.false;

      // Check borrower received funds
      const borrowerBalanceAfter = await ethers.provider.getBalance(borrower.address);
      expect(borrowerBalanceAfter).to.be.gt(borrowerBalanceBefore);

      // Check total funds decreased
      expect(await lendingPool.totalFunds()).to.equal(ethers.parseEther("15"));
      
      // Check next loan ID incremented
      expect(await lendingPool.nextLoanId()).to.equal(2);
    });

    it("Should reject loan exceeding max amount", async function () {
      const excessiveLoanAmount = ethers.parseEther("15");
      
      await expect(
        lendingPool.connect(borrower).createLoan(excessiveLoanAmount)
      ).to.be.revertedWithCustomError(lendingPool, "ExceedsMaxLoanAmount");
    });

    it("Should reject loan when insufficient funds", async function () {
      // First, empty the pool to create insufficient funds scenario
      const largeLoanAmount = ethers.parseEther("8"); // Less than max but more than available after creating other loans
      
      // Create loans to drain the pool (20 ETH available, create 2 loans of 8 ETH each)
      await lendingPool.connect(borrower).createLoan(ethers.parseEther("8"));
      await lendingPool.connect(borrower).createLoan(ethers.parseEther("8"));
      
      // Now try to create another loan - should fail due to insufficient funds (only 4 ETH left)
      await expect(
        lendingPool.connect(borrower).createLoan(largeLoanAmount)
      ).to.be.revertedWithCustomError(lendingPool, "InsufficientFunds");
    });

    it("Should reject loan when pool is inactive", async function () {
      await lendingPool.connect(owner).togglePoolStatus();
      
      await expect(
        lendingPool.connect(borrower).createLoan(ethers.parseEther("5"))
      ).to.be.revertedWith("Pool is not active");
    });
  });

  describe("Repay Loan", function () {
    let loanId: number;
    const loanAmount = ethers.parseEther("5");

    beforeEach(async function () {
      // Fund the pool and create a loan
      await lendingPool.connect(lender).depositFunds({ 
        value: ethers.parseEther("20") 
      });
      
      await lendingPool.connect(borrower).createLoan(loanAmount);
      loanId = 1;
    });

    it("Should repay loan with correct interest", async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId);
      const expectedInterest = (loanAmount * BigInt(interestRate)) / BigInt(10000);
      const expectedTotal = loanAmount + expectedInterest;
      
      expect(repaymentAmount).to.equal(expectedTotal);

      const poolBalanceBefore = await lendingPool.totalFunds();

      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })
      ).to.emit(lendingPool, "LoanRepaid")
        .withArgs(loanId, borrower.address, repaymentAmount);

      // Check loan is marked as repaid
      const loan = await lendingPool.getLoan(loanId);
      expect(loan.isRepaid).to.be.true;

      // Check pool funds increased
      expect(await lendingPool.totalFunds()).to.equal(poolBalanceBefore + repaymentAmount);
    });

    it("Should refund excess payment", async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId);
      const excessPayment = repaymentAmount + ethers.parseEther("1");
      
      const borrowerBalanceBefore = await ethers.provider.getBalance(borrower.address);
      
      const tx = await lendingPool.connect(borrower).repayLoan(loanId, { 
        value: excessPayment 
      });
      
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      
      const borrowerBalanceAfter = await ethers.provider.getBalance(borrower.address);
      
      // Borrower should have received back approximately the excess (minus gas)
      const expectedBalance = borrowerBalanceBefore - repaymentAmount - gasUsed;
      expect(borrowerBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.01"));
    });

    it("Should reject repayment from wrong borrower", async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId);
      
      await expect(
        lendingPool.connect(otherAccount).repayLoan(loanId, { value: repaymentAmount })
      ).to.be.revertedWithCustomError(lendingPool, "UnauthorizedBorrower");
    });

    it("Should reject insufficient repayment", async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId);
      const insufficientAmount = repaymentAmount - ethers.parseEther("0.1");
      
      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, { value: insufficientAmount })
      ).to.be.revertedWith("Insufficient repayment amount");
    });

    it("Should reject double repayment", async function () {
      const repaymentAmount = await lendingPool.calculateRepaymentAmount(loanId);
      
      // First repayment
      await lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount });
      
      // Second repayment attempt
      await expect(
        lendingPool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })
      ).to.be.revertedWithCustomError(lendingPool, "LoanAlreadyRepaid");
    });
  });

  describe("Pool Configuration", function () {
    it("Should allow owner to update pool config", async function () {
      const newMaxLoan = ethers.parseEther("20");
      const newInterestRate = 750; // 7.5%
      const newDuration = 60 * 24 * 60 * 60; // 60 days

      await expect(
        lendingPool.connect(owner).updatePoolConfig(newMaxLoan, newInterestRate, newDuration)
      ).to.emit(lendingPool, "PoolConfigured")
        .withArgs(newMaxLoan, newInterestRate, newDuration);

      const poolConfig = await lendingPool.poolConfig();
      expect(poolConfig.maxLoanAmount).to.equal(newMaxLoan);
      expect(poolConfig.interestRate).to.equal(newInterestRate);
      expect(poolConfig.loanDuration).to.equal(newDuration);
    });

    it("Should reject config updates from non-owner", async function () {
      await expect(
        lendingPool.connect(borrower).updatePoolConfig(
          ethers.parseEther("20"), 
          750, 
          60 * 24 * 60 * 60
        )
      ).to.be.revertedWithCustomError(lendingPool, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to toggle pool status", async function () {
      expect((await lendingPool.poolConfig()).isActive).to.be.true;
      
      await lendingPool.connect(owner).togglePoolStatus();
      expect((await lendingPool.poolConfig()).isActive).to.be.false;
      
      await lendingPool.connect(owner).togglePoolStatus();
      expect((await lendingPool.poolConfig()).isActive).to.be.true;
    });
  });

  describe("Pausable", function () {
    it("Should allow owner to pause and unpause", async function () {
      await lendingPool.connect(owner).pause();
      expect(await lendingPool.paused()).to.be.true;

      // Should reject operations when paused
      await expect(
        lendingPool.connect(lender).depositFunds({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(lendingPool, "EnforcedPause");

      await lendingPool.connect(owner).unpause();
      expect(await lendingPool.paused()).to.be.false;

      // Should allow operations when unpaused
      await expect(
        lendingPool.connect(lender).depositFunds({ value: ethers.parseEther("1") })
      ).to.not.be.reverted;
    });
  });

  describe("Upgradeability", function () {
    it("Should be upgradeable by owner", async function () {
      const SampleLendingPoolV2 = await ethers.getContractFactory("SampleLendingPool");
      
      await expect(
        upgrades.upgradeProxy(await lendingPool.getAddress(), SampleLendingPoolV2)
      ).to.not.be.reverted;
    });
  });
});