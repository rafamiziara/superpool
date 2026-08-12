import * as dotenv from 'dotenv'
import { setGlobalOptions } from 'firebase-functions'

dotenv.config()
setGlobalOptions({ maxInstances: 10 })

// Production functions.
//
// Named explicitly rather than `export *`: this list is what Firebase deploys,
// so a function added to `./functions` and not added here exists in the build,
// passes every test, and is simply never served. Add both.
export {
  customAppCheckMinter,
  generateAuthMessage,
  indexContribution,
  indexLoan,
  indexMembership,
  indexPool,
  indexWithdrawal,
  listContributions,
  listLoans,
  listMembers,
  listPools,
  listWithdrawals,
  preparePoolCreation,
  syncPoolEvents,
  syncPoolEventsNow,
  verifySignatureAndLogin,
} from './functions'

// Dev-only functions (emulator only)
// In production, this will be undefined and won't be deployed
const isDev = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development'

if (isDev) {
  const devFunctions = require('./functions')
  exports.signMessageForTesting = devFunctions.signMessageForTesting
}
