// apps/mobile/src/utils/appCheckProvider.ts

import * as Application from 'expo-application'
import * as SecureStore from 'expo-secure-store'
import { AppCheckToken, CustomProvider } from 'firebase/app-check'
import { Platform } from 'react-native'
import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

const APP_CHECK_MINTER_URL = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL + 'customAppCheckMinter'

// A helper function to get a unique ID that is persistent across app updates
const getUniqueDeviceId = async (): Promise<string | null> => {
  if (Platform.OS === 'android') {
    return Application.getAndroidId()
  }

  if (Platform.OS === 'ios') {
    return Application.getIosIdForVendorAsync()
  }

  // Fallback for web: use a UUID stored in SecureStore
  let webId = await SecureStore.getItemAsync('web_device_id')

  if (!webId) {
    webId = uuidv4()
    await SecureStore.setItemAsync('web_device_id', webId)
  }

  return webId
}

export const customAppCheckProviderFactory = (): CustomProvider => {
  const provider = new CustomProvider({
    getToken: async (): Promise<AppCheckToken> => {
      try {
        const uniqueDeviceId = await getUniqueDeviceId()

        if (!uniqueDeviceId) {
          throw new Error('Could not get a unique device ID.')
        }

        const body = JSON.stringify({ deviceId: uniqueDeviceId })

        const response = await fetch(APP_CHECK_MINTER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch App Check token: ${response.statusText}`)
        }

        const data = await response.json()

        return {
          token: data.appCheckToken,
          expireTimeMillis: data.expireTimeMillis,
        }
      } catch (error) {
        console.error('Error fetching App Check token:', error)
        throw error
      }
    },
  })

  return provider
}
