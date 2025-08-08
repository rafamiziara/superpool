import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize the Firebase Admin SDK once for the entire server.
const adminApp = initializeApp()

// Initialize and export auth and firestore services
export const auth = getAuth(adminApp)
export const firestore = getFirestore(adminApp)
