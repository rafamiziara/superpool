import { type App, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAppCheck } from 'firebase-admin/app-check'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Use require() to safely import the JSON file.
const serviceAccountKey = require('../../service-account-key.json')

/* Initialize the Firebase Admin SDK once for the entire server.
   firebase-admin 14 removed the `admin.*` namespace: `app()` and `credential` are the
   modular `firebase-admin/app` exports now, and `getApps()[0]` says "the default app, if
   one exists" without the throw/catch the namespace API needed to answer that. */
const adminApp: App = getApps()[0] ?? initializeApp({ credential: cert(serviceAccountKey) })

// Initialize and export auth, firestore & appCheck services
export const auth = getAuth(adminApp)
export const firestore = getFirestore(adminApp)
export const appCheck = getAppCheck(adminApp)
