import { reactive } from 'vue'
import { postControl } from '../runtime/bus'
import { registerWindow, sameOriginUrl, unregisterWindow } from '../runtime/windows'
import { notifyWindowDestroyed } from '../tauri/api/window'

export interface HostedWindow {
  label: string
  /** Same-origin URL produced by sameOriginUrl(). */
  src: string
  title: string
  width: number
  height: number
  /** Modal windows block the page behind them with a backdrop. */
  modal: boolean
  z: number
  x: number
  y: number
}

export type HostedWindowOptions = Pick<HostedWindow, 'label' | 'title' | 'width' | 'height' | 'modal'> & {
  url: string
}

export interface WebWindowHost {
  open: typeof openHosted
  close: typeof closeHosted
  focus: typeof focusHosted
  resize: typeof resizeHosted
}

declare global {
  interface Window {
    __WEB_WINDOW_HOST__?: WebWindowHost
  }
}

export const TITLE_BAR_HEIGHT = 36
export const hostedWindows = reactive<HostedWindow[]>([])

function nextZ() {
  return Math.max(1000, ...hostedWindows.map((win) => win.z)) + 1
}

function dimensions(width: number, height: number) {
  return {
    width: Math.max(0, Math.min(Number.isFinite(width) ? width : 800, window.innerWidth - 32)),
    // Height describes the iframe content; reserve space for the host title bar as well.
    height: Math.max(0, Math.min(Number.isFinite(height) ? height : 600, window.innerHeight - 32 - TITLE_BAR_HEIGHT))
  }
}

export function constrainPosition(win: HostedWindow) {
  win.x = Math.max(0, Math.min(win.x, window.innerWidth - win.width))
  win.y = Math.max(0, Math.min(win.y, window.innerHeight - win.height - TITLE_BAR_HEIGHT))
}

export function openHosted(options: HostedWindowOptions): boolean {
  if (hostedWindows.some((win) => win.label === options.label)) {
    focusHosted(options.label)
    return false
  }
  const { width, height } = dimensions(options.width, options.height)
  const previous = hostedWindows.at(-1)
  const win: HostedWindow = {
    label: options.label,
    src: sameOriginUrl(options.url),
    title: options.title,
    width,
    height,
    modal: options.modal,
    z: nextZ(),
    x: previous ? previous.x + 24 : (window.innerWidth - width) / 2,
    y: previous ? previous.y + 24 : (window.innerHeight - height - TITLE_BAR_HEIGHT) / 2
  }
  constrainPosition(win)
  hostedWindows.push(win)
  // Register before iframe startup so immediate getByLabel() and duplicate opens are reliable.
  registerWindow(win.label)
  return true
}

export function closeHosted(label: string) {
  const index = hostedWindows.findIndex((win) => win.label === label)
  if (index === -1) return
  hostedWindows.splice(index, 1)
  unregisterWindow(label)
  postControl('windowDestroyed', label)
  notifyWindowDestroyed(label)
}

export function focusHosted(label: string) {
  const win = hostedWindows.find((win) => win.label === label)
  if (win) win.z = nextZ()
}

export function resizeHosted(label: string, width: number, height: number) {
  const win = hostedWindows.find((win) => win.label === label)
  if (!win) return
  Object.assign(win, dimensions(width, height))
  constrainPosition(win)
}

const host: WebWindowHost = { open: openHosted, close: closeHosted, focus: focusHosted, resize: resizeHosted }

export function getHost(): WebWindowHost {
  try {
    if (window.top?.__WEB_WINDOW_HOST__) return window.top.__WEB_WINDOW_HOST__
  } catch {
    // An embedding page may be cross-origin; use this context's host instead.
  }
  return (window.__WEB_WINDOW_HOST__ ??= host)
}
