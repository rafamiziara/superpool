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
  indexInterestClaim,
  indexLoan,
  indexMembership,
  indexPool,
  indexWithdrawal,
  listBorrowerHistories,
  listContributions,
  listInterestClaims,
  listLoanRepayments,
  listLoans,
  listMembers,
  listNotes,
  listPools,
  listWithdrawals,
  preparePoolCreation,
  registerPushToken,
  saveNote,
  sendDueReminders,
  sendDueRemindersNow,
  syncPoolEvents,
  syncPoolEventsNow,
  unregisterPushToken,
  verifySignatureAndLogin,
} from './functions'

// Dev-only functions (emulator only)
// In production, this will be undefined and won't be deployed
const isDev = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'development'

if (isDev) {
  const devFunctions = require('./functions')
  exports.signMessageForTesting = devFunctions.signMessageForTesting
  // The agent-service seam probe. Dev-only for the same reason the signer is:
  // nothing in production asks it, and an endpoint that reports what
  // infrastructure exists is a free thing for a stranger to learn.
  exports.pingAgentService = devFunctions.pingAgentService
}
