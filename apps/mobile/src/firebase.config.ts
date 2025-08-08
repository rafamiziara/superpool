// apps/mobile-app/src/firebase.config.ts

import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

// Firebase Project Configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
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
  connectAuthEmulator(FIREBASE_AUTH, process.env.EXPO_PUBLIC_NGROK_URL_AUTH)
  connectFirestoreEmulator(FIREBASE_FIRESTORE, process.env.EXPO_PUBLIC_NGROK_URL_FIRESTORE, 80)
  connectFunctionsEmulator(FIREBASE_FUNCTIONS, process.env.EXPO_PUBLIC_NGROK_URL_FUNCTIONS, 80)
}
