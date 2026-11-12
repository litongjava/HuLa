import type { PlatformAdapter } from '../types'

export const webPlatform: PlatformAdapter = {
  kind: 'web',
  capabilities: {
    windowControls: false,
    screenshot: false,
    childWindow: 'dialog',
    websocketStateEvents: true
  }
}

export const getPlatform = (): PlatformAdapter => webPlatform
