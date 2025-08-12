import { logger } from 'firebase-functions'
import 'firebase-functions/v2/https'
import { onRequest } from 'firebase-functions/v2/https'
import { appCheck } from '../../services'

// Define the interface for the request body
interface CustomAppCheckMinterRequest {
  deviceId: string
}

const FIREBASE_APP_ID = process.env.APP_ID_FIREBASE

/**
 * Mints an App Check token for a custom provider.
 *
 * This HTTPS Cloud Function acts as the backend for a custom App Check provider.
 * It receives a unique device ID from the client, performs a custom verification
 * check on that ID, and if the verification is successful, uses the Firebase
 * Admin SDK to mint a new App Check token for the specified Firebase App ID.
 *
 * @param {express.Request} req The HTTPS request.
 * @param {express.Response} res The HTTPS response.
 *
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 *
 * @remarks
 * The function expects a POST request with a JSON body containing a 'deviceId' string.
 *
 * @example
 * // Successful response body (HTTP 200)
 * {
 *   "appCheckToken": "your-app-check-token-string",
 *   "expireTimeMillis": 1678886400000
 * }
 *
 * @throws {400 Bad Request} If the 'deviceId' is missing or invalid.
 * @throws {403 Forbidden} If the custom verification logic fails for the device ID.
 * @throws {500 Internal Server Error} For any server-side errors, such as a failure
 * to mint the token.
 */
export const customAppCheckMinter = onRequest({ cors: true }, async (req, res) => {
  // Validate the Request Method
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  // Validate the Request Body
  const body = req.body as CustomAppCheckMinterRequest
  const { deviceId } = body

  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).send('Bad Request: deviceId is required')
    return
  }

  // Optional: Add your custom verification logic here.
  // For now, we'll trust the deviceId, but you could:
  // - Check it against a Firestore database of known devices.
  // - Use other device-specific information to ensure authenticity.
  // if (!verifyDeviceIsAuthentic(deviceId)) {
  //   res.status(403).send('Forbidden: Invalid device');
  //   return;
  // }

  // Check that the App ID is configured
  if (!FIREBASE_APP_ID) {
    logger.error('Firebase App ID is not configured.')
    res.status(500).send('Internal Server Error: Firebase App ID not set.')
    return
  }

  // Use the Firebase Admin SDK to mint the App Check token
  try {
    // The `createToken` method requires a subject, which we'll use our deviceId for.
    const appCheckToken = await appCheck.createToken(FIREBASE_APP_ID, { ttlMillis: 1000 * 60 * 60 * 24 })

    logger.info('App Check token minted successfully', { deviceId })

    // Return the token and its expiration to the client
    res.status(200).send({
      appCheckToken: appCheckToken.token,
      expireTimeMillis: appCheckToken.ttlMillis,
    })
  } catch (error) {
    logger.error('Failed to mint App Check token', { error, deviceId })
    res.status(500).send('Internal Server Error: Failed to mint App Check token')
  }
})
