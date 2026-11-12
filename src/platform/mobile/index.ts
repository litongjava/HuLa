import type { PlatformAdapter } from '../types'

export const mobilePlatform: PlatformAdapter = {
  kind: 'mobile',
  capabilities: {
    windowControls: false,
    screenshot: false,
    childWindow: 'none',
    websocketStateEvents: true
  }
}
