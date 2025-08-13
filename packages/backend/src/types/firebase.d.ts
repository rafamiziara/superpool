/* istanbul ignore file */

/**
 * A mock type for the Firestore `set` method.
 * It simulates the function signature, expecting data to be written to a document
 * and returning a Promise that resolves with a WriteResult.
 */
type SetFunctionFirestore = (
  data: FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>
) => Promise<FirebaseFirestore.WriteResult>

/**
 * A mock type for the Firestore `get` method.
 * It simulates the function signature, returning a Promise that resolves
 * with a DocumentSnapshot.
 */
type GetFunctionFirestore = () => Promise<FirebaseFirestore.DocumentSnapshot>

/**
 * A mock type for the Firestore `update` method.
 * It simulates the function signature, expecting data to update
 * and returning a Promise that resolves with a WriteResult.
 */
type UpdateFunctionFirestore = (
  data: { [x: string]: any } & FirebaseFirestore.AddPrefixToKeys<string, any>,
  precondition?: FirebaseFirestore.Precondition
) => Promise<FirebaseFirestore.WriteResult>

/**
 * A mock type for the Firestore `delete` method.
 * It simulates the function signature, returning a Promise that resolves
 * with a WriteResult upon successful deletion.
 */
type DeleteFunctionFirestore = () => Promise<FirebaseFirestore.WriteResult>

/**
 * A mock type for the Firebase Auth `createCustomToken` method.
 * It simulates the function signature, expecting a UID and returning a
 * Promise that resolves with the custom token as a string.
 */
type CreateCustomTokenFunction = (uid: string, developerClaims?: object | undefined) => Promise<string>
