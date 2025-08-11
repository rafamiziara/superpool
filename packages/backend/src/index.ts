import * as dotenv from 'dotenv'
import { setGlobalOptions } from 'firebase-functions'

dotenv.config()
setGlobalOptions({ maxInstances: 10 })

export { customAppCheckMinter } from './customAppCheckMinter'
export { generateAuthMessage } from './generateAuthMessage'
export { verifySignatureAndLogin } from './verifySignatureAndLogin'
