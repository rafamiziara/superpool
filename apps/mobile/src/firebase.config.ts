// apps/mobile-app/src/firebase.config.ts

import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

// Firebase Project Configuration
const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
  measurementId: 'YOUR_MEASUREMENT_ID',
}

// Initialize Firebase App
const FIREBASE_APP = initializeApp(firebaseConfig)

// Initialize Firebase Services
export const FIREBASE_AUTH = getAuth(FIREBASE_APP)
export const FIREBASE_FIRESTORE = getFirestore(FIREBASE_APP)
export const FIREBASE_FUNCTIONS = getFunctions(FIREBASE_APP)

// --- Connect to Emulators in Development ---

if (__DEV__) {
  console.log('Connecting to Firebase Emulators...')

  connectAuthEmulator(FIREBASE_AUTH, 'http://localhost:9099')
  connectFirestoreEmulator(FIREBASE_FIRESTORE, 'localhost', 8080)
  connectFunctionsEmulator(FIREBASE_FUNCTIONS, 'localhost', 5001)
}
