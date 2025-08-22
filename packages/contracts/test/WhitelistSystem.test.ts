import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { PoolFactory, SampleLendingPool } from '../typechain-types'

describe('Whitelist System', function () {
  let poolFactory: PoolFactory
  let lendingPoolImplementation: SampleLendingPool
  let owner: SignerWithAddress
  let addr1: SignerWithAddress
  let addr2: SignerWithAddress
  let addr3: SignerWithAddress

  beforeEach(async function () {
    ;[owner, addr1, addr2, addr3] = await ethers.getSigners()

    // Deploy lending pool implementation
    const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
    lendingPoolImplementation = await SampleLendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()

    // Deploy pool factory
    const PoolFactory = await ethers.getContractFactory('PoolFactory')
    poolFactory = await PoolFactory.deploy()
    await poolFactory.waitForDeployment()

    // Initialize factory
    await poolFactory.initialize(owner.address, await lendingPoolImplementation.getAddress())
  })

  describe('Whitelist Management', function () {
    it('Should initialize with whitelist disabled', async function () {
      expect(await poolFactory.isWhitelistEnabled()).to.be.false
    })

    it('Should allow owner to authorize creators', async function () {
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      expect(await poolFactory.authorizedCreators(addr1.address)).to.be.true
    })

    it('Should emit CreatorAuthorized event', async function () {
      await expect(poolFactory.setCreatorAuthorization(addr1.address, true))
        .to.emit(poolFactory, 'CreatorAuthorized')
        .withArgs(addr1.address, true)
    })

    it('Should allow owner to revoke authorization', async function () {
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      expect(await poolFactory.authorizedCreators(addr1.address)).to.be.true

      await poolFactory.setCreatorAuthorization(addr1.address, false)
      expect(await poolFactory.authorizedCreators(addr1.address)).to.be.false
    })

    it('Should not allow non-owner to authorize creators', async function () {
      await expect(poolFactory.connect(addr1).setCreatorAuthorization(addr2.address, true)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })

    it('Should not allow authorizing zero address', async function () {
      await expect(poolFactory.setCreatorAuthorization(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        poolFactory,
        'InvalidPoolOwner'
      )
    })
  })

  describe('Whitelist Mode', function () {
    it('Should allow owner to enable whitelist mode', async function () {
      await poolFactory.setWhitelistMode(true)
      expect(await poolFactory.isWhitelistEnabled()).to.be.true
    })

    it('Should emit WhitelistModeChanged event', async function () {
      await expect(poolFactory.setWhitelistMode(true)).to.emit(poolFactory, 'WhitelistModeChanged').withArgs(true)
    })

    it('Should allow owner to disable whitelist mode', async function () {
      await poolFactory.setWhitelistMode(true)
      expect(await poolFactory.isWhitelistEnabled()).to.be.true

      await poolFactory.setWhitelistMode(false)
      expect(await poolFactory.isWhitelistEnabled()).to.be.false
    })

    it('Should not allow non-owner to change whitelist mode', async function () {
      await expect(poolFactory.connect(addr1).setWhitelistMode(true)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })
  })

  describe('Authorization Check', function () {
    it('Should return true for owner regardless of whitelist mode', async function () {
      // With whitelist disabled
      expect(await poolFactory.isAuthorizedCreator(owner.address)).to.be.true

      // With whitelist enabled
      await poolFactory.setWhitelistMode(true)
      expect(await poolFactory.isAuthorizedCreator(owner.address)).to.be.true
    })

    it('Should return false for non-authorized address when whitelist disabled', async function () {
      expect(await poolFactory.isAuthorizedCreator(addr1.address)).to.be.false
    })

    it('Should return correct authorization when whitelist enabled', async function () {
      await poolFactory.setWhitelistMode(true)

      // Non-authorized address should return false
      expect(await poolFactory.isAuthorizedCreator(addr1.address)).to.be.false

      // Authorize and check
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      expect(await poolFactory.isAuthorizedCreator(addr1.address)).to.be.true
    })
  })

  describe('Pool Creation with Whitelist', function () {
    const poolParams = {
      poolOwner: '0x0000000000000000000000000000000000000000', // Will be set in tests
      maxLoanAmount: ethers.parseEther('1000'),
      interestRate: 500, // 5%
      loanDuration: 30 * 24 * 60 * 60, // 30 days
      name: 'Test Pool',
      description: 'Test pool description',
    }

    it('Should allow owner to create pools when whitelist disabled (default behavior)', async function () {
      const params = { ...poolParams, poolOwner: addr1.address }

      await expect(poolFactory.createPool(params)).to.not.be.reverted
      expect(await poolFactory.getPoolCount()).to.equal(1)
    })

    it('Should prevent non-owner from creating pools when whitelist disabled', async function () {
      const params = { ...poolParams, poolOwner: addr2.address }

      await expect(poolFactory.connect(addr1).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')
    })

    it('Should allow owner to create pools when whitelist enabled', async function () {
      await poolFactory.setWhitelistMode(true)
      const params = { ...poolParams, poolOwner: addr1.address }

      await expect(poolFactory.createPool(params)).to.not.be.reverted
      expect(await poolFactory.getPoolCount()).to.equal(1)
    })

    it('Should allow authorized creator to create pools when whitelist enabled', async function () {
      await poolFactory.setWhitelistMode(true)
      await poolFactory.setCreatorAuthorization(addr1.address, true)

      const params = { ...poolParams, poolOwner: addr2.address }

      await expect(poolFactory.connect(addr1).createPool(params)).to.not.be.reverted
      expect(await poolFactory.getPoolCount()).to.equal(1)
    })

    it('Should prevent unauthorized creator from creating pools when whitelist enabled', async function () {
      await poolFactory.setWhitelistMode(true)

      const params = { ...poolParams, poolOwner: addr2.address }

      await expect(poolFactory.connect(addr1).createPool(params)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')
    })

    it('Should prevent revoked creator from creating pools', async function () {
      await poolFactory.setWhitelistMode(true)
      await poolFactory.setCreatorAuthorization(addr1.address, true)

      // Verify authorization works
      const params = { ...poolParams, poolOwner: addr2.address }
      await expect(poolFactory.connect(addr1).createPool(params)).to.not.be.reverted

      // Revoke authorization
      await poolFactory.setCreatorAuthorization(addr1.address, false)

      // Should now fail
      const params2 = { ...poolParams, poolOwner: addr3.address, name: 'Test Pool 2' }
      await expect(poolFactory.connect(addr1).createPool(params2)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')
    })
  })

  describe('Multiple Authorized Creators', function () {
    const testPoolParams = {
      poolOwner: '0x0000000000000000000000000000000000000000', // Will be set in tests
      maxLoanAmount: ethers.parseEther('1000'),
      interestRate: 500, // 5%
      loanDuration: 30 * 24 * 60 * 60, // 30 days
      name: 'Test Pool',
      description: 'Test pool description',
    }

    it('Should handle multiple authorized creators correctly', async function () {
      await poolFactory.setWhitelistMode(true)

      // Authorize multiple creators
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      await poolFactory.setCreatorAuthorization(addr2.address, true)

      // Both should be able to create pools
      const params1 = { ...testPoolParams, poolOwner: owner.address, name: 'Pool 1' }
      const params2 = { ...testPoolParams, poolOwner: owner.address, name: 'Pool 2' }

      await expect(poolFactory.connect(addr1).createPool(params1)).to.not.be.reverted
      await expect(poolFactory.connect(addr2).createPool(params2)).to.not.be.reverted

      expect(await poolFactory.getPoolCount()).to.equal(2)
    })

    it('Should allow selective revocation', async function () {
      await poolFactory.setWhitelistMode(true)

      // Authorize both
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      await poolFactory.setCreatorAuthorization(addr2.address, true)

      // Revoke only addr1
      await poolFactory.setCreatorAuthorization(addr1.address, false)

      // addr1 should fail, addr2 should succeed
      const params1 = { ...testPoolParams, poolOwner: owner.address, name: 'Pool 1' }
      const params2 = { ...testPoolParams, poolOwner: owner.address, name: 'Pool 2' }

      await expect(poolFactory.connect(addr1).createPool(params1)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

      await expect(poolFactory.connect(addr2).createPool(params2)).to.not.be.reverted

      expect(await poolFactory.getPoolCount()).to.equal(1)
    })
  })
})
