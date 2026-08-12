import type { MemberInfo, PoolInfo } from '@superpool/types'
import React from 'react'
import { parseEther } from 'viem'
import { render } from '../../__tests__/test-utils'
import { poolStore } from '../../stores/PoolStore'
import { DiscoverPoolCard } from './DiscoverPoolCard'

const STRANGER = '0x0000000000000000000000000000000000000042'
const OTHER = '0x00000000000000000000000000000000000000aa'

function makePool(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    poolId: 11,
    poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
    poolOwner: STRANGER,
    name: 'Harvest Collective',
    description: 'Smallholder farmers pooling for seed',
    maxLoanAmount: parseEther('750').toString(),
    interestRate: 600,
    loanDuration: 2_592_000,
    chainId: 31337,
    createdBy: STRANGER,
    createdAt: '2026-08-11T09:00:00.000Z',
    transactionHash: '0xaaa',
    isActive: true,
    ...overrides,
  }
}

function makeMember(account: string, status: MemberInfo['status'] = 'active'): MemberInfo {
  return {
    id: `31337-11-${account}`,
    poolId: 11,
    poolAddress: makePool().poolAddress,
    account,
    status,
    joinedAt: '2026-08-10T08:00:00.000Z',
    chainId: 31337,
    transactionHash: '0xccc',
    blockNumber: 102,
  }
}

function makeContribution(contributor: string, amount: bigint, id = '31337-0xbbb-0') {
  return {
    id,
    poolId: 11,
    poolAddress: makePool().poolAddress,
    contributor,
    amount: amount.toString(),
    chainId: 31337,
    transactionHash: '0xbbb',
    logIndex: 0,
    blockNumber: 101,
    contributedAt: '2026-08-10T08:00:00.000Z',
  }
}

beforeEach(() => {
  // Mock mode short-circuits `memberships` to the fixtures, which would ignore
  // everything these tests set up.
  delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS
  poolStore.pools = [makePool()]
  poolStore.memberRecords = []
  poolStore.contributions = []
  poolStore.withdrawals = []
})

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
  poolStore.pools = []
  poolStore.memberRecords = []
  poolStore.contributions = []
  poolStore.withdrawals = []
})

describe('DiscoverPoolCard', () => {
  it('names the pool and its terms', () => {
    const { getByText } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByText('Harvest Collective')).toBeTruthy()
    expect(getByText('750 POL')).toBeTruthy()
    expect(getByText('6%')).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // What a stranger needs instead of a balance.
  //
  // `PoolCard`'s footer answers "what do I have here", which for someone who is
  // not in the pool is nothing. The pool's own size is the question that
  // replaces it.
  // -------------------------------------------------------------------------

  it('shows the pool’s liquidity rather than the user’s position', () => {
    poolStore.contributions = [makeContribution(STRANGER, parseEther('40'))]

    const { getByTestId } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByTestId('discover-pool-liquidity-11')).toHaveTextContent('40 POL')
  })

  it('counts the members behind that liquidity', () => {
    poolStore.memberRecords = [makeMember(STRANGER), makeMember(OTHER)]

    const { getByTestId } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByTestId('discover-pool-members-11')).toHaveTextContent('2 members')
  })

  it('uses the singular for one member', () => {
    poolStore.memberRecords = [makeMember(STRANGER)]

    const { getByTestId } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByTestId('discover-pool-members-11')).toHaveTextContent('1 member')
  })

  it('reads an untouched pool as empty rather than breaking', () => {
    const { getByTestId } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByTestId('discover-pool-members-11')).toHaveTextContent('0 members')
    expect(getByTestId('discover-pool-liquidity-11')).toHaveTextContent('0 POL')
  })

  it('does not count an applicant as a member', () => {
    poolStore.memberRecords = [makeMember(STRANGER, 'active'), makeMember(OTHER, 'requested')]

    const { getByTestId } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByTestId('discover-pool-members-11')).toHaveTextContent('1 member')
  })

  it('reports what is left after a withdrawal', () => {
    poolStore.contributions = [makeContribution(STRANGER, parseEther('40'))]
    poolStore.withdrawals = [
      {
        id: '31337-0xccc-0',
        poolId: 11,
        poolAddress: makePool().poolAddress,
        member: STRANGER,
        amount: parseEther('15').toString(),
        chainId: 31337,
        transactionHash: '0xccc',
        logIndex: 0,
        blockNumber: 103,
        withdrawnAt: '2026-08-11T08:00:00.000Z',
      },
    ]

    const { getByTestId } = render(<DiscoverPoolCard pool={makePool()} />)

    expect(getByTestId('discover-pool-liquidity-11')).toHaveTextContent('25 POL')
  })
})
