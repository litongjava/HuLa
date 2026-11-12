import type { PlatformAdapter } from '../types'

export const mobilePlatform: PlatformAdapter = {
  kind: 'mobile',
  windows: {
    open: () => Promise.resolve(null),
    openModal: () => Promise.resolve(null)
  },
  capabilities: {
    windowControls: false,
    screenshot: false,
    childWindow: 'none',
    websocketStateEvents: true
  }
}
