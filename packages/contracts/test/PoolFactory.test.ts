import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers, upgrades } from 'hardhat'
import { PoolFactory, SampleLendingPool } from '../typechain-types'

describe('PoolFactory', function () {
  let poolFactory: PoolFactory
  let lendingPoolImplementation: SampleLendingPool
  let owner: SignerWithAddress
  let poolOwner1: SignerWithAddress
  let poolOwner2: SignerWithAddress
  let otherAccount: SignerWithAddress

  const defaultPoolParams = {
    maxLoanAmount: ethers.parseEther('10'),
    interestRate: 500, // 5%
    loanDuration: 30 * 24 * 60 * 60, // 30 days
    name: 'Test Pool',
    description: 'A test lending pool',
  }

  beforeEach(async function () {
    // Get signers
    ;[owner, poolOwner1, poolOwner2, otherAccount] = await ethers.getSigners()

    // Deploy lending pool implementation
    const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
    lendingPoolImplementation = await SampleLendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()

    // Deploy PoolFactory
    const PoolFactory = await ethers.getContractFactory('PoolFactory')
    poolFactory = (await upgrades.deployProxy(PoolFactory, [owner.address, await lendingPoolImplementation.getAddress()], {
      initializer: 'initialize',
      kind: 'uups',
      unsafeAllow: ['missing-public-upgradeto', 'external-library-linking', 'struct-definition', 'enum-definition'],
      unsafeAllowCustomTypes: true,
    })) as unknown as PoolFactory

    await poolFactory.waitForDeployment()
  })

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      expect(await poolFactory.owner()).to.equal(owner.address)
    })

    it('Should set the correct implementation address', async function () {
      expect(await poolFactory.lendingPoolImplementation()).to.equal(await lendingPoolImplementation.getAddress())
    })

    it('Should initialize with zero pool count', async function () {
      expect(await poolFactory.getPoolCount()).to.equal(0)
    })

    it('Should return correct version', async function () {
      expect(await poolFactory.version()).to.equal('1.0.0')
    })

    it('Should reject initialization with zero address owner', async function () {
      const PoolFactory = await ethers.getContractFactory('PoolFactory')

      await expect(
        upgrades.deployProxy(PoolFactory, [ethers.ZeroAddress, await lendingPoolImplementation.getAddress()], {
          initializer: 'initialize',
          kind: 'uups',
          unsafeAllowCustomTypes: true,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'InvalidPoolOwner')
    })

    it('Should reject initialization with zero implementation address', async function () {
      const PoolFactory = await ethers.getContractFactory('PoolFactory')

      await expect(
        upgrades.deployProxy(PoolFactory, [owner.address, ethers.ZeroAddress], {
          initializer: 'initialize',
          kind: 'uups',
          unsafeAllowCustomTypes: true,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'ImplementationNotSet')
    })
  })

  describe('Pool Creation', function () {
    it('Should create a pool successfully', async function () {
      const params = {
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      }

      const tx = await poolFactory.connect(owner).createPool(params)
      const receipt = await tx.wait()

      // Find the PoolCreated event
      const poolCreatedEvent = receipt?.logs.find((log) => log.topics[0] === poolFactory.interface.getEvent('PoolCreated').topicHash)

      expect(poolCreatedEvent).to.not.be.undefined

      if (poolCreatedEvent) {
        const decodedEvent = poolFactory.interface.decodeEventLog('PoolCreated', poolCreatedEvent.data, poolCreatedEvent.topics)

        expect(decodedEvent.poolId).to.equal(1)
        expect(decodedEvent.poolOwner).to.equal(poolOwner1.address)
        expect(decodedEvent.name).to.equal(params.name)
        expect(decodedEvent.maxLoanAmount).to.equal(params.maxLoanAmount)
        expect(decodedEvent.interestRate).to.equal(params.interestRate)
        expect(decodedEvent.loanDuration).to.equal(params.loanDuration)
        expect(decodedEvent.poolAddress).to.not.equal(ethers.ZeroAddress)
      }

      // Check pool count
      expect(await poolFactory.getPoolCount()).to.equal(1)

      // Check pool info
      const poolInfo = await poolFactory.getPoolInfo(1)
      expect(poolInfo.poolOwner).to.equal(poolOwner1.address)
      expect(poolInfo.maxLoanAmount).to.equal(params.maxLoanAmount)
      expect(poolInfo.interestRate).to.equal(params.interestRate)
      expect(poolInfo.loanDuration).to.equal(params.loanDuration)
      expect(poolInfo.name).to.equal(params.name)
      expect(poolInfo.description).to.equal(params.description)
      expect(poolInfo.isActive).to.be.true
    })

    it('Should create multiple pools', async function () {
      const params1 = {
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      }

      const params2 = {
        poolOwner: poolOwner2.address,
        maxLoanAmount: ethers.parseEther('20'),
        interestRate: 750, // 7.5%
        loanDuration: 60 * 24 * 60 * 60, // 60 days
        name: 'Test Pool 2',
        description: 'Second test pool',
      }

      // Create first pool
      await poolFactory.connect(owner).createPool(params1)

      // Create second pool
      await poolFactory.connect(owner).createPool(params2)

      expect(await poolFactory.getPoolCount()).to.equal(2)

      // Check both pools exist and have correct info
      const pool1Info = await poolFactory.getPoolInfo(1)
      const pool2Info = await poolFactory.getPoolInfo(2)

      expect(pool1Info.poolOwner).to.equal(poolOwner1.address)
      expect(pool2Info.poolOwner).to.equal(poolOwner2.address)
      expect(pool2Info.maxLoanAmount).to.equal(params2.maxLoanAmount)
    })

    it('Should reject pool creation from non-owner', async function () {
      const params = {
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      }

      await expect(poolFactory.connect(otherAccount).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')
    })

    it('Should reject pool creation with invalid parameters', async function () {
      // Zero pool owner
      await expect(
        poolFactory.connect(owner).createPool({
          poolOwner: ethers.ZeroAddress,
          ...defaultPoolParams,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'InvalidPoolOwner')

      // Zero max loan amount
      await expect(
        poolFactory.connect(owner).createPool({
          poolOwner: poolOwner1.address,
          maxLoanAmount: 0,
          interestRate: defaultPoolParams.interestRate,
          loanDuration: defaultPoolParams.loanDuration,
          name: defaultPoolParams.name,
          description: defaultPoolParams.description,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'InvalidMaxLoanAmount')

      // Interest rate too high (>100%)
      await expect(
        poolFactory.connect(owner).createPool({
          poolOwner: poolOwner1.address,
          maxLoanAmount: defaultPoolParams.maxLoanAmount,
          interestRate: 15000, // 150%
          loanDuration: defaultPoolParams.loanDuration,
          name: defaultPoolParams.name,
          description: defaultPoolParams.description,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'InvalidInterestRate')

      // Zero loan duration
      await expect(
        poolFactory.connect(owner).createPool({
          poolOwner: poolOwner1.address,
          maxLoanAmount: defaultPoolParams.maxLoanAmount,
          interestRate: defaultPoolParams.interestRate,
          loanDuration: 0,
          name: defaultPoolParams.name,
          description: defaultPoolParams.description,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'InvalidLoanDuration')

      // Empty name
      await expect(
        poolFactory.connect(owner).createPool({
          poolOwner: poolOwner1.address,
          maxLoanAmount: defaultPoolParams.maxLoanAmount,
          interestRate: defaultPoolParams.interestRate,
          loanDuration: defaultPoolParams.loanDuration,
          name: '',
          description: defaultPoolParams.description,
        })
      ).to.be.revertedWithCustomError(poolFactory, 'EmptyName')
    })

    it('Should reject pool creation when paused', async function () {
      await poolFactory.connect(owner).pause()

      const params = {
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      }

      await expect(poolFactory.connect(owner).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'EnforcedPause')
    })
  })

  describe('Pool Registry Functions', function () {
    beforeEach(async function () {
      // Create test pools
      await poolFactory.connect(owner).createPool({
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      })

      await poolFactory.connect(owner).createPool({
        poolOwner: poolOwner2.address,
        maxLoanAmount: ethers.parseEther('20'),
        interestRate: 750,
        loanDuration: 60 * 24 * 60 * 60,
        name: 'Pool 2',
        description: 'Second pool',
      })
    })

    it('Should return correct pool address', async function () {
      const poolAddress = await poolFactory.getPoolAddress(1)
      expect(poolAddress).to.not.equal(ethers.ZeroAddress)

      // Verify it's a valid pool by checking it has the expected owner
      const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)
      expect(await pool.owner()).to.equal(poolOwner1.address)
    })

    it('Should return correct pool count', async function () {
      expect(await poolFactory.getPoolCount()).to.equal(2)
    })

    it('Should return correct pool ID by address', async function () {
      const poolAddress = await poolFactory.getPoolAddress(1)
      const poolId = await poolFactory.getPoolId(poolAddress)
      expect(poolId).to.equal(1)
    })

    it('Should return pools by owner', async function () {
      const poolOwner1Pools = await poolFactory.getPoolsByOwner(poolOwner1.address)
      const poolOwner2Pools = await poolFactory.getPoolsByOwner(poolOwner2.address)

      expect(poolOwner1Pools.length).to.equal(1)
      expect(poolOwner1Pools[0]).to.equal(1)

      expect(poolOwner2Pools.length).to.equal(1)
      expect(poolOwner2Pools[0]).to.equal(2)
    })

    it('Should not have getAllPoolAddresses function (removed for DoS prevention)', async function () {
      // This function was removed to prevent DoS attacks
      // Use getPoolsRange() instead for safe pagination
      expect((poolFactory as unknown as { getAllPoolAddresses?: unknown }).getAllPoolAddresses).to.be.undefined
    })

    it('Should return pools in range', async function () {
      const [poolIds, poolInfos] = await poolFactory.getPoolsRange(1, 2)

      expect(poolIds.length).to.equal(2)
      expect(poolInfos.length).to.equal(2)
      expect(poolIds[0]).to.equal(1)
      expect(poolIds[1]).to.equal(2)
      expect(poolInfos[0].poolOwner).to.equal(poolOwner1.address)
      expect(poolInfos[1].poolOwner).to.equal(poolOwner2.address)
    })

    it('Should handle invalid pool ID queries', async function () {
      await expect(poolFactory.getPoolAddress(99)).to.be.revertedWithCustomError(poolFactory, 'PoolNotFound')

      await expect(poolFactory.getPoolInfo(0)).to.be.revertedWithCustomError(poolFactory, 'PoolNotFound')
    })
  })

  describe('Pool Management', function () {
    beforeEach(async function () {
      await poolFactory.connect(owner).createPool({
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      })
    })

    it('Should deactivate pool', async function () {
      await expect(poolFactory.connect(owner).deactivatePool(1))
        .to.emit(poolFactory, 'PoolDeactivated')
        .withArgs(1, await poolFactory.getPoolAddress(1))

      expect(await poolFactory.isPoolActive(1)).to.be.false
    })

    it('Should reactivate pool', async function () {
      // First deactivate
      await poolFactory.connect(owner).deactivatePool(1)

      // Then reactivate
      await expect(poolFactory.connect(owner).reactivatePool(1))
        .to.emit(poolFactory, 'PoolReactivated')
        .withArgs(1, await poolFactory.getPoolAddress(1))

      expect(await poolFactory.isPoolActive(1)).to.be.true
    })

    it('Should reject pool management from non-owner', async function () {
      await expect(poolFactory.connect(otherAccount).deactivatePool(1)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )

      await expect(poolFactory.connect(otherAccount).reactivatePool(1)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })
  })

  describe('Implementation Management', function () {
    it('Should update implementation address', async function () {
      // Deploy new implementation
      const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
      const newImplementation = await SampleLendingPool.deploy()
      await newImplementation.waitForDeployment()

      const oldImplementation = await poolFactory.lendingPoolImplementation()

      await expect(poolFactory.connect(owner).updateImplementation(await newImplementation.getAddress()))
        .to.emit(poolFactory, 'ImplementationUpdated')
        .withArgs(oldImplementation, await newImplementation.getAddress())

      expect(await poolFactory.lendingPoolImplementation()).to.equal(await newImplementation.getAddress())
    })

    it('Should reject zero address implementation', async function () {
      await expect(poolFactory.connect(owner).updateImplementation(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        poolFactory,
        'ImplementationNotSet'
      )
    })

    it('Should reject implementation update from non-owner', async function () {
      const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
      const newImplementation = await SampleLendingPool.deploy()
      await newImplementation.waitForDeployment()

      await expect(
        poolFactory.connect(otherAccount).updateImplementation(await newImplementation.getAddress())
      ).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
    })
  })

  describe('Pausable', function () {
    it('Should allow owner to pause and unpause', async function () {
      await poolFactory.connect(owner).pause()
      expect(await poolFactory.paused()).to.be.true

      await poolFactory.connect(owner).unpause()
      expect(await poolFactory.paused()).to.be.false
    })

    it('Should reject pause/unpause from non-owner', async function () {
      await expect(poolFactory.connect(otherAccount).pause()).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')

      await expect(poolFactory.connect(otherAccount).unpause()).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
    })
  })

  describe('Upgradeability', function () {
    it('Should be upgradeable by owner', async function () {
      const PoolFactoryV2 = await ethers.getContractFactory('PoolFactory')

      await expect(upgrades.upgradeProxy(await poolFactory.getAddress(), PoolFactoryV2)).to.not.be.reverted
    })
  })

  describe('Integration Tests', function () {
    it('Should create functional lending pools', async function () {
      // Create pool through factory
      const params = {
        poolOwner: poolOwner1.address,
        ...defaultPoolParams,
      }

      await poolFactory.connect(owner).createPool(params)

      // Get pool address and interact with it
      const poolAddress = await poolFactory.getPoolAddress(1)
      const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)

      // Verify pool is properly initialized
      expect(await pool.owner()).to.equal(poolOwner1.address)

      const poolConfig = await pool.poolConfig()
      expect(poolConfig.maxLoanAmount).to.equal(params.maxLoanAmount)
      expect(poolConfig.interestRate).to.equal(params.interestRate)
      expect(poolConfig.loanDuration).to.equal(params.loanDuration)
      expect(poolConfig.isActive).to.be.true

      // Test pool functionality - deposit funds
      await expect(pool.connect(otherAccount).depositFunds({ value: ethers.parseEther('5') })).to.emit(pool, 'FundsDeposited')

      expect(await pool.totalFunds()).to.equal(ethers.parseEther('5'))
    })

    it('Should maintain separate state for multiple pools', async function () {
      // Create two pools with different configurations
      await poolFactory.connect(owner).createPool({
        poolOwner: poolOwner1.address,
        maxLoanAmount: ethers.parseEther('10'),
        interestRate: 500,
        loanDuration: 30 * 24 * 60 * 60,
        name: 'Pool 1',
        description: 'First pool',
      })

      await poolFactory.connect(owner).createPool({
        poolOwner: poolOwner2.address,
        maxLoanAmount: ethers.parseEther('20'),
        interestRate: 750,
        loanDuration: 60 * 24 * 60 * 60,
        name: 'Pool 2',
        description: 'Second pool',
      })

      // Get both pools
      const pool1Address = await poolFactory.getPoolAddress(1)
      const pool2Address = await poolFactory.getPoolAddress(2)

      const pool1 = await ethers.getContractAt('SampleLendingPool', pool1Address)
      const pool2 = await ethers.getContractAt('SampleLendingPool', pool2Address)

      // Verify different configurations
      const config1 = await pool1.poolConfig()
      const config2 = await pool2.poolConfig()

      expect(config1.maxLoanAmount).to.equal(ethers.parseEther('10'))
      expect(config2.maxLoanAmount).to.equal(ethers.parseEther('20'))

      expect(config1.interestRate).to.equal(500)
      expect(config2.interestRate).to.equal(750)

      // Test independent operation - add funds to pool 1 only
      await pool1.connect(otherAccount).depositFunds({ value: ethers.parseEther('5') })

      expect(await pool1.totalFunds()).to.equal(ethers.parseEther('5'))
      expect(await pool2.totalFunds()).to.equal(0)
    })
  })

  describe('Ownable2Step Functionality', function () {
    let newOwner: SignerWithAddress

    beforeEach(function () {
      newOwner = otherAccount
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
        await expect(poolFactory.connect(poolOwner1).acceptOwnership())
          .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
          .withArgs(poolOwner1.address)
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

        // Change pending owner to poolOwner1
        await expect(poolFactory.connect(owner).transferOwnership(poolOwner1.address))
          .to.emit(poolFactory, 'OwnershipTransferStarted')
          .withArgs(owner.address, poolOwner1.address)

        // Verify new pending owner
        const status = await poolFactory.getOwnershipStatus()
        expect(status.pendingOwnerAddress).to.equal(poolOwner1.address)

        // Original pending owner should no longer be able to accept
        await expect(poolFactory.connect(newOwner).acceptOwnership()).to.be.revertedWithCustomError(
          poolFactory,
          'OwnableUnauthorizedAccount'
        )

        // New pending owner should be able to accept
        await expect(poolFactory.connect(poolOwner1).acceptOwnership())
          .to.emit(poolFactory, 'OwnershipTransferred')
          .withArgs(owner.address, poolOwner1.address)
      })

      it('Should maintain functionality during pending transfer', async function () {
        // Initiate transfer
        await poolFactory.connect(owner).transferOwnership(newOwner.address)

        // Original owner should still be able to perform owner functions
        const params = {
          poolOwner: poolOwner1.address,
          ...defaultPoolParams,
        }

        await expect(poolFactory.connect(owner).createPool(params)).to.not.be.reverted
        expect(await poolFactory.getPoolCount()).to.equal(1)

        // Pending owner should not be able to perform owner functions
        await expect(poolFactory.connect(newOwner).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')
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
        await expect(poolFactory.connect(newOwner).emergencyPause()).to.be.revertedWithCustomError(
          poolFactory,
          'OwnableUnauthorizedAccount'
        )

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
          poolOwner: poolOwner1.address,
          ...defaultPoolParams,
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
            poolOwner: poolOwner2.address,
            ...defaultPoolParams,
            name: 'Pool 2',
          })
        ).to.not.be.reverted

        await expect(poolFactory.connect(owner).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

        expect(await poolFactory.getPoolCount()).to.equal(2)
      })
    })
  })
})
