export interface AtomicConnectionState {
  isConnected: boolean
  address: string | undefined
  chainId: number | undefined
  timestamp: number
  sequenceNumber: number
}

export class ConnectionStateManager {
  private sequenceCounter = 0

  /**
   * Captures the current connection state as an atomic snapshot
   */
  captureState(isConnected: boolean, address: string | undefined, chainId: number | undefined): AtomicConnectionState {
    const sequenceNumber = ++this.sequenceCounter
    return {
      isConnected,
      address,
      chainId,
      timestamp: Date.now(),
      sequenceNumber,
    }
  }

  /**
   * Validates that the connection state hasn't changed since the locked state
   */
  validateState(lockedState: AtomicConnectionState, currentState: AtomicConnectionState, checkPoint: string): boolean {
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

  /**
   * Validates initial connection state for authentication
   */
  validateInitialState(state: AtomicConnectionState, walletAddress: string): { isValid: boolean; error?: string } {
    if (!state.isConnected || !state.address) {
      return {
        isValid: false,
        error: 'Wallet connection state invalid',
      }
    }

    if (state.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return {
        isValid: false,
        error: 'Wallet address mismatch',
      }
    }

    if (!state.chainId) {
      return {
        isValid: false,
        error: 'ChainId not found',
      }
    }

    return { isValid: true }
  }

  /**
   * Resets the sequence counter (useful for testing)
   */
  resetSequence(): void {
    this.sequenceCounter = 0
  }
}

// Singleton instance
export const connectionStateManager = new ConnectionStateManager()
