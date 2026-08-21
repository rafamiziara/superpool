import { FontAwesome } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { useAccount } from 'wagmi'
import { DiscoverPoolCard } from '../../../../src/components/lending/DiscoverPoolCard'
import { NetworkBadge } from '../../../../src/components/lending/NetworkBadge'
import { DEFAULT_CHAIN_ID } from '../../../../src/config/contracts'
import { palette } from '../../../../src/constants/palette'
import { poolStore } from '../../../../src/stores/PoolStore'
import { chainName } from '../../../../src/utils/explorer'
import { filterPools, POOL_SORT_LABELS, POOL_SORT_MODES, type PoolSortMode, sortPools } from '../../../../src/utils/poolSearch'

/**
 * Pools the user is not in yet, searchable.
 *
 * Its own tab rather than a section of Pools because until now the join flow
 * had no entry point at all: `pool/join` is reachable only from `pool/[id]`,
 * and that was reachable only from a list which excluded every pool worth
 * joining. Someone could be invited to a pool and had no way to find it.
 *
 * Search is in two halves, and both are needed. The backend narrows the whole
 * chain on the query's most selective word — Firestore allows one
 * `array-contains` per query — and `filterPools` then applies every term to
 * what came back. The server answer is a superset of a full match, never a
 * subset, which is what makes filtering on top of it correct rather than
 * merely convenient.
 *
 * The cached page stays in the candidates, so the first characters filter what
 * is already on the device while the query is still in flight. Nothing here
 * blocks on the network.
 */
function DiscoverScreen() {
  const { chainId } = useAccount()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<PoolSortMode>('newest')

  const activeChainId = chainId ?? DEFAULT_CHAIN_ID
  const isSearching = query.trim().length > 0
  const pools = isSearching ? poolStore.discoverableMatches : poolStore.discoverablePools

  /*
    Debounced, because this is a callable and the box is typed into.

    300ms is long enough that a word costs one request rather than seven, and
    short enough that the results arrive while the user is still looking at the
    box. The local filter has already narrowed the cached page by then, so the
    wait is never a blank screen.
  */
  useEffect(() => {
    const term = query.trim()

    if (!term) {
      poolStore.clearPoolSearch()

      return
    }

    const timer = setTimeout(() => void poolStore.searchPools(term), 300)

    return () => clearTimeout(timer)
  }, [query])

  /**
   * Sorted after filtering, not before: the comparators run over the smaller
   * list that way, and `liquidity` derives a figure per pool from the event
   * lists, which is the expensive one to run over pools about to be dropped.
   */
  const results = useMemo(() => sortPools(filterPools(pools, query), sort, poolStore.poolLiquidity), [pools, query, sort])

  /**
   * Same sweep-then-reload as the Pools tab. It matters more here: this list is
   * mostly other people's pools, so what it is missing is precisely the events
   * this device never had a reason to index.
   */
  const handleRefresh = useCallback(async () => {
    await poolStore.syncAndRefresh()
  }, [])

  if (poolStore.isLoading && pools.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss" testID="discover-loading">
        <StatusBar style="light" />
        <ActivityIndicator colorClassName="accent-mint" />
        <Text className="text-sm text-fog">Looking for circles</Text>
      </View>
    )
  }

  // Only when there is nothing cached to show. With pools on screen the same
  // failure is the banner below — see the Pools tab for the reasoning.
  if (poolStore.hasError && pools.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="discover-error">
        <StatusBar style="light" />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-coral-deep">
          <FontAwesome name="exclamation" size={20} color={palette.coral} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">Could not load circles</Text>
        <Text className="text-center text-sm text-fog">{poolStore.error}</Text>
        <Pressable onPress={() => poolStore.fetchPools()} className="mt-2 active:opacity-70" testID="discover-error-retry">
          <Text className="font-semibold text-mint">Try again</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-abyss" testID="discover-screen">
      <StatusBar style="light" />

      <ScrollView
        testID="discover-scroll"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-8 pt-4"
        refreshControl={<RefreshControl refreshing={poolStore.isRefreshing} onRefresh={handleRefresh} tintColor={palette.fog} />}
      >
        <View className="px-6">
          <View className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3 focus-within:border-mint">
            <FontAwesome name="search" size={14} color={palette.mist} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or purpose"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="discover-search"
              placeholderTextColorClassName="accent-mist"
              selectionColorClassName="accent-mint"
              cursorColorClassName="accent-mint"
              className="flex-1 text-base text-snow"
            />
            {isSearching && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" testID="discover-search-clear">
                <FontAwesome name="times-circle" size={14} color={palette.mist} />
              </Pressable>
            )}
          </View>
        </View>

        {/*
          Horizontal so the row never wraps and never pushes the results down a
          line as labels change length.
        */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-2 px-6"
          className="mt-4 grow-0"
        >
          {POOL_SORT_MODES.map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setSort(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === mode }}
              testID={`discover-sort-${mode}`}
              className={
                sort === mode
                  ? 'rounded-full border-continuous border-hairline border-mint bg-mint-deep px-4 py-2 active:opacity-70'
                  : 'rounded-full border-continuous border-hairline border-veil bg-surface px-4 py-2 active:opacity-70'
              }
            >
              <Text className={sort === mode ? 'text-xs font-semibold text-mint' : 'text-xs font-semibold text-fog'}>
                {POOL_SORT_LABELS[mode]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View className="mt-5 gap-4 px-6">
          {poolStore.hasError && (
            <View
              className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
              testID="discover-error-banner"
            >
              <Text className="text-sm text-coral">{poolStore.error}</Text>
            </View>
          )}

          {/* Kept when the list is empty, for the same reason as the Pools tab. */}
          <View className="flex-row items-center gap-3">
            {results.length > 0 && (
              <Text className="text-sm text-fog" testID="discover-count">
                {results.length === 1 ? '1 circle' : `${results.length} circles`}
                {isSearching ? ' found' : ' you have not joined'}
              </Text>
            )}
            <View className="ml-auto">
              <NetworkBadge chainId={activeChainId} testID="discover-network" />
            </View>
          </View>

          {results.map((pool) => (
            <DiscoverPoolCard key={pool.poolId} pool={pool} onPress={() => router.push(`/(auth)/pool/${pool.poolId}`)} />
          ))}

          {/*
            Two different nothings. "Your search found none" is a dead end the
            user can back out of, so it offers that; "there are none" is the
            state of the chain, and suggesting a search would be nonsense.
          */}
          {/*
            A search still in flight is not "nothing matches". Saying so before
            the answer arrives tells the user their pool does not exist, and
            then contradicts itself a moment later.
          */}
          {results.length === 0 && isSearching && poolStore.isSearchingPools && (
            <View className="items-center gap-3 py-10" testID="discover-searching">
              <ActivityIndicator colorClassName="accent-mint" />
              <Text className="text-sm text-fog">Looking across the network</Text>
            </View>
          )}

          {results.length === 0 &&
            !poolStore.isSearchingPools &&
            (isSearching ? (
              <View className="items-center gap-2 py-10" testID="discover-no-results">
                <Text className="text-base font-semibold text-snow">Nothing matches “{query.trim()}”</Text>
                <Text className="text-center text-sm text-fog">
                  Nothing on {chainName(activeChainId)} goes by that. Try a shorter search, or one word instead of several.
                </Text>
                <Pressable onPress={() => setQuery('')} className="mt-2 active:opacity-70" testID="discover-clear-search">
                  <Text className="font-semibold text-mint">Clear search</Text>
                </Pressable>
              </View>
            ) : (
              <View className="items-center gap-2 py-10" testID="discover-empty">
                <Text className="text-base font-semibold text-snow">No other circles on {chainName(activeChainId)}</Text>
                <Text className="text-center text-sm text-fog">
                  You are in every pool on this network. Pull down to check for new ones, start your own, or switch networks in your wallet.
                </Text>
                <Pressable onPress={() => router.push('/(auth)/pool/create')} className="mt-2 active:opacity-70" testID="discover-create">
                  <Text className="font-semibold text-mint">Start a new pool</Text>
                </Pressable>
              </View>
            ))}
        </View>
      </ScrollView>
    </View>
  )
}

export default observer(DiscoverScreen)
