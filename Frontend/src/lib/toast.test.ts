import { describe, expect, it } from 'vitest'
import { ApiError } from '@/services/api-error'
import { fieldErrorSummary } from './toast'

const validation = (messages: [string, string][]) =>
  new ApiError(422, 'validation_error', 'Some fields are invalid.', { fieldErrors: messages.map(([field, message]) => ({ field, message })) })

describe('fieldErrorSummary', () => {
  it('lists at most three field messages, then a count', () => {
    const error = validation([
      ['a', 'First problem.'],
      ['b', 'Second problem.'],
      ['c', 'Third problem.'],
      ['d', 'Fourth problem.'],
      ['e', 'Fifth problem.'],
    ])
    expect(fieldErrorSummary(error)).toBe('First problem; Second problem; Third problem; and 2 more.')
  })

  it('skips fields the caller already shows and ignores errors without field messages', () => {
    const error = validation([
      ['comment', 'Comment is required.'],
      ['decisions.0', 'Target field is already mapped.'],
    ])
    expect(fieldErrorSummary(error, ['comment'])).toBe('Target field is already mapped.')
    expect(fieldErrorSummary(error, ['comment', 'decisions.0'])).toBeNull()
    expect(fieldErrorSummary(new ApiError(409, 'conflict', 'Already applied.'))).toBeNull()
    expect(fieldErrorSummary(new Error('Network down'))).toBeNull()
  })
})
