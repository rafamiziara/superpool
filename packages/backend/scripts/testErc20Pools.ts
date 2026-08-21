/**
 * Manual integration test for pools denominated in an ERC-20.
 *
 * Drives real token deposits, loans and repayments through a live local
 * Hardhat node, against three tokens chosen for what they get wrong:
 *
 * - a well-behaved six-decimal one, which is USDC's shape;
 * - one that takes a fee on transfer, so less arrives than was asked for;
 * - one whose `transfer` returns nothing, as USDT's does.
 *
 * The unit suites mock ethers entirely and the contract suite cannot see the
 * indexer, so this is the only place the token path is checked end to end. The
 * check that matters most is the fee-on-transfer one: crediting the requested
 * amount rather than the delivered one inflates `totalContributions`, which is
 * the denominator every interest distribution divides by — so it dilutes every
 * other lender for the life of the pool, silently and permanently.
 *
 * Prerequisites:
 *   Terminal 1 → cd packages/contracts && pnpm node:local
 *   Terminal 2 → cd packages/contracts && pnpm deploy:local
 *   Terminal 3 → cd config             && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 4 → cd packages/backend   && pnpm testErc20
 *
 * Required .env values:
 *   POOL_FACTORY_ADDRESS=<address printed by deploy:local>
 *   CHAIN_ID=31337
 *   RPC_URL=http://127.0.0.1:8545
 *
 * The tokens are deployed by this script rather than read from the deployment
 * record: two of the three misbehave deliberately and have no business being
 * authorized on a factory anyone else will use.
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { BaseContract, Contract, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LendingPoolABI, PoolFactoryABI } from '../src/constants/abis'
import { CONTRIBUTIONS_COLLECTION, POOLS_COLLECTION } from '../src/constants/firestore'
import { indexContributionsByTxHash } from '../src/services/contributionIndexer'
import { indexPoolByTxHash } from '../src/services/eventIndexer'

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '31337')
const FACTORY_ADDRESS = process.env.POOL_FACTORY_ADDRESS || ''

/** Thirty days at 1000bp, so a full term costs a round 10%. */
const TERM = 30 * 24 * 60 * 60
const RATE = 1000

/** Six, because that is USDC's and because eighteen would hide every exponent bug. */
const DECIMALS = 6

/** One whole token, in its own smallest unit. */
const ONE = 10n ** BigInt(DECIMALS)

/** Hardhat's published accounts. Safe here by construction and nowhere else. */
const KEYS = {
  owner: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  lender: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  borrower: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  other: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
}

const PROJECT_ID = `verify-erc20-${Date.now()}`
const firestore = getFirestore(initializeApp({ projectId: PROJECT_ID }, PROJECT_ID))

// ── Reporting ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function separator(title: string) {
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(64))
}

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ── Chain setup ───────────────────────────────────────────────────────────────

function as(contract: BaseContract): Contract {
  return contract as Contract
}

const nonces = new Map<string, number>()

async function nextNonce(provider: JsonRpcProvider, address: string): Promise<number> {
  if (!nonces.has(address)) {
    nonces.set(address, await provider.getTransactionCount(address, 'latest'))
  }

  const nonce = nonces.get(address)!
  nonces.set(address, nonce + 1)

  return nonce
}

/**
 * Runs something that is expected to revert, and reports whether it did.
 *
 * The nonce reset is the point. A transaction that fails estimation never
 * reaches the chain, so the account's nonce does not move — but the counter
 * above has already handed one out, and every later transaction from that
 * account is then one ahead and rejected outright.
 */
async function expectRevert(sender: Wallet, action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action()

    return false
  } catch {
    nonces.delete(sender.address)

    return true
  }
}

/**
 * The compiled artifact for one of the contracts package's test fixtures.
 *
 * Read from its build output rather than duplicated here: a hand-written
 * bytecode string is a second copy of a contract that changes.
 */
function artifact(name: string): { abi: unknown[]; bytecode: string } {
  const path = join(__dirname, '..', '..', 'contracts', 'artifacts', 'contracts', 'test', `${name}.sol`, `${name}.json`)

  return JSON.parse(readFileSync(path, 'utf8')) as { abi: unknown[]; bytecode: string }
}

async function deployToken(deployer: Wallet, name: string, args: unknown[]): Promise<Contract> {
  const { abi, bytecode } = artifact(name)
  const factory = new ContractFactory(abi as never, bytecode, deployer)
  const token = await factory.deploy(...args)
  await token.waitForDeployment()

  // The deployment picked its own nonce, which the counter above knows nothing
  // about. Forgetting the cached value makes the next tracked transaction from
  // this account re-read it rather than reuse one the chain has already spent.
  nonces.delete(deployer.address)

  return token as Contract
}

interface PoolHandle {
  poolId: number
  address: string
  contract: Contract
}

async function createPool(provider: JsonRpcProvider, owner: Wallet, name: string, loanToken: string, maxLoan: bigint) {
  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  const tx = await factory.createPool(
    {
      maxLoanAmount: maxLoan,
      interestRate: RATE,
      loanDuration: TERM,
      name: `${name}-${Date.now()}`,
      description: 'erc20 verification',
      requiresMembership: false,
      loanToken,
    },
    { nonce: await nextNonce(provider, owner.address) }
  )
  const receipt = await tx.wait()

  const created = receipt.logs
    .map((log: { topics: string[]; data: string }) => {
      try {
        return factory.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((parsed: { name: string } | null) => parsed?.name === 'PoolCreated')

  const pool: PoolHandle = {
    poolId: Number(created.args.poolId),
    address: created.args.poolAddress as string,
    contract: new Contract(created.args.poolAddress as string, LendingPoolABI, owner),
  }

  return { pool, txHash: receipt.hash as string }
}

/** Approve, then deposit — the two transactions the app's contribute screen sends. */
async function depositTokens(provider: JsonRpcProvider, token: Contract, pool: PoolHandle, member: Wallet, amount: bigint) {
  const approve = await as(token.connect(member)).approve(pool.address, amount, { nonce: await nextNonce(provider, member.address) })
  await approve.wait()

  const deposit = await as(pool.contract.connect(member)).depositTokens(amount, { nonce: await nextNonce(provider, member.address) })
  const receipt = await deposit.wait()

  return { txHash: receipt.hash as string }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!FACTORY_ADDRESS) {
    console.error('POOL_FACTORY_ADDRESS is not set in packages/backend/.env')
    process.exitCode = 1

    return
  }

  // `cacheTimeout: -1` disables ethers' 250ms read cache. Two balance reads
  // either side of a transaction come back identical without it, which reads
  // as a contract bug and is not one.
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })

  const owner = new Wallet(KEYS.owner, provider)
  const lender = new Wallet(KEYS.lender, provider)
  const borrower = new Wallet(KEYS.borrower, provider)
  const other = new Wallet(KEYS.other, provider)

  console.log(`\nFactory:    ${FACTORY_ADDRESS}`)
  console.log(`Chain:      ${CHAIN_ID}`)
  console.log(`Firestore:  ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID})`)

  const factory = new Contract(FACTORY_ADDRESS, PoolFactoryABI, owner)

  // ---------------------------------------------------------------------------
  separator('The factory decides what a pool may be denominated in')
  // ---------------------------------------------------------------------------
  const usdc = await deployToken(owner, 'TestERC20', ['USD Coin', 'USDC', DECIMALS])
  const usdcAddress = await usdc.getAddress()

  const rejected = await expectRevert(owner, () => createPool(provider, owner, 'unauthorized', usdcAddress, 500n * ONE))
  check('a token not on the allowlist cannot denominate a pool', rejected)

  const authorize = await factory.setLoanTokenAuthorization(usdcAddress, true, { nonce: await nextNonce(provider, owner.address) })
  await authorize.wait()

  check('and is accepted once the owner authorizes it', (await factory.isAuthorizedLoanToken(usdcAddress)) === true)
  // True, and deliberately so: every pool may be native, and a caller checking
  // before it creates should not have to special-case the one denomination that
  // needs no permission.
  check('while native needs no entry on the list at all', (await factory.isAuthorizedLoanToken(ZeroAddress)) === true)

  // ---------------------------------------------------------------------------
  separator('A six-decimal pool, end to end')
  // ---------------------------------------------------------------------------
  const { pool, txHash: createTx } = await createPool(provider, owner, 'usdc', usdcAddress, 500n * ONE)

  for (const account of [owner, lender, borrower, other]) {
    const mint = await as(usdc.connect(account)).mint(account.address, 10_000n * ONE, {
      nonce: await nextNonce(provider, account.address),
    })
    await mint.wait()
  }

  const config = await pool.contract.poolConfig()
  check('the pool records the token it lends', config.loanToken === usdcAddress, `got ${config.loanToken}`)

  // The indexer is the only thing that tells the app how to read the figures.
  await indexPoolByTxHash(createTx, CHAIN_ID, provider, firestore)
  const poolDoc = (await firestore.collection(POOLS_COLLECTION).doc(`${CHAIN_ID}-${pool.poolId}`).get()).data()!

  check('and the index records its address', (poolDoc.loanToken as string).toLowerCase() === usdcAddress.toLowerCase())
  check('its symbol', poolDoc.tokenSymbol === 'USDC', `got ${poolDoc.tokenSymbol}`)
  check('and its decimals, without which every figure is out by 10^12', poolDoc.tokenDecimals === DECIMALS, `got ${poolDoc.tokenDecimals}`)

  // A deposit of a token nobody approved must fail, or the approval step in
  // the app is decoration.
  const unapproved = await expectRevert(other, async () =>
    as(pool.contract.connect(other)).depositTokens(10n * ONE, { nonce: await nextNonce(provider, other.address) })
  )
  check('a deposit without an allowance is refused', unapproved)

  const depositAmount = 1_000n * ONE
  const lenderBefore: bigint = await usdc.balanceOf(lender.address)
  const { txHash: depositTx } = await depositTokens(provider, usdc, pool, lender, depositAmount)

  check('the tokens leave the lender', (await usdc.balanceOf(lender.address)) === lenderBefore - depositAmount)
  check('and arrive at the pool', (await usdc.balanceOf(pool.address)) === depositAmount)
  check('credited to their position', (await pool.contract.contributions(lender.address)) === depositAmount)
  check('and counted once in totalContributions', (await pool.contract.totalContributions()) === depositAmount)

  await indexContributionsByTxHash(depositTx, CHAIN_ID, FACTORY_ADDRESS, provider, firestore)
  const deposits = await firestore.collection(CONTRIBUTIONS_COLLECTION).where('poolId', '==', pool.poolId).get()

  check('the deposit is indexed', deposits.size === 1, `found ${deposits.size}`)
  check(
    '  in the token’s own smallest unit, not converted',
    deposits.docs[0]?.data().amount === depositAmount.toString(),
    `got ${deposits.docs[0]?.data().amount}`
  )

  // A native deposit into a token pool must be refused rather than accepted
  // and credited as if it were the token.
  const wrongAsset = await expectRevert(lender, async () =>
    as(pool.contract.connect(lender)).depositFunds({ value: 1n, nonce: await nextNonce(provider, lender.address) })
  )
  check('the native entry point is closed on a token pool', wrongAsset)

  // ---------------------------------------------------------------------------
  separator('Borrowing and repaying in the token')
  // ---------------------------------------------------------------------------
  // Borrowing is gated on membership, not on having contributed — but this is
  // an open pool, and an open pool enrols whoever funds it. Depositing is how
  // the borrower joins, and it is worth checking that holds for a token
  // deposit too rather than only for a native one.
  await depositTokens(provider, usdc, pool, borrower, 10n * ONE)
  // `Membership.Active` is ordinal 2 — see the enum in LendingPool.
  check('funding an open pool enrols the depositor', Number(await pool.contract.membership(borrower.address)) === 2)

  const borrowAmount = 100n * ONE
  const borrowerBefore: bigint = await usdc.balanceOf(borrower.address)

  const borrowTx = await as(pool.contract.connect(borrower)).createLoan(borrowAmount, {
    nonce: await nextNonce(provider, borrower.address),
  })
  await borrowTx.wait()
  const loanId = Number((await pool.contract.nextLoanId()) - 1n)

  check('the borrower receives tokens, not the chain’s coin', (await usdc.balanceOf(borrower.address)) === borrowerBefore + borrowAmount)

  const quote: bigint = await pool.contract.calculateRepaymentAmount(loanId)
  check('the term’s price is principal plus the rate', quote === 110n * ONE, `got ${quote}`)

  // The head-room lives in the allowance, where it costs nothing: the pool
  // pulls min(amount, outstanding) priced at execution time, so nothing is
  // overpaid and there is nothing to refund.
  const headroom = quote * 2n
  const approveRepay = await as(usdc.connect(borrower)).approve(pool.address, headroom, {
    nonce: await nextNonce(provider, borrower.address),
  })
  await approveRepay.wait()

  const balanceBeforeRepay: bigint = await usdc.balanceOf(borrower.address)
  const repay = await as(pool.contract.connect(borrower)).repayLoanWithTokens(loanId, headroom, {
    nonce: await nextNonce(provider, borrower.address),
  })
  await repay.wait()

  const settled = await pool.contract.getLoan(loanId)
  const spent = balanceBeforeRepay - (await usdc.balanceOf(borrower.address))

  check('the loan is settled', settled.isRepaid === true)
  check('and only what was owed was taken', spent < quote, `took ${spent}, the term’s price is ${quote}`)
  check('  which is more than the principal', spent > borrowAmount, `took ${spent}`)
  check('the allowance keeps what was not used', (await usdc.allowance(borrower.address, pool.address)) === headroom - spent)

  const claimable: bigint = await pool.contract.claimable(lender.address)
  check('the lender has earned interest in the token', claimable > 0n, `claimable ${claimable}`)

  // ---------------------------------------------------------------------------
  separator('A token that takes a fee on transfer')
  // ---------------------------------------------------------------------------
  //
  // The failure this whole script exists for. Crediting the requested amount
  // rather than the delivered one inflates `totalContributions`, which every
  // interest distribution divides by — diluting every other lender for the
  // life of the pool, invisibly.
  const feeToken = await deployToken(owner, 'TestFeeOnTransferERC20', ['Fee Coin', 'FEE', DECIMALS, 500])
  const feeAddress = await feeToken.getAddress()

  const authorizeFee = await factory.setLoanTokenAuthorization(feeAddress, true, { nonce: await nextNonce(provider, owner.address) })
  await authorizeFee.wait()

  const { pool: feePool } = await createPool(provider, owner, 'fee', feeAddress, 500n * ONE)

  const mintFee = await as(feeToken.connect(lender)).mint(lender.address, 1_000n * ONE, {
    nonce: await nextNonce(provider, lender.address),
  })
  await mintFee.wait()

  const requested = 100n * ONE
  const poolBefore: bigint = await feeToken.balanceOf(feePool.address)
  await depositTokens(provider, feeToken, feePool, lender, requested)
  const delivered = (await feeToken.balanceOf(feePool.address)) - poolBefore

  check('the pool receives less than was asked for', delivered < requested, `asked ${requested}, got ${delivered}`)
  check(
    'the position credits what arrived, not what was requested',
    (await feePool.contract.contributions(lender.address)) === delivered,
    `credited ${await feePool.contract.contributions(lender.address)}, received ${delivered}`
  )
  check(
    'and totalContributions matches the pool’s real balance',
    (await feePool.contract.totalContributions()) === delivered,
    `denominator ${await feePool.contract.totalContributions()}, balance ${delivered}`
  )

  // ---------------------------------------------------------------------------
  separator('A token whose transfer returns nothing, as USDT’s does')
  // ---------------------------------------------------------------------------
  // No constructor arguments: it is written out by hand rather than inherited,
  // with its name, symbol and six decimals fixed.
  const quietToken = await deployToken(owner, 'TestNoReturnERC20', [])
  const quietAddress = await quietToken.getAddress()

  const authorizeQuiet = await factory.setLoanTokenAuthorization(quietAddress, true, { nonce: await nextNonce(provider, owner.address) })
  await authorizeQuiet.wait()

  const { pool: quietPool } = await createPool(provider, owner, 'quiet', quietAddress, 500n * ONE)

  const mintQuiet = await as(quietToken.connect(lender)).mint(lender.address, 1_000n * ONE, {
    nonce: await nextNonce(provider, lender.address),
  })
  await mintQuiet.wait()

  await depositTokens(provider, quietToken, quietPool, lender, 50n * ONE)

  check('a deposit still lands without a bool to check', (await quietToken.balanceOf(quietPool.address)) === 50n * ONE)
  check('and is credited', (await quietPool.contract.contributions(lender.address)) === 50n * ONE)

  // Reported rather than thrown, because this is the check: a pool reaching
  // for `IERC20.transfer` anywhere would decode a `bool` that is not there and
  // revert on a transfer that actually succeeded — unusable with the largest
  // stablecoin in circulation. Letting the script crash here would say the
  // harness broke rather than the pool did.
  let paidOut = false
  try {
    const withdraw = await as(quietPool.contract.connect(lender)).withdraw(50n * ONE, { nonce: await nextNonce(provider, lender.address) })
    await withdraw.wait()
    paidOut = (await quietToken.balanceOf(quietPool.address)) === 0n
  } catch (error) {
    nonces.delete(lender.address)
    console.log(`     ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`)
  }
  check('and it comes back out again, without a bool to decode', paidOut)

  // ---------------------------------------------------------------------------
  separator(`${passed} passed, ${failed} failed`)
  // ---------------------------------------------------------------------------
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const failure of failures) console.log(`  • ${failure}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
