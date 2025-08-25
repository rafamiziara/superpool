import { useMemo } from 'react'
import { createWalletConnectionBridge } from '../services/walletConnectionBridge'
import { useWalletConnectionStore } from '../stores'

/**
 * Bridge hook that provides reactive wallet connection state via MobX
 * while maintaining compatibility with existing connection state validation
 *
 * This hook replaces direct usage of connectionStateManager singleton with:
 * 1. Reactive MobX store integration for automatic UI updates
 * 2. Atomic state validation and sequence tracking (unchanged)
 * 3. Bridge service for gradual migration from singleton pattern
 * 4. Enhanced debugging and state management capabilities
 *
 * Migration Benefits:
 * - Components automatically re-render when wallet state changes
 * - Centralized wallet state management
 * - Maintains all existing atomic state validation
 * - Better debugging with MobX DevTools
 * - Foundation for advanced wallet features
 */
export const useWalletConnectionBridge = () => {
  const walletStore = useWalletConnectionStore()

  // Create bridge instance (memoized for stability)
  const bridge = useMemo(() => {
    return createWalletConnectionBridge(walletStore)
  }, [walletStore])

  // Return reactive wallet state and bridge methods
  return useMemo(
    () => ({
      // Reactive wallet connection state (automatically triggers re-renders)
      isConnected: walletStore.isConnected,
      address: walletStore.address,
      chainId: walletStore.chainId,
      isConnecting: walletStore.isConnecting,
      connectionError: walletStore.connectionError,

      // Computed state
      isWalletConnected: walletStore.isWalletConnected,
      currentState: walletStore.currentState,

      // Store actions for reactive state management
      connect: walletStore.connect,
      disconnect: walletStore.disconnect,
      setConnecting: walletStore.setConnecting,
      setConnectionError: walletStore.setConnectionError,
      setConnectionState: walletStore.setConnectionState,
      updateConnectionState: walletStore.updateConnectionState,

      // Bridge methods for atomic state validation (maintains existing behavior)
      captureState: bridge.captureState.bind(bridge),
      validateState: bridge.validateState.bind(bridge),
      validateInitialState: bridge.validateInitialState.bind(bridge),
      getCurrentState: bridge.getCurrentState.bind(bridge),
      resetSequence: bridge.resetSequence.bind(bridge),
      reset: bridge.reset.bind(bridge),

      // Access to store and bridge for advanced usage
      walletStore,
      bridge,

      // Debug utilities
      debugStateSync: bridge.debugStateSync.bind(bridge),

      // Debug state comparison
      _debug: {
        storeState: {
          isConnected: walletStore.isConnected,
          address: walletStore.address,
          chainId: walletStore.chainId,
          isConnecting: walletStore.isConnecting,
          connectionError: walletStore.connectionError,
        },
        bridgeSync: bridge.debugStateSync(),
      },
    }),
    [
      // Reactive dependencies (MobX store observables)
      walletStore.isConnected,
      walletStore.address,
      walletStore.chainId,
      walletStore.isConnecting,
      walletStore.connectionError,
      walletStore,
      bridge,
    ]
  )
}

/**
 * Lightweight hook that provides only reactive wallet connection state
 * Use this when you only need to observe wallet state without actions
 */
export const useWalletConnectionState = () => {
  const walletStore = useWalletConnectionStore()

  return useMemo(
    () => ({
      // Reactive state only
      isConnected: walletStore.isConnected,
      address: walletStore.address,
      chainId: walletStore.chainId,
      isConnecting: walletStore.isConnecting,
      connectionError: walletStore.connectionError,
      isWalletConnected: walletStore.isWalletConnected,
      currentState: walletStore.currentState,
    }),
    [
      walletStore.isConnected,
      walletStore.address,
      walletStore.chainId,
      walletStore.isConnecting,
      walletStore.connectionError,
      walletStore.isWalletConnected,
    ]
  )
}

/**
 * Type definitions for the bridge hooks
 */
export type WalletConnectionBridgeHook = ReturnType<typeof useWalletConnectionBridge>
export type WalletConnectionStateHook = ReturnType<typeof useWalletConnectionState>
