declare global {
  var __DEV__: boolean

  interface GlobalThis {
    __DEV__: boolean
  }
}

export {}
