import { describe, expect, it } from 'vitest'
import { describeCron, presetForCron, validateCron } from './cron'

describe('cron utilities', () => {
  it('validates and describes expressions', () => {
    const result = validateCron('0 */6 * * *', 'Asia/Kolkata')
    expect(result.valid).toBe(true)
    expect(result.nextRuns).toHaveLength(5)
    expect(result.minIntervalMinutes).toBe(360)
    expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes')
  })

  it('rejects malformed expressions', () => {
    expect(validateCron('0 2 * *').valid).toBe(false)
    expect(validateCron('99 2 * * *').valid).toBe(false)
    expect(validateCron('').error).toMatch(/Enter/)
  })

  it('names the field that is out of range', () => {
    expect(validateCron('99 * * * *').error).toBe('Minute must be between 0 and 59 (got 99).')
    expect(validateCron('0 25 * * *').error).toBe('Hour must be between 0 and 23 (got 25).')
  })

  it('maps presets', () => {
    expect(presetForCron('0 * * * *')).toBe('hourly')
    expect(presetForCron('5 4 * * 2')).toBe('custom')
  })
})
