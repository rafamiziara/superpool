import { ethers, isSimulatedNetwork, network, upgrades } from '../hardhat.connection'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types'
import { expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { deploySafe, SafeConfig } from '../scripts/deploy-safe'
import { completeOwnershipTransfer, initiateOwnershipTransfer, verifyOwnershipStatus } from '../scripts/transfer-ownership'
import { LendingPool, PoolFactory } from '../typechain-types'
// chai-as-promised, for the async assertions below.
use(chaiAsPromised)

describe('Safe Integration Tests', function () {
  // The Safe SDK talks to a live JSON-RPC node, which the ephemeral in-process
  // network is not — so these skip under a plain `pnpm test` and have to be run
  // against a node: `pnpm test:safe:local` (bare Hardhat node) or
  // `pnpm test:integration` (Amoy fork).
  //
  // They also needed the canonical Safe singletons, which no local node has.
  // That is what kept these 14 skipped in every run this project has recorded,
  // and it is now `lib/safe.ts`'s job: it puts Safe on the node in front of it
  // and hands the SDK the addresses. See `safeContractNetworks`.
  before(function () {
    if (isSimulatedNetwork) {
      this.skip()
    }
  })

  let poolFactory: PoolFactory
  let lendingPoolImplementation: LendingPool
  let deployer: HardhatEthersSigner
  let safeOwner1: HardhatEthersSigner
  let safeOwner2: HardhatEthersSigner
  let safeOwner3: HardhatEthersSigner
  let otherAccount: HardhatEthersSigner
  let backendWallet: HardhatEthersSigner
  let safeAddress: string

  beforeEach(async function () {
    // Get signers
    ;[deployer, safeOwner1, safeOwner2, safeOwner3, otherAccount, backendWallet] = await ethers.getSigners()

    // Deploy lending pool implementation
    const LendingPool = await ethers.getContractFactory('LendingPool')
    lendingPoolImplementation = await LendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()

    // Deploy PoolFactory
    const PoolFactory = await ethers.getContractFactory('PoolFactory')
    // Behind its UUPS proxy, which is how the factory actually runs. These
    // tests used to deploy the implementation and call `initialize` on it
    // directly; the implementation now locks itself in its constructor, so
    // that shortcut is gone — which is the point of the constructor.
    poolFactory = (await upgrades.deployProxy(PoolFactory, [deployer.address, await lendingPoolImplementation.getAddress()], {
      initializer: 'initialize',
      kind: 'uups',
    })) as unknown as PoolFactory
    await poolFactory.waitForDeployment()
  })

  describe('Safe Deployment', function () {
    it('Should deploy Safe with correct configuration', async function () {
      const safeConfig: SafeConfig = {
        owners: [safeOwner1.address, safeOwner2.address, safeOwner3.address],
        threshold: 2,
        saltNonce: '0x' + Date.now().toString(16),
      }

      const deploymentResult = await deploySafe(safeConfig)

      expect(deploymentResult.safeAddress).to.not.equal(ethers.ZeroAddress)
      expect(deploymentResult.owners).to.deep.equal(safeConfig.owners)
      expect(deploymentResult.threshold).to.equal(safeConfig.threshold)
      // Whatever node this suite was pointed at. It cannot be the simulated
      // chain — the `before` hook skips that — so the old literal 'hardhat'
      // was a value this assertion could never legitimately see.
      expect(deploymentResult.networkName).to.equal(network.name)

      // Verify Safe deployment by checking code at address
      const code = await ethers.provider.getCode(deploymentResult.safeAddress)
      expect(code).to.not.equal('0x')

      safeAddress = deploymentResult.safeAddress
    })

    it('Should reject invalid Safe configurations', async function () {
      // Empty owners array
      const invalidConfig1: SafeConfig = {
        owners: [],
        threshold: 1,
      }
      await expect(deploySafe(invalidConfig1)).to.be.rejectedWith('At least one owner is required')

      // Threshold greater than owners
      const invalidConfig2: SafeConfig = {
        owners: [safeOwner1.address],
        threshold: 2,
      }
      await expect(deploySafe(invalidConfig2)).to.be.rejectedWith('Threshold cannot be greater than number of owners')

      // Zero threshold
      const invalidConfig3: SafeConfig = {
        owners: [safeOwner1.address],
        threshold: 0,
      }
      await expect(deploySafe(invalidConfig3)).to.be.rejectedWith('Threshold must be at least 1')

      // Invalid owner address
      const invalidConfig4: SafeConfig = {
        owners: ['0xinvalid'],
        threshold: 1,
      }
      await expect(deploySafe(invalidConfig4)).to.be.rejectedWith('Invalid owner address')
    })

    it('Should deploy different Safes with different configurations', async function () {
      const config1: SafeConfig = {
        owners: [safeOwner1.address, safeOwner2.address],
        threshold: 1,
        saltNonce: '0x1111',
      }

      const config2: SafeConfig = {
        owners: [safeOwner1.address, safeOwner2.address, safeOwner3.address],
        threshold: 2,
        saltNonce: '0x2222',
      }

      const result1 = await deploySafe(config1)
      const result2 = await deploySafe(config2)

      expect(result1.safeAddress).to.not.equal(result2.safeAddress)
      expect(result1.threshold).to.equal(1)
      expect(result2.threshold).to.equal(2)
      expect(result1.owners.length).to.equal(2)
      expect(result2.owners.length).to.equal(3)
    })
  })

  describe('Ownership Transfer Integration', function () {
    beforeEach(async function () {
      // Deploy a Safe for testing
      const safeConfig: SafeConfig = {
        owners: [safeOwner1.address, safeOwner2.address, safeOwner3.address],
        threshold: 2,
        saltNonce: '0x' + Date.now().toString(16),
      }

      const deploymentResult = await deploySafe(safeConfig)
      safeAddress = deploymentResult.safeAddress
    })

    it('Should successfully initiate ownership transfer to Safe', async function () {
      const result = await initiateOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
      })

      expect(result.step).to.equal('initiated')
      expect(result.currentOwner).to.equal(deployer.address)
      expect(result.pendingOwner).to.equal(safeAddress)
      expect(result.transactionHash).to.not.be.undefined

      // Verify the ownership status using the verification function
      await verifyOwnershipStatus(await poolFactory.getAddress(), safeAddress)
    })

    it('Should reject ownership transfer with invalid addresses', async function () {
      await expect(
        initiateOwnershipTransfer({
          poolFactoryAddress: '0xinvalid',
          safeAddress: safeAddress,
        })
      ).to.be.rejectedWith('Invalid PoolFactory address')

      await expect(
        initiateOwnershipTransfer({
          poolFactoryAddress: await poolFactory.getAddress(),
          safeAddress: '0xinvalid',
        })
      ).to.be.rejectedWith('Invalid Safe address')
    })

    it('Should complete ownership transfer from Safe (simulated)', async function () {
      // First initiate the transfer
      await initiateOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
      })

      const result = await completeOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
        executeImmediately: true,
      })

      // `completed`, not `['prepared', 'completed']`. This used to accept either
      // because one key cannot meet a 2-of-3 threshold — but on a local node
      // every Safe owner is a Hardhat account, so the signatures can actually be
      // collected and the second half of `Ownable2Step` actually runs. Accepting
      // `prepared` here meant the test passed without the accepting transaction
      // ever being sent, which is the only part of this that is irreversible on
      // a real chain.
      expect(result.step).to.equal('completed')
      expect(result.safeTransactionHash).to.not.be.undefined
      expect(result.newOwner).to.equal(safeAddress)

      const status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(safeAddress)
      expect(status.hasPendingTransfer).to.be.false
    })

    it('Should handle ownership verification correctly', async function () {
      // Before transfer
      await verifyOwnershipStatus(await poolFactory.getAddress())

      // After initiating transfer
      await initiateOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
      })

      await verifyOwnershipStatus(await poolFactory.getAddress(), safeAddress)

      // Verify the status is correctly reported
      const status = await poolFactory.getOwnershipStatus()
      expect(status.currentOwner).to.equal(deployer.address)
      expect(status.pendingOwnerAddress).to.equal(safeAddress)
      expect(status.hasPendingTransfer).to.be.true
    })

    it('Should prevent duplicate ownership transfer initiation', async function () {
      // First transfer
      await initiateOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
      })

      // Attempting same transfer should still work (will update pending owner)
      const result = await initiateOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
      })

      expect(result.step).to.equal('initiated')
      expect(result.pendingOwner).to.equal(safeAddress)
    })

    it('Should reject ownership transfer from non-owner', async function () {
      // This test would require mocking the signer, so we'll test the contract directly
      await expect(poolFactory.connect(otherAccount).transferOwnership(safeAddress))
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(otherAccount.address)
    })
  })

  describe('Post-Transfer Safe Operations', function () {
    beforeEach(async function () {
      // Deploy Safe and complete ownership transfer
      const safeConfig: SafeConfig = {
        owners: [safeOwner1.address, safeOwner2.address, safeOwner3.address],
        threshold: 2,
        saltNonce: '0x' + Date.now().toString(16),
      }

      const deploymentResult = await deploySafe(safeConfig)
      safeAddress = deploymentResult.safeAddress

      // Appointed *before* ownership moves, which is the ordering the Amoy
      // checklist is emphatic about: afterwards it takes a Safe transaction.
      await (await poolFactory.setPoolCreatorAdmin(backendWallet.address)).wait()

      // Both halves, so these tests run against a factory the Safe actually
      // owns. This used to stop after `initiate` — it asked Hardhat for a
      // `Safe` artifact this project does not compile, threw, and left a
      // describe block named "Post-Transfer" asserting that the transfer had
      // *not* happened. Nothing noticed, because the whole file was skipped.
      await initiateOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
      })

      await completeOwnershipTransfer({
        poolFactoryAddress: await poolFactory.getAddress(),
        safeAddress: safeAddress,
        executeImmediately: true,
      })
    })

    it('Should verify Safe ownership after transfer', async function () {
      const status = await poolFactory.getOwnershipStatus()

      expect(status.currentOwner).to.equal(safeAddress)
      expect(status.hasPendingTransfer).to.be.false
    })

    // Why the handover is shaped this way: one write to the beacon replaces the
    // logic of every pool at once, so that authority belongs to the Safe — while
    // the backend keeps the single power lazy whitelisting needs, and no other.
    // See `CLAUDE.md` → Keys and roles.
    it('Should leave the backend wallet able to whitelist', async function () {
      await (await poolFactory.connect(backendWallet).setCreatorAuthorization(otherAccount.address, true)).wait()

      expect(await poolFactory.authorizedCreators(otherAccount.address)).to.be.true
    })

    it('Should refuse everything else to the backend wallet', async function () {
      await expect(poolFactory.connect(backendWallet).pause())
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(backendWallet.address)

      await expect(poolFactory.connect(backendWallet).setPoolCreatorAdmin(backendWallet.address))
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(backendWallet.address)

      await expect(poolFactory.connect(backendWallet).setLoanTokenAuthorization(otherAccount.address, true))
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(backendWallet.address)
    })

    it('Should refuse owner-only calls from the address that deployed it', async function () {
      await expect(poolFactory.connect(deployer).pause())
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(deployer.address)

      await expect(poolFactory.connect(deployer).setPoolCreatorAdmin(otherAccount.address))
        .to.be.revertedWithCustomError(poolFactory, 'OwnableUnauthorizedAccount')
        .withArgs(deployer.address)
    })

    it('Should verify Safe configuration remains intact', async function () {
      // Verify the Safe still has correct configuration
      // Note: This test assumes we can interact with the Safe contract
      // In a real test environment, we would check Safe's owners and threshold

      // For now, we'll verify the deployment was successful
      const code = await ethers.provider.getCode(safeAddress)
      expect(code).to.not.equal('0x')
      expect(ethers.isAddress(safeAddress)).to.be.true
    })
  })

  describe('Error Handling and Edge Cases', function () {
    it('Should handle ownership status verification with non-existent contract', async function () {
      const fakeAddress = '0x1234567890123456789012345678901234567890'

      await expect(verifyOwnershipStatus(fakeAddress)).to.be.rejected // Should fail when trying to call non-existent contract
    })

    it('Should handle Safe deployment with duplicate salt nonce gracefully', async function () {
      const saltNonce = '0xdeadbeef'

      const config1: SafeConfig = {
        owners: [safeOwner1.address],
        threshold: 1,
        saltNonce: saltNonce,
      }

      const config2: SafeConfig = {
        owners: [safeOwner2.address],
        threshold: 1,
        saltNonce: saltNonce, // Same salt nonce
      }

      const result1 = await deploySafe(config1)

      // Second deployment with same salt should either fail or produce different address
      // (depending on Safe's CREATE2 implementation)
      try {
        const result2 = await deploySafe(config2)
        // If it succeeds, addresses should be different due to different owners
        expect(result1.safeAddress).to.not.equal(result2.safeAddress)
      } catch (error) {
        // If it fails, that's also acceptable behavior
        expect(error).to.be.instanceOf(Error)
      }
    })

    it('Should handle large number of Safe owners', async function () {
      // Test with maximum practical number of owners (up to 20)
      const owners = []
      for (let i = 0; i < 5; i++) {
        const wallet = ethers.Wallet.createRandom()
        owners.push(wallet.address)
      }

      const config: SafeConfig = {
        owners: owners,
        threshold: 3,
        saltNonce: '0x' + Date.now().toString(16),
      }

      const result = await deploySafe(config)
      expect(result.owners.length).to.equal(5)
      expect(result.threshold).to.equal(3)
    })
  })
})
