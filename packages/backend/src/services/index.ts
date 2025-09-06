import * as admin from 'firebase-admin'
import { initializeApp } from 'firebase-admin/app'
import { getAppCheck } from 'firebase-admin/app-check'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Use require() to safely import the JSON file.
const serviceAccountKey = require('../../service-account-key.json')

// Initialize the Firebase Admin SDK once for the entire server.
let adminApp
try {
  adminApp = admin.app()
} catch {
  adminApp = initializeApp({ credential: admin.credential.cert(serviceAccountKey) })
}

// Initialize and export auth, firestore & appCheck services
export const auth = getAuth(adminApp)
export const firestore = getFirestore(adminApp)
export const appCheck = getAppCheck(adminApp)

// Export services
export * from './ContractService'
export * from './deviceVerification'

// Export provider service
export { ProviderService } from './providerService'
