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
  listSafeTransactions
} from './functions'
