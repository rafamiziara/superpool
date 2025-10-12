import * as dotenv from 'dotenv'
import { setGlobalOptions } from 'firebase-functions'

dotenv.config()
setGlobalOptions({ maxInstances: 10 })

export { customAppCheckMinter, generateAuthMessage, listPools, verifySignatureAndLogin } from './functions'
