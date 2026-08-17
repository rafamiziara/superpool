import type { Transaction } from '@superpool/types'
import { TransactionStatus, TransactionType } from '@superpool/types'
import React from 'react'
import { NATIVE } from '../../__tests__/fixtures/denomination'
import { render } from '../../__tests__/test-utils'
import { ActivityRow } from './ActivityRow'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const MEMBER = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '31337-0xabc-0',
    poolId: '11',
    from: MEMBER,
    to: POOL_ADDRESS,
    type: TransactionType.CONTRIBUTION,
    amount: 3_000_000_000_000_000_000n,
    status: TransactionStatus.CONFIRMED,
    txHash: '0xabc',
    blockNumber: 100,
    createdAt: new Date('2026-08-11T09:00:00.000Z'),
    confirmedAt: new Date('2026-08-11T09:00:00.000Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// The sign is the pool's, not the viewer's.
//
// Every feed this row appears in lists what happened to pools, and most rows
// belong to somebody else — so "money left my wallet" is the wrong question.
// Written from the wallet's side it reads backwards on every screen.
// ---------------------------------------------------------------------------

describe('ActivityRow signs', () => {
  it.each([
    [TransactionType.CONTRIBUTION, '+'],
    [TransactionType.LOAN_REPAYMENT, '+'],
  ])('marks %s as money arriving', (type, sign) => {
    const { getByText } = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type })} />)

    expect(getByText(`${sign}3 POL`)).toBeTruthy()
  })

  it.each([
    [TransactionType.WITHDRAWAL, '−'],
    [TransactionType.LOAN_DISBURSEMENT, '−'],
  ])('marks %s as money leaving', (type, sign) => {
    const { getByText } = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type })} />)

    expect(getByText(`${sign}3 POL`)).toBeTruthy()
  })

  it('gives a request no sign, because nothing has moved', () => {
    const { getByText } = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.LOAN_REQUEST })} />)

    expect(getByText('3 POL')).toBeTruthy()
  })

  it('does not describe a disbursement as received', () => {
    // Received by whom, on a feed of other people's loans.
    const { getByText, queryByText } = render(
      <ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.LOAN_DISBURSEMENT })} />
    )

    expect(getByText('Loan disbursed')).toBeTruthy()
    expect(queryByText('Loan received')).toBeNull()
  })

  it('reads a contribution and a withdrawal as opposites', () => {
    // The regression: both once carried the wallet's sign, so a pool feed
    // showed deposits as losses and withdrawals as gains.
    const deposit = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.CONTRIBUTION })} />)
    const withdrawal = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.WITHDRAWAL })} />)

    expect(deposit.getByText('+3 POL')).toBeTruthy()
    expect(withdrawal.getByText('−3 POL')).toBeTruthy()
  })

  it('omits the amount entirely when there is none', () => {
    const { queryByText } = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.POOL_CREATION, amount: 0n })} />)

    expect(queryByText(/POL/)).toBeNull()
  })

  it('flags a transaction the chain has not confirmed', () => {
    const { getByText } = render(<ActivityRow denomination={NATIVE} tx={makeTx({ status: TransactionStatus.PENDING })} />)

    expect(getByText('Pending')).toBeTruthy()
  })

  describe('the wallet perspective', () => {
    // Only correct on a feed already narrowed to one wallet. The same event is a
    // gain under one perspective and a loss under the other.
    it('reads a contribution as money the member sent', () => {
      const { getByText } = render(
        <ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.CONTRIBUTION })} perspective="wallet" />
      )

      expect(getByText('−3 POL')).toBeTruthy()
    })

    it('reads a disbursed loan as money the member received', () => {
      // The reason the prop exists: the pool's sign would mark this negative.
      const { getByText } = render(
        <ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.LOAN_DISBURSEMENT })} perspective="wallet" />
      )

      expect(getByText('+3 POL')).toBeTruthy()
      expect(getByText('Loan received')).toBeTruthy()
    })

    it('mirrors the pool exactly', () => {
      for (const type of [TransactionType.CONTRIBUTION, TransactionType.WITHDRAWAL, TransactionType.LOAN_DISBURSEMENT]) {
        const asPool = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type })} />)
          .getByText(/POL/)
          .props.children.join('')
        const asWallet = render(<ActivityRow denomination={NATIVE} tx={makeTx({ type })} perspective="wallet" />)
          .getByText(/POL/)
          .props.children.join('')

        expect(asPool.startsWith('+')).toBe(asWallet.startsWith('−'))
      }
    })

    it('leaves a request unsigned either way', () => {
      const { getByText } = render(
        <ActivityRow denomination={NATIVE} tx={makeTx({ type: TransactionType.LOAN_REQUEST })} perspective="wallet" />
      )

      expect(getByText('3 POL')).toBeTruthy()
    })
  })

  it('names the pool when given one', () => {
    const { getByText } = render(<ActivityRow denomination={NATIVE} tx={makeTx()} poolName="Neighbourhood Circle" />)

    expect(getByText(/Neighbourhood Circle/)).toBeTruthy()
  })
})
