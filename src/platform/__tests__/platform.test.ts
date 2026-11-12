import { describe, expect, it, vi } from 'vitest'
import { getPlatform } from '@/platform'
import { isMobile } from '@/utils/PlatformConstants'
import { desktopPlatform } from '../desktop'
import { mobilePlatform } from '../mobile'
import { getPlatform as getWebPlatform } from '../web/adapter'

vi.mock('@/utils/PlatformConstants', () => ({ isMobile: vi.fn() }))

describe('platform adapters', () => {
  it('provides browser capabilities without native window controls', () => {
    expect(getWebPlatform()).toEqual({
      kind: 'web',
      capabilities: {
        windowControls: false,
        screenshot: false,
        childWindow: 'dialog',
        websocketStateEvents: true
      }
    })
  })

  it('preserves desktop capabilities', () => {
    expect(desktopPlatform).toEqual({
      kind: 'desktop',
      capabilities: {
        windowControls: true,
        screenshot: true,
        childWindow: 'native',
        websocketStateEvents: true
      }
    })
  })

  it('preserves mobile capabilities', () => {
    expect(mobilePlatform).toEqual({
      kind: 'mobile',
      capabilities: {
        windowControls: false,
        screenshot: false,
        childWindow: 'none',
        websocketStateEvents: true
      }
    })
  })

  it('resolves the Tauri adapter through the public entry and detects the platform at call time', () => {
    vi.mocked(isMobile).mockReturnValue(false)
    expect(getPlatform()).toBe(desktopPlatform)

    vi.mocked(isMobile).mockReturnValue(true)
    expect(getPlatform()).toBe(mobilePlatform)

    vi.mocked(isMobile).mockReturnValue(false)
    expect(getPlatform()).toBe(desktopPlatform)
  })
})
