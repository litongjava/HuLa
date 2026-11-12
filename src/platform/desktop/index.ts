import type { PlatformAdapter } from '../types'
import { desktopWindows } from './windows'

export const desktopPlatform: PlatformAdapter = {
  kind: 'desktop',
  windows: desktopWindows,
  capabilities: {
    windowControls: true,
    screenshot: true,
    childWindow: 'native',
    websocketStateEvents: true
  }
}
