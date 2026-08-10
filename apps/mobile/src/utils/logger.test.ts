import { logger } from './logger'

/** `__DEV__` is a global const in React Native, so it is set through globalThis. */
function setDev(value: boolean): void {
  ;(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = value
}

describe('logger', () => {
  let logSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    setDev(true)
  })

  it('passes every argument through, as console does', () => {
    logger.debug('🚀 Auto-authenticating for:', '0xabc', { step: 3 })

    expect(logSpy).toHaveBeenCalledWith('🚀 Auto-authenticating for:', '0xabc', { step: 3 })
  })

  it('drops debug traces outside development', () => {
    setDev(false)

    logger.debug('🚀 Auto-authenticating for:', '0xabc')

    expect(logSpy).not.toHaveBeenCalled()
  })

  it('keeps warnings and errors in a release build — they report real failures', () => {
    setDev(false)

    logger.warn('Failed to persist pending transactions:', new Error('disk full'))
    logger.error('Navigation failed:', new Error('no route'))

    expect(warnSpy).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })
})
