/* istanbul ignore file */
// apps/mobile-app/src/firebase.config.ts

import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage'
import { initializeApp } from 'firebase/app'
import { initializeAppCheck } from 'firebase/app-check'
import { connectAuthEmulator, getReactNativePersistence, initializeAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { customAppCheckProviderFactory } from './utils/appCheckProvider'

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

// Initialize App Check with the custom provider
initializeAppCheck(FIREBASE_APP, {
  provider: customAppCheckProviderFactory(),
})

// Initialize Firebase Auth with AsyncStorage persistence
export const FIREBASE_AUTH = initializeAuth(FIREBASE_APP, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
})
export const FIREBASE_FIRESTORE = getFirestore(FIREBASE_APP)
export const FIREBASE_FUNCTIONS = getFunctions(FIREBASE_APP)

// --- Connect to Emulators in Development ---
if (__DEV__) {
  console.log('Connecting to Firebase Emulators...')

  const ngrokAuthUrl = process.env.EXPO_PUBLIC_NGROK_URL_AUTH
  const ngrokFirestoreUrl = process.env.EXPO_PUBLIC_NGROK_URL_FIRESTORE
  const ngrokFunctionsUrl = process.env.EXPO_PUBLIC_NGROK_URL_FUNCTIONS

  if (ngrokAuthUrl) connectAuthEmulator(FIREBASE_AUTH, ngrokAuthUrl)
  if (ngrokFirestoreUrl) connectFirestoreEmulator(FIREBASE_FIRESTORE, ngrokFirestoreUrl, 80)
  if (ngrokFunctionsUrl) connectFunctionsEmulator(FIREBASE_FUNCTIONS, ngrokFunctionsUrl, 80)
}
