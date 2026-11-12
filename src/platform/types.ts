export type PlatformKind = 'desktop' | 'mobile' | 'web'

/** What the current platform can do; business code checks these instead of the platform kind. */
export interface PlatformCapabilities {
  /** Window control buttons drawn by the app (always-on-top, minimize, maximize, close) and the macOS traffic lights */
  windowControls: boolean
  /** Screenshot tool in the chat input bar */
  screenshot: boolean
  /** How secondary windows (settings, about, chat history...) are shown */
  childWindow: 'native' | 'dialog' | 'none'
  /** The connection state of the chat WebSocket is reported through the `websocket-event` event */
  websocketStateEvents: boolean
}

export interface PlatformAdapter {
  readonly kind: PlatformKind
  readonly capabilities: PlatformCapabilities
}
