import { ethers, upgrades } from '../hardhat.connection'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect } from 'chai'
import { LendingPool, PoolFactory } from '../typechain-types'

describe('Whitelist System', function () {
  let poolFactory: PoolFactory
  let lendingPoolImplementation: LendingPool
  let owner: HardhatEthersSigner
  let addr1: HardhatEthersSigner
  let addr2: HardhatEthersSigner
  let addr3: HardhatEthersSigner

  beforeEach(async function () {
    ;[owner, addr1, addr2, addr3] = await ethers.getSigners()

    // Deploy lending pool implementation
    const LendingPool = await ethers.getContractFactory('LendingPool')
    lendingPoolImplementation = await LendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()

    // Deploy pool factory
    const PoolFactory = await ethers.getContractFactory('PoolFactory')
    // Behind its UUPS proxy, which is how the factory actually runs. These
    // tests used to deploy the implementation and call `initialize` on it
    // directly; the implementation now locks itself in its constructor, so
    // that shortcut is gone — which is the point of the constructor.
    poolFactory = (await upgrades.deployProxy(PoolFactory, [owner.address, await lendingPoolImplementation.getAddress()], {
      initializer: 'initialize',
      kind: 'uups',
    })) as unknown as PoolFactory
    await poolFactory.waitForDeployment()
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

    it('Should not allow a stranger to authorize creators', async function () {
      // `UnauthorizedCreator` rather than `OwnableUnauthorizedAccount`: this is
      // no longer `onlyOwner`, because the owner is not the only address
      // entitled to it. See the `poolCreatorAdmin` block below.
      await expect(poolFactory.connect(addr1).setCreatorAuthorization(addr2.address, true)).to.be.revertedWithCustomError(
        poolFactory,
        'UnauthorizedCreator'
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

  describe('Pool Creation (Lazy Whitelisting)', function () {
    const poolParams = {
      maxLoanAmount: ethers.parseEther('1000'),
      interestRate: 500, // 5%
      loanDuration: 30 * 24 * 60 * 60, // 30 days
      name: 'Test Pool',
      description: 'Test pool description',
      requiresMembership: false,
      loanToken: ethers.ZeroAddress,
    }

    it('Should allow owner to create pools (owner always authorized)', async function () {
      // Owner can create without explicit authorization
      await expect(poolFactory.connect(owner).createPool(poolParams)).to.not.be.revert(ethers)

      // Verify owner becomes pool owner
      const poolInfo = await poolFactory.getPoolInfo(1)
      expect(poolInfo.poolOwner).to.equal(owner.address)
    })

    it('Should reject non-authorized creators when whitelist disabled (default)', async function () {
      // Whitelist disabled by default (only owner can create)
      expect(await poolFactory.isWhitelistEnabled()).to.be.false

      // Non-owner cannot create (not authorized)
      await expect(poolFactory.connect(addr1).createPool(poolParams)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

      // Owner can always create
      await expect(poolFactory.connect(owner).createPool(poolParams)).to.not.be.revert(ethers)
      expect(await poolFactory.getPoolCount()).to.equal(1)
    })

    it('Should enforce whitelist when enabled (lazy whitelisting simulation)', async function () {
      await poolFactory.setWhitelistMode(true)

      // addr1 is NOT authorized
      expect(await poolFactory.isAuthorizedCreator(addr1.address)).to.be.false

      // Cannot create pools (whitelist enforced)
      await expect(poolFactory.connect(addr1).createPool(poolParams)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

      // Backend whitelists user (lazy whitelisting)
      await poolFactory.setCreatorAuthorization(addr1.address, true)

      // Now addr1 can create pools
      await expect(poolFactory.connect(addr1).createPool(poolParams)).to.not.be.revert(ethers)

      // Verify creator became pool owner
      const poolInfo = await poolFactory.getPoolInfo(1)
      expect(poolInfo.poolOwner).to.equal(addr1.address)
    })

    it('Should enforce authorization for all non-owner creators', async function () {
      await poolFactory.setWhitelistMode(true)

      // Authorize addr1 but not addr2
      await poolFactory.setCreatorAuthorization(addr1.address, true)

      // addr1 can create (authorized)
      await expect(poolFactory.connect(addr1).createPool(poolParams)).to.not.be.revert(ethers)

      // addr2 cannot create (not authorized)
      await expect(poolFactory.connect(addr2).createPool(poolParams)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

      expect(await poolFactory.getPoolCount()).to.equal(1)
    })
  })

  describe('Multiple Authorized Creators (Lazy Whitelisting)', function () {
    const testPoolParams = {
      maxLoanAmount: ethers.parseEther('1000'),
      interestRate: 500, // 5%
      loanDuration: 30 * 24 * 60 * 60, // 30 days
      name: 'Test Pool',
      description: 'Test pool description',
      requiresMembership: false,
      loanToken: ethers.ZeroAddress,
    }

    it('Should allow multiple authorized creators when whitelisted', async function () {
      await poolFactory.setWhitelistMode(true)

      // Authorize multiple creators (simulating lazy whitelisting)
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      await poolFactory.setCreatorAuthorization(addr2.address, true)

      // Both authorized can create pools
      const params1 = { ...testPoolParams, name: 'Pool 1' }
      const params2 = { ...testPoolParams, name: 'Pool 2' }

      await expect(poolFactory.connect(addr1).createPool(params1)).to.not.be.revert(ethers)
      await expect(poolFactory.connect(addr2).createPool(params2)).to.not.be.revert(ethers)

      // Non-authorized cannot create (whitelist enforced)
      const params3 = { ...testPoolParams, name: 'Pool 3' }
      await expect(poolFactory.connect(addr3).createPool(params3)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

      expect(await poolFactory.getPoolCount()).to.equal(2)
    })

    it('Should prevent creation after authorization revocation', async function () {
      await poolFactory.setWhitelistMode(true)

      // Authorize both
      await poolFactory.setCreatorAuthorization(addr1.address, true)
      await poolFactory.setCreatorAuthorization(addr2.address, true)

      // Revoke only addr1
      await poolFactory.setCreatorAuthorization(addr1.address, false)

      // addr1 can no longer create (authorization revoked)
      const params1 = { ...testPoolParams, name: 'Pool 1' }
      await expect(poolFactory.connect(addr1).createPool(params1)).to.be.revertedWithCustomError(poolFactory, 'UnauthorizedCreator')

      // addr2 can still create pools (still authorized)
      const params2 = { ...testPoolParams, name: 'Pool 2' }
      await expect(poolFactory.connect(addr2).createPool(params2)).to.not.be.revert(ethers)

      expect(await poolFactory.getPoolCount()).to.equal(1)
    })
  })

  /**
   * The role that lets the Safe own the factory without breaking pool creation.
   *
   * `createPool` is gated on `authorizedCreators`, and the backend adds a
   * wallet to that list on demand and pays the gas — so the backend's key had
   * to be able to call `setCreatorAuthorization`. While that was `onlyOwner`,
   * the backend's key had to be the factory *owner*: the key that authorises a
   * UUPS upgrade and can point the beacon at new pool logic for every pool at
   * once. A server environment variable held every member's money.
   */
  describe('The pool creator admin', function () {
    it('is nobody by default, which is the world before it existed', async function () {
      expect(await poolFactory.poolCreatorAdmin()).to.equal(ethers.ZeroAddress)
    })

    it('lets the appointed admin authorize creators', async function () {
      await expect(poolFactory.connect(owner).setPoolCreatorAdmin(addr1.address))
        .to.emit(poolFactory, 'PoolCreatorAdminChanged')
        .withArgs(addr1.address)

      await poolFactory.connect(addr1).setCreatorAuthorization(addr2.address, true)

      expect(await poolFactory.authorizedCreators(addr2.address)).to.be.true
    })

    it('does not let the admin do anything else', async function () {
      // The whole point: a compromised backend key can add a spam creator and
      // nothing more. It cannot upgrade, cannot pause, cannot re-appoint
      // itself, and cannot touch the token allowlist.
      await poolFactory.connect(owner).setPoolCreatorAdmin(addr1.address)

      await expect(poolFactory.connect(addr1).setPoolCreatorAdmin(addr2.address)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
      await expect(poolFactory.connect(addr1).pause()).to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
      await expect(poolFactory.connect(addr1).setWhitelistMode(true)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
      await expect(poolFactory.connect(addr1).updateImplementation(addr3.address)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })

    it('can be withdrawn by the owner', async function () {
      await poolFactory.connect(owner).setPoolCreatorAdmin(addr1.address)
      await poolFactory.connect(owner).setPoolCreatorAdmin(ethers.ZeroAddress)

      await expect(poolFactory.connect(addr1).setCreatorAuthorization(addr2.address, true)).to.be.revertedWithCustomError(
        poolFactory,
        'UnauthorizedCreator'
      )
    })

    it('is not something a stranger can appoint themselves to', async function () {
      await expect(poolFactory.connect(addr1).setPoolCreatorAdmin(addr1.address)).to.be.revertedWithCustomError(
        poolFactory,
        'OwnableUnauthorizedAccount'
      )
    })

    it('refuses to let the factory be left without an owner', async function () {
      // An unowned factory can never be upgraded, can never appoint an admin,
      // and — with the whitelist off — can never create another pool.
      await expect(poolFactory.connect(owner).renounceOwnership()).to.be.revertedWithCustomError(poolFactory, 'OwnershipCannotBeRenounced')

      expect(await poolFactory.owner()).to.equal(owner.address)
    })
  })
})
