import type { PlatformAdapter } from '../types'

export const desktopPlatform: PlatformAdapter = {
  kind: 'desktop',
  capabilities: {
    windowControls: true,
    screenshot: true,
    childWindow: 'native',
    websocketStateEvents: true
  }
}
