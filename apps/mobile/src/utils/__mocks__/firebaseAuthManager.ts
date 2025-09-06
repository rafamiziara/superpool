export const firebaseAuthManager = {
  getCurrentState: jest.fn(() => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    walletAddress: null,
  })),
  addListener: jest.fn((callback) => {
    callback({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      walletAddress: null,
    })
    return jest.fn() // cleanup function
  }),
  signOut: jest.fn(),
}
