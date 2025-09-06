/* istanbul ignore file */
import * as dotenv from 'dotenv'
import { setGlobalOptions } from 'firebase-functions'

dotenv.config()
setGlobalOptions({ maxInstances: 10 })

export {
  customAppCheckMinter,
  generateAuthMessage,
  verifySignatureAndLogin,
  createPool,
  poolStatus,
  listPools,
  createPoolSafe,
  signSafeTransaction,
  executeSafeTransaction,
  listSafeTransactions,
  proposeTransaction,
  proposeContractCall,
  proposeBatch,
  addSignature,
  executeTransaction,
  getTransactionStatus,
  listTransactions,
  emergencyPause,
  syncPoolEvents,
  processPoolEvents,
  syncHistoricalEvents,
  estimateSyncProgress,
} from './functions'
