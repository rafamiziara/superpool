import 'react-native-get-random-values'

import { AppCheckToken, CustomProvider } from 'firebase/app-check'
import { getUniqueDeviceId } from './deviceId'

const APP_CHECK_MINTER_URL = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL + 'customAppCheckMinter'

export const appCheckProvider = (): CustomProvider => {
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
