import type { PlatformAdapter } from '../types'
import { webWindows } from './windows'

export const webPlatform: PlatformAdapter = {
  kind: 'web',
  windows: webWindows,
  capabilities: {
    windowControls: false,
    screenshot: false,
    childWindow: 'dialog',
    websocketStateEvents: true
  }
}

export const getPlatform = (): PlatformAdapter => webPlatform
