// MobX Stores
import { AuthenticationStore } from './AuthenticationStore'
import { PoolManagementStore } from './PoolManagementStore'
import { RootStore } from './RootStore'
import { WalletConnectionStore } from './WalletConnectionStore'

export { AuthenticationStore, PoolManagementStore, RootStore, WalletConnectionStore }

// React Context and Hooks
export {
  rootStore,
  StoreProvider,
  useAuthenticationStore,
  usePoolManagementStore,
  useStore,
  useStores,
  useWalletConnectionStore,
} from './StoreContext'

// Configuration
export { configureMobX, mobxUtils } from './mobxConfig'

// Types
export type { LoadingStates, PoolFilters } from './PoolManagementStore'
export type { AtomicConnectionState, WalletConnectionState } from './WalletConnectionStore'

// Store instance types
export type StoreContextType = InstanceType<typeof RootStore>
export type AuthStoreType = InstanceType<typeof AuthenticationStore>
export type WalletStoreType = InstanceType<typeof WalletConnectionStore>
export type PoolStoreType = InstanceType<typeof PoolManagementStore>
