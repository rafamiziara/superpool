/* istanbul ignore file */
import * as dotenv from 'dotenv'
import { setGlobalOptions } from 'firebase-functions'

dotenv.config()
setGlobalOptions({ maxInstances: 10 })

export { customAppCheckMinter, generateAuthMessage, verifySignatureAndLogin } from './functions'
