import { makeAutoObservable } from 'mobx'

export interface AtomicConnectionState {
  isConnected: boolean
  address: string | undefined
  chainId: number | undefined
  timestamp: number
  sequenceNumber: number
}

export interface WalletState {
  isConnected: boolean
  address: string | undefined
  chainId: number | undefined
  isConnecting: boolean
  connectionError: string | null
}

/**
 * MobX store for managing wallet state
 * Reactive store pattern for wallet connection, address, and chain tracking
 */
export class WalletStore {
  // Observable state
  isConnected = false
  address: string | undefined = undefined
  chainId: number | undefined = undefined
  isConnecting = false
  connectionError: string | null = null

  // Internal sequence tracking
  private sequenceCounter = 0

  constructor() {
    makeAutoObservable(this)
  }

  // Computed getters
  get isWalletConnected(): boolean {
    return this.isConnected && !!this.address
  }

  get currentState(): WalletState {
    return {
      isConnected: this.isConnected,
      address: this.address,
      chainId: this.chainId,
      isConnecting: this.isConnecting,
      connectionError: this.connectionError,
    }
  }

  // Actions
  setConnectionState = (state: Partial<WalletState>): void => {
    if (state.isConnected !== undefined) this.isConnected = state.isConnected
    if (state.address !== undefined) this.address = state.address
    if (state.chainId !== undefined) this.chainId = state.chainId
    if (state.isConnecting !== undefined) this.isConnecting = state.isConnecting
    if (state.connectionError !== undefined) this.connectionError = state.connectionError
  }

  setConnecting = (connecting: boolean): void => {
    this.isConnecting = connecting
    if (connecting) {
      this.connectionError = null
    }
  }

  setConnectionError = (error: string | null): void => {
    this.connectionError = error
    if (error) {
      this.isConnecting = false
    }
  }

  // Connect wallet action
  connect = async (address: string, chainId: number): Promise<void> => {
    this.setConnecting(true)
    this.sequenceCounter++

    try {
      this.address = address
      this.chainId = chainId
      this.isConnected = true
      this.connectionError = null
      console.log('🔗 Wallet connected:', { address, chainId })
    } catch (error) {
      this.connectionError = error instanceof Error ? error.message : 'Connection failed'
      this.isConnected = false
      throw error
    } finally {
      this.isConnecting = false
    }
  }

  // Disconnect wallet action
  disconnect = (): void => {
    this.isConnected = false
    this.address = undefined
    this.chainId = undefined
    this.isConnecting = false
    this.connectionError = null
    this.sequenceCounter++
    console.log('🔗❌ Wallet disconnected')
  }

  // Update connection state atomically
  updateConnectionState = (isConnected: boolean, address: string | undefined, chainId: number | undefined): AtomicConnectionState => {
    const sequenceNumber = ++this.sequenceCounter

    this.isConnected = isConnected
    this.address = address
    this.chainId = chainId

    return {
      isConnected,
      address,
      chainId,
      timestamp: Date.now(),
      sequenceNumber,
    }
  }

  // Capture current state as atomic snapshot
  captureState = (): AtomicConnectionState => {
    return {
      isConnected: this.isConnected,
      address: this.address,
      chainId: this.chainId,
      timestamp: Date.now(),
      sequenceNumber: this.sequenceCounter,
    }
  }

  // Validate connection state
  validateState = (lockedState: AtomicConnectionState, currentState: AtomicConnectionState, checkPoint: string): boolean => {
    const isValid =
      currentState.isConnected === lockedState.isConnected &&
      currentState.address === lockedState.address &&
      currentState.chainId === lockedState.chainId &&
      currentState.sequenceNumber >= lockedState.sequenceNumber

    if (!isValid) {
      console.log(`❌ Connection state changed at ${checkPoint}:`, {
        locked: lockedState,
        current: currentState,
        sequenceDrift: currentState.sequenceNumber - lockedState.sequenceNumber,
      })
    }

    return isValid
  }

  // Validate initial connection state
  validateInitialState = (walletAddress: string): { isValid: boolean; error?: string } => {
    if (!this.isConnected || !this.address) {
      return {
        isValid: false,
        error: 'Wallet connection state invalid',
      }
    }

    if (this.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return {
        isValid: false,
        error: 'Wallet address mismatch',
      }
    }

    if (!this.chainId) {
      return {
        isValid: false,
        error: 'ChainId not found',
      }
    }

    return { isValid: true }
  }

  // Reset sequence counter (useful for testing)
  resetSequence = (): void => {
    this.sequenceCounter = 0
  }

  // Reset all connection state
  reset = (): void => {
    this.disconnect()
    this.resetSequence()
  }
}
