import * as Application from 'expo-application'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

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
