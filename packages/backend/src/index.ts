import * as dotenv from 'dotenv'
import { setGlobalOptions } from 'firebase-functions'

dotenv.config()
setGlobalOptions({ maxInstances: 10 })

// Production functions
export { customAppCheckMinter, generateAuthMessage, listPools, preparePoolCreation, verifySignatureAndLogin } from './functions'

// Dev-only functions (emulator only)
// In production, this will be undefined and won't be deployed
const isDev = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development'

if (isDev) {
  const devFunctions = require('./functions')
  exports.signMessageForTesting = devFunctions.signMessageForTesting
}
