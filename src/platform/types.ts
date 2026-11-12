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
  readonly windows: WindowService
}

/** A secondary window as seen by the code that opened it. */
export interface WindowHandle {
  readonly label: string
  onCloseRequested(handler: (event: unknown) => void): Promise<() => void>
  setFocus(): Promise<void>
  close(): Promise<void>
}

export interface OpenWindowOptions {
  /** Normalized window label */
  label: string
  /** App route with query string, e.g. `/settings` or `/multiMsg?x=1` */
  url: string
  title: string
  width: number
  height: number
  minWidth: number
  minHeight: number
  resizable: boolean
  transparent?: boolean
  visible: boolean
  /** Label of a window to close once the new one is created */
  closeAfterCreated?: string
}

export interface OpenModalWindowOptions {
  label: string
  title: string
  width: number
  height: number
  minWidth: number
  minHeight: number
  /** Label of the parent window, which is blocked while the modal is open */
  parent: string
  /** Sent to the new window through push_window_payload */
  payload?: Record<string, any>
}

export interface WindowService {
  open(options: OpenWindowOptions): Promise<WindowHandle | null>
  openModal(options: OpenModalWindowOptions): Promise<WindowHandle | null>
}
