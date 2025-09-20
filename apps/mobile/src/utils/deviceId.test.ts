import { getUniqueDeviceId } from './deviceId'

describe('getUniqueDeviceId', () => {
  it('should return a non-null string', async () => {
    const result = await getUniqueDeviceId()

    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result!.length).toBeGreaterThan(0)
  })

  it('should handle multiple calls', async () => {
    const result1 = await getUniqueDeviceId()
    const result2 = await getUniqueDeviceId()

    expect(typeof result1).toBe('string')
    expect(typeof result2).toBe('string')
    expect(result1!.length).toBeGreaterThan(0)
    expect(result2!.length).toBeGreaterThan(0)
  })

  it('should not return null or undefined', async () => {
    const result = await getUniqueDeviceId()

    expect(result).not.toBeNull()
    expect(result).not.toBeUndefined()
  })
})
