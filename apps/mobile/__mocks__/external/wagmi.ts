/**
 * Wagmi Hook Mocks
 *
 * Consolidated Wagmi React hooks mocks extracted from setupTests.ts
 * Provides default mock implementations for wallet-related hooks
 */

export const useAccount = jest.fn(() => ({
  address: undefined,
  addresses: undefined,
  chain: undefined,
  chainId: undefined,
  connector: undefined,
  isConnected: false,
  isReconnecting: false,
  isConnecting: false,
  isDisconnected: true,
  status: 'disconnected' as const,
}))

export const useSignMessage = jest.fn(() => ({
  signMessage: jest.fn().mockResolvedValue('0xmockedsignature'),
  signMessageAsync: jest.fn().mockResolvedValue('0xmockedsignature'),
  data: undefined,
  error: null,
  isLoading: false,
  isError: false,
  isSuccess: false,
}))

export const useSignTypedData = jest.fn(() => ({
  signTypedData: jest.fn().mockResolvedValue('0xmockedsignature'),
  signTypedDataAsync: jest.fn().mockResolvedValue('0xmockedsignature'),
  data: undefined,
  error: null,
  isLoading: false,
  isError: false,
  isSuccess: false,
}))

export const useDisconnect = jest.fn(() => ({
  disconnect: jest.fn().mockResolvedValue(undefined),
  disconnectAsync: jest.fn().mockResolvedValue(undefined),
  error: null,
  isLoading: false,
  isError: false,
  isSuccess: false,
}))

// Default export with all hooks
export default {
  useAccount,
  useSignMessage,
  useSignTypedData,
  useDisconnect,
}
