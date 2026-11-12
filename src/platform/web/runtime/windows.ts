/**
 * Registry of open windows (pages and hosted iframes) so getByLabel() can tell whether a window exists, plus the
 * open/close behaviour that replaces native windows.
 */
import { getHost } from '../windowHost/host'
import { onControl, postControl } from './bus'
import { LABEL, PAGE_WINDOWS } from './label'

const REGISTRY_KEY = '__web_windows'
const HEARTBEAT_MS = 3000
const STALE_MS = 10000

type Registry = Record<string, number>
const registrations = new Map<string, () => void>()

function readRegistry(): Registry {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeRegistry(update: (r: Registry) => void) {
  const registry = readRegistry()
  update(registry)
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
  } catch {}
}

/** Labels of the pages and hosted windows that are open now. */
export function openLabels(): string[] {
  const now = Date.now()
  const labels = Object.entries(readRegistry())
    .filter(([, seen]) => now - seen < STALE_MS)
    .map(([label]) => label)
  if (!labels.includes(LABEL)) labels.push(LABEL)
  return labels
}

export function windowExists(label: string) {
  return label === LABEL || openLabels().includes(label)
}

/** Removes a registration immediately, even when iframe removal does not emit pagehide. */
export function unregisterWindow(label: string) {
  registrations.get(label)?.()
  registrations.delete(label)
  writeRegistry((registry) => {
    delete registry[label]
  })
}

export function registerWindow(label: string = LABEL) {
  registrations.get(label)?.()
  const beat = () =>
    writeRegistry((registry) => {
      registry[label] = Date.now()
    })
  beat()
  const heartbeat = setInterval(beat, HEARTBEAT_MS)
  const onPageHide = () => unregisterWindow(label)
  window.addEventListener('pagehide', onPageHide)
  registrations.set(label, () => {
    clearInterval(heartbeat)
    window.removeEventListener('pagehide', onPageHide)
  })
}

/** Returns `location.origin + path` for a same-origin app path; anything else falls back to the origin root. */
export function sameOriginUrl(raw: string): string {
  try {
    const url = new URL(raw, location.origin)
    if (url.origin !== location.origin) return location.origin + '/'
    return location.origin + url.pathname + url.search + url.hash
  } catch {
    return location.origin + '/'
  }
}

export interface OpenWindowOptions {
  title?: string
  width?: number
  height?: number
  modal?: boolean
}

/** Main windows replace the current page; secondary windows live in the top-level host. */
export function openWindow(label: string, url?: string, options: OpenWindowOptions = {}) {
  const target = url || `/${label}`
  if (label === LABEL) return
  if (PAGE_WINDOWS.has(label)) {
    window.name = label
    setTimeout(() => location.assign(sameOriginUrl(target)), 50)
    return
  }
  return getHost().open({
    label,
    url: target,
    title: options.title ?? label,
    width: options.width ?? 800,
    height: options.height ?? 600,
    modal: options.modal ?? false
  })
}

/** Hosted windows close through the host; legacy secondary tabs still close themselves. */
export function closeWindow(label: string = LABEL) {
  if (window.top !== window && label === LABEL) {
    getHost().close(label)
    return
  }
  if (label !== LABEL) {
    getHost().close(label)
    postControl('closeWindow', label)
    return
  }
  if (!PAGE_WINDOWS.has(LABEL)) setTimeout(() => window.close(), 50)
}

export function focusWindow(label: string) {
  if (label !== LABEL) {
    getHost().focus(label)
    postControl('focusWindow', label)
  } else window.focus()
}

onControl('closeWindow', (label) => {
  if (label === LABEL) closeWindow()
})
onControl('focusWindow', (label) => {
  if (label === LABEL) window.focus()
})
