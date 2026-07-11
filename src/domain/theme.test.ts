import { describe, expect, it } from 'vitest'
import { normalizeAppAccentTheme } from './theme'

describe('app accent theme', () => {
  it('falls back to blue gray for unknown persisted values', () => {
    expect(normalizeAppAccentTheme('violet')).toBe('violet')
    expect(normalizeAppAccentTheme('unknown')).toBe('blue_gray')
  })
})
