import { describe, expect, it } from 'vitest'
import { inMobileSafariTab } from './standalone'

describe('inMobileSafariTab', () => {
  it('is true only in an iPhone/iPad Safari tab', () => {
    expect(inMobileSafariTab({ standalone: false, maxTouchPoints: 5 })).toBe(true) // iPhone, iPad
    expect(inMobileSafariTab({ standalone: true, maxTouchPoints: 5 })).toBe(false) // home-screen app
    expect(inMobileSafariTab({ standalone: false, maxTouchPoints: 0 })).toBe(false) // macOS Safari
    expect(inMobileSafariTab({ maxTouchPoints: 0 })).toBe(false) // Chrome, Firefox
  })
})
