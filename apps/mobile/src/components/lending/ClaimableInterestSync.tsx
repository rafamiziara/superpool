import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { SampleLendingPoolABI } from '../../constants/abis'
import { poolStore } from '../../stores/PoolStore'

/**
 * One pool's `claimable`, read and mirrored into the store.
 *
 * A component per pool rather than one loop, because `useReadContract` is a
 * hook and the set of pools changes between renders. Rendering nothing is the
 * point: this exists to answer a question, not to show one.
 */
function ClaimableProbe({ poolId, poolAddress }: { poolId: number; poolAddress: `0x${string}` }) {
  const { address } = useAccount()

  const { data: claimable } = useReadContract({
    address: poolAddress,
    abi: SampleLendingPoolABI,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  useEffect(() => {
    if (claimable === undefined) return

    poolStore.setClaimable(poolId, claimable)
  }, [claimable, poolId])

  return null
}

/**
 * Fills `PoolStore.claimableByPool` for every pool the user has a position in.
 *
 * Lifetime earnings are what has been claimed plus what is still claimable, and
 * only the first half comes from Firestore. Accrual is a consequence of *other*
 * people's repayments and emits nothing naming the member it credits, so there
 * is no event to index and no way to derive it — the chain has to be asked, per
 * pool, per wallet.
 *
 * Mounted by the dashboard, which is where the all-time figure is shown. A pool
 * whose page the user has opened is already covered by `ClaimInterestCard`; this
 * is what makes the total right without visiting each one.
 */
function ClaimableInterestSyncComponent() {
  return (
    <>
      {poolStore.activeMemberships.map((member) => {
        const pool = poolStore.poolById(Number(member.poolId))
        if (!pool?.poolAddress) return null

        return <ClaimableProbe key={member.poolId} poolId={pool.poolId} poolAddress={pool.poolAddress as `0x${string}`} />
      })}
    </>
  )
}

export const ClaimableInterestSync = observer(ClaimableInterestSyncComponent)
