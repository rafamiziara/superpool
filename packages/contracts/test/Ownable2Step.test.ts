import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { PoolFactory, SampleLendingPool } from '../typechain-types'

describe('PoolFactory Ownable2Step', function () {
  let poolFactory: PoolFactory
  let lendingPoolImplementation: SampleLendingPool
  let owner: SignerWithAddress
  let newOwner: SignerWithAddress
  let otherAccount: SignerWithAddress

  beforeEach(async function () {
    // Get signers
    ;[owner, newOwner, otherAccount] = await ethers.getSigners()

    // Deploy lending pool implementation
    const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
    lendingPoolImplementation = await SampleLendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()

    // Deploy PoolFactory using direct deployment instead of proxy for testing
    const PoolFactory = await ethers.getContractFactory('PoolFactory')
    const poolFactoryImpl = await PoolFactory.deploy()
    await poolFactoryImpl.waitForDeployment()

    // Initialize manually
    await poolFactoryImpl.initialize(owner.address, await lendingPoolImplementation.getAddress())
    poolFactory = poolFactoryImpl
  })

  describe('Ownership Status', function () {
    it('Should return correct initial ownership status', async function () {
      const status = await poolFactory.getOwnershipStatus()

      expect(status.currentOwner).to.equal(owner.address)
      expect(status.pendingOwnerAddress).to.equal(ethers.ZeroAddress)
      expect(status.hasPendingTransfer).to.be.false
    })

    it('Should verify current owner correctly', async function () {
      expect(await poolFactory.isCurrentOwner(owner.address)).to.be.true
      expect(await poolFactory.isCurrentOwner(newOwner.address)).to.be.false
    })

    it('Should verify pending owner correctly', async function () {
      expect(await poolFactory.isPendingOwner(owner.address)).to.be.false
      expect(await poolFactory.isPendingOwner(newOwner.address)).to.be.false
    })
  })

  describe('Two-Step Ownership Transfer', function () {
    it('Should initiate ownership transfer correctly', async function () {
      // Initiate transfer
      await expect(poolFactory.connect(owner).transferOwnership(newOwner.address))
        .to.emit(poolFactory, 'OwnershipTransferStarted')
        .withArgs(owner.address, newOwner.address)

      // Verify ownership status after initiation
      const status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(owner.address)
      expect(status.pendingOwnerAddress).to.equal(newOwner.address)
      expect(status.hasPendingTransfer).to.be.true

      // Verify ownership checks
      expect(await poolFactory.isCurrentOwner(owner.address)).to.be.true
      expect(await poolFactory.isCurrentOwner(newOwner.address)).to.be.false
      expect(await poolFactory.isPendingOwner(newOwner.address)).to.be.true
      expect(await poolFactory.isPendingOwner(owner.address)).to.be.false

      // Original owner should still have control
      expect(await poolFactory.owner()).to.equal(owner.address)
    })

    it('Should complete ownership transfer correctly', async function () {
      // Initiate transfer
      await poolFactory.connect(owner).transferOwnership(newOwner.address)

      // Complete transfer
      await expect(poolFactory.connect(newOwner).acceptOwnership())
        .to.emit(poolFactory, 'OwnershipTransferred')
        .withArgs(owner.address, newOwner.address)

      // Verify ownership status after completion
      const status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(newOwner.address)
      expect(status.pendingOwnerAddress).to.equal(ethers.ZeroAddress)
      expect(status.hasPendingTransfer).to.be.false

      // Verify ownership checks
      expect(await poolFactory.isCurrentOwner(newOwner.address)).to.be.true
      expect(await poolFactory.isCurrentOwner(owner.address)).to.be.false
      expect(await poolFactory.isPendingOwner(newOwner.address)).to.be.false

      // New owner should have control
      expect(await poolFactory.owner()).to.equal(newOwner.address)
    })

    it('Should reject ownership transfer from non-owner', async function () {
      await expect(poolFactory.connect(newOwner).transferOwnership(newOwner.address))
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(newOwner.address)
    })

    it('Should reject ownership acceptance from non-pending-owner', async function () {
      // Initiate transfer to newOwner
      await poolFactory.connect(owner).transferOwnership(newOwner.address)

      // Try to accept from different account
      await expect(poolFactory.connect(otherAccount).acceptOwnership())
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(otherAccount.address)
    })

    it('Should reject ownership acceptance without pending transfer', async function () {
      // No pending transfer exists
      await expect(poolFactory.connect(newOwner).acceptOwnership())
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(newOwner.address)
    })

    it('Should allow owner to change pending owner', async function () {
      // Initial transfer to newOwner
      await poolFactory.connect(owner).transferOwnership(newOwner.address)

      // Change pending owner to otherAccount
      await expect(poolFactory.connect(owner).transferOwnership(otherAccount.address))
        .to.emit(poolFactory, 'OwnershipTransferStarted')
        .withArgs(owner.address, otherAccount.address)

      // Verify new pending owner
      const status = await poolFactory.getOwnershipStatus()
      expect(status.pendingOwnerAddress).to.equal(otherAccount.address)

      // Original pending owner should no longer be able to accept
      await expect(poolFactory.connect(newOwner).acceptOwnership()).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')

      // New pending owner should be able to accept
      await expect(poolFactory.connect(otherAccount).acceptOwnership())
        .to.emit(poolFactory, 'OwnershipTransferred')
        .withArgs(owner.address, otherAccount.address)
    })

    it('Should maintain functionality during pending transfer', async function () {
      // Initiate transfer
      await poolFactory.connect(owner).transferOwnership(newOwner.address)

      // Original owner should still be able to perform owner functions
      const params = {
        poolOwner: otherAccount.address,
        maxLoanAmount: ethers.parseEther('10'),
        interestRate: 500,
        loanDuration: 30 * 24 * 60 * 60,
        name: 'Test Pool',
        description: 'A test lending pool',
      }

      await expect(poolFactory.connect(owner).createPool(params)).to.not.be.reverted
      expect(await poolFactory.getPoolCount()).to.equal(1)

      // Pending owner should not be able to perform owner functions
      await expect(poolFactory.connect(newOwner).createPool(params)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })
  })

  describe('Emergency Functions', function () {
    it('Should allow emergency pause by owner', async function () {
      expect(await poolFactory.paused()).to.be.false

      await expect(poolFactory.connect(owner).emergencyPause()).to.emit(poolFactory, 'Paused').withArgs(owner.address)

      expect(await poolFactory.paused()).to.be.true
    })

    it('Should allow emergency unpause by owner', async function () {
      // First pause
      await poolFactory.connect(owner).emergencyPause()
      expect(await poolFactory.paused()).to.be.true

      // Then unpause
      await expect(poolFactory.connect(owner).emergencyUnpause()).to.emit(poolFactory, 'Unpaused').withArgs(owner.address)

      expect(await poolFactory.paused()).to.be.false
    })

    it('Should reject emergency functions from non-owner', async function () {
      await expect(poolFactory.connect(newOwner).emergencyPause()).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')

      await expect(poolFactory.connect(newOwner).emergencyUnpause()).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })

    it('Should handle emergency pause when already paused', async function () {
      // First pause
      await poolFactory.connect(owner).pause()
      expect(await poolFactory.paused()).to.be.true

      // Emergency pause when already paused should not revert
      await expect(poolFactory.connect(owner).emergencyPause()).to.not.be.reverted
      expect(await poolFactory.paused()).to.be.true
    })

    it('Should handle emergency unpause when not paused', async function () {
      expect(await poolFactory.paused()).to.be.false

      // Emergency unpause when not paused should not revert
      await expect(poolFactory.connect(owner).emergencyUnpause()).to.not.be.reverted
      expect(await poolFactory.paused()).to.be.false
    })
  })

  describe('Complete Ownership Transfer Scenario', function () {
    it('Should handle complete ownership transfer to multi-sig scenario', async function () {
      // Initial state
      let status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(owner.address)
      expect(status.hasPendingTransfer).to.be.false

      // Step 1: Current owner initiates transfer to multi-sig (represented by newOwner)
      await expect(poolFactory.connect(owner).transferOwnership(newOwner.address)).to.emit(poolFactory, 'OwnershipTransferStarted')

      status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(owner.address)
      expect(status.pendingOwnerAddress).to.equal(newOwner.address)
      expect(status.hasPendingTransfer).to.be.true

      // Step 2: Original owner can still operate the contract
      const params = {
        poolOwner: otherAccount.address,
        maxLoanAmount: ethers.parseEther('10'),
        interestRate: 500,
        loanDuration: 30 * 24 * 60 * 60,
        name: 'Test Pool',
        description: 'A test lending pool',
      }
      await poolFactory.connect(owner).createPool(params)
      expect(await poolFactory.getPoolCount()).to.equal(1)

      // Step 3: Multi-sig accepts ownership
      await expect(poolFactory.connect(newOwner).acceptOwnership())
        .to.emit(poolFactory, 'OwnershipTransferred')
        .withArgs(owner.address, newOwner.address)

      // Step 4: Verify ownership is fully transferred
      status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(newOwner.address)
      expect(status.pendingOwnerAddress).to.equal(ethers.ZeroAddress)
      expect(status.hasPendingTransfer).to.be.false

      // Step 5: New owner can operate, old owner cannot
      await expect(
        poolFactory.connect(newOwner).createPool({
          poolOwner: otherAccount.address,
          maxLoanAmount: ethers.parseEther('5'),
          interestRate: 750,
          loanDuration: 60 * 24 * 60 * 60,
          name: 'Pool 2',
          description: 'Second pool',
        })
      ).to.not.be.reverted

      await expect(poolFactory.connect(owner).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')

      expect(await poolFactory.getPoolCount()).to.equal(2)
    })
  })
})
