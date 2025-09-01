import * as Application from 'expo-application'
import * as SecureStore from 'expo-secure-store'
import { AppCheckToken, CustomProvider } from 'firebase/app-check'
import { Platform } from 'react-native'
import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

const APP_CHECK_MINTER_URL = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL + 'customAppCheckMinter'

// A helper function to get a unique ID that is persistent across app updates
export const getUniqueDeviceId = async (): Promise<string | null> => {
  try {
    if (Platform.OS === 'android') {
      const androidId = Application.getAndroidId()
      if (!androidId) {
        return uuidv4()
      }
      return androidId
    }

    if (Platform.OS === 'ios') {
      const iosId = await Application.getIosIdForVendorAsync()
      if (!iosId) {
        return uuidv4()
      }
      return iosId
    }

    // Fallback for web and unknown platforms: use a UUID stored in SecureStore
    try {
      let webId = await SecureStore.getItemAsync('web_device_id')

      if (!webId) {
        webId = uuidv4()
        try {
          await SecureStore.setItemAsync('web_device_id', webId)
        } catch (storeError) {
          console.warn('Failed to store web device ID:', storeError)
          // Continue with the generated UUID even if storage fails
        }
      }

      return webId
    } catch (secureStoreError) {
      console.warn('SecureStore access failed, using fallback UUID:', secureStoreError)
      return uuidv4()
    }
  } catch (error) {
    console.warn('Device ID retrieval failed, using fallback UUID:', error)
    return uuidv4()
  }
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
        // Return a dummy token to allow Firebase operations to proceed
        // This will fail server-side validation but won't block client operations
        return {
          token: 'dummy-token-device-not-approved',
          expireTimeMillis: Date.now() + 60000, // 1 minute
        }
      }
    },
  })

  return provider
}
