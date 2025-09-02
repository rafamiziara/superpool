/* istanbul ignore file */
// MobX Stores
import { AuthenticationStore } from './AuthenticationStore'
import { PoolManagementStore } from './PoolManagementStore'
import { RootStore } from './RootStore'
import { UIStore } from './UIStore'
import { WalletStore } from './WalletStore'

export { AuthenticationStore, PoolManagementStore, RootStore, UIStore, WalletStore }

// React Context and Hooks
export {
  rootStore,
  StoreProvider,
  useAuthenticationStore,
  usePoolManagementStore,
  useStore,
  useStores,
  useUIStore,
  useWalletStore,
} from './StoreContext'

// Configuration
export { configureMobX, mobxUtils } from './mobxConfig'

// Types
export type { LoadingStates, PoolFilters } from './PoolManagementStore'
export type { AtomicConnectionState, WalletState } from './WalletStore'

// Store instance types
export type StoreContextType = InstanceType<typeof RootStore>
export type AuthStoreType = InstanceType<typeof AuthenticationStore>
export type WalletStoreType = InstanceType<typeof WalletStore>
export type PoolStoreType = InstanceType<typeof PoolManagementStore>
export type UIStoreType = InstanceType<typeof UIStore>
