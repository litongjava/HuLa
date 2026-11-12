import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { onControl } from '../runtime/bus'
import { closeWindow, focusWindow, openWindow, windowExists } from '../runtime/windows'
import { LogicalSize, PhysicalSize } from '../tauri/api/dpi'
import { WebviewWindow } from '../tauri/api/webviewWindow'
import { notifyWindowDestroyed, windowFor } from '../tauri/api/window'
import { mountWindowHost } from '../windowHost'
import {
  closeHosted,
  focusHosted,
  getHost,
  hostedWindows,
  openHosted,
  resizeHosted,
  TITLE_BAR_HEIGHT
} from '../windowHost/host'
import { webWindows } from '../windows'

const channels = vi.hoisted(() => {
  const all: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: ReturnType<typeof vi.fn> }[] = []
  return { all }
})

vi.hoisted(() => {
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null
      postMessage = vi.fn()
      constructor() {
        channels.all.push(this)
      }
    }
  )
})

const options = (label: string) => ({ label, url: '/settings', title: label, width: 320, height: 240, modal: false })

beforeEach(() => {
  // Keep iframe DOM and URL assertions without loading the app over the network in happy-dom.
  vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (
    this: HTMLIFrameElement,
    src: string
  ) {
    this.srcdoc = '<!doctype html><html><body></body></html>'
    this.setAttribute('src', src)
  })
  vi.useFakeTimers()
  vi.stubGlobal('innerWidth', 1200)
  vi.stubGlobal('innerHeight', 900)
  localStorage.clear()
})

afterEach(async () => {
  for (const win of [...hostedWindows]) closeHosted(win.label)
  await nextTick()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('hosted window state and lifecycle', () => {
  it('opens once per label and raises the existing window on duplicate opens', () => {
    expect(openHosted(options('first'))).toBe(true)
    expect(openHosted(options('second'))).toBe(true)
    expect(hostedWindows[1].z).toBe(hostedWindows[0].z + 1)
    expect(hostedWindows[1].x).toBe(hostedWindows[0].x + 24)
    expect(hostedWindows[1].y).toBe(hostedWindows[0].y + 24)
    expect(openHosted(options('first'))).toBe(false)
    expect(hostedWindows).toHaveLength(2)
    expect(hostedWindows[0].z).toBeGreaterThan(hostedWindows[1].z)
    expect(windowExists('first')).toBe(true)
  })

  it('clamps content dimensions including title bar space and sanitizes iframe URLs', () => {
    openHosted({ ...options('large'), url: '/settings?a=1#profile', width: 5000, height: 5000 })
    expect(hostedWindows[0]).toMatchObject({
      width: innerWidth - 32,
      height: innerHeight - 32 - TITLE_BAR_HEIGHT,
      src: location.origin + '/settings?a=1#profile'
    })
    openHosted({ ...options('unsafe'), url: 'javascript:alert(1)' })
    expect(hostedWindows[1].src).toBe(location.origin + '/')
    expect(hostedWindows[1].x + hostedWindows[1].width).toBeLessThanOrEqual(innerWidth)
    expect(hostedWindows[1].y + hostedWindows[1].height + TITLE_BAR_HEIGHT).toBeLessThanOrEqual(innerHeight)
  })

  it('notifies local handles and other contexts and removes registration without pagehide', async () => {
    openHosted(options('closing'))
    const win = windowFor('closing')
    const requested = vi.fn()
    const destroyed = vi.fn()
    await win.onCloseRequested(requested)
    await win.once('tauri://destroyed', destroyed)
    closeHosted('closing')
    expect(hostedWindows).toHaveLength(0)
    expect(windowExists('closing')).toBe(false)
    expect(requested).toHaveBeenCalledOnce()
    expect(destroyed).toHaveBeenCalledOnce()
    expect(channels.all[0].postMessage).toHaveBeenCalledWith({ control: 'windowDestroyed', data: 'closing' })
    vi.advanceTimersByTime(12000)
    expect(windowExists('closing')).toBe(false)
    closeHosted('closing')
    expect(requested).toHaveBeenCalledOnce()
  })

  it('exposes destruction handling and receives cross-context notifications', async () => {
    const local = vi.fn()
    const remote = vi.fn()
    await windowFor('local').onCloseRequested(local)
    await windowFor('remote').once('tauri://destroyed', remote)
    notifyWindowDestroyed('local')
    channels.all[0].onmessage?.({ data: { control: 'windowDestroyed', data: 'remote' } })
    expect(local).toHaveBeenCalledOnce()
    expect(remote).toHaveBeenCalledOnce()
  })

  it('preserves created and destroyed events on directly constructed handles', async () => {
    const win = new WebviewWindow('constructed', { ...options('constructed'), modal: true })
    const created = vi.fn()
    const destroyed = vi.fn()
    await win.once('tauri://created', created)
    await win.once('tauri://destroyed', destroyed)
    await vi.advanceTimersByTimeAsync(0)
    expect(created).toHaveBeenCalledOnce()
    expect(await WebviewWindow.getByLabel(win.label)).toBe(win)
    expect(hostedWindows[0].modal).toBe(true)
    await win.close()
    expect(destroyed).toHaveBeenCalledOnce()
  })

  it('resizes logical and physical sizes and leaves page windows alone', async () => {
    openHosted(options('resizing'))
    const win = windowFor('resizing')
    await win.setSize(new LogicalSize(400, 300))
    expect(hostedWindows[0]).toMatchObject({ width: 400, height: 300 })
    vi.stubGlobal('devicePixelRatio', 2)
    await win.setSize(new PhysicalSize(1000, 800))
    expect(hostedWindows[0]).toMatchObject({ width: 500, height: 400 })
    resizeHosted('resizing', 5000, 5000)
    expect(hostedWindows[0].height).toBe(innerHeight - 32 - TITLE_BAR_HEIGHT)
    await windowFor('missing').setSize(new LogicalSize(1, 1))
    expect(hostedWindows).toHaveLength(1)
  })

  it('routes runtime operations to the host and retains legacy control messages', () => {
    openWindow('runtime', '/settings', { title: 'Runtime', width: 400, height: 300, modal: true })
    openWindow('other', '/settings')
    expect(hostedWindows[0]).toMatchObject({ title: 'Runtime', width: 400, height: 300, modal: true })
    focusWindow('runtime')
    expect(hostedWindows[0].z).toBeGreaterThan(hostedWindows[1].z)
    closeWindow('runtime')
    expect(windowExists('runtime')).toBe(false)
    expect(channels.all[0].postMessage).toHaveBeenCalledWith({ control: 'closeWindow', data: 'runtime' })
    expect(channels.all[0].postMessage).toHaveBeenCalledWith({ control: 'focusWindow', data: 'runtime' })
  })

  it('passes the modal flag through the window service and focuses an existing modal', async () => {
    const win = await webWindows.openModal({
      ...options('modal-service'),
      parent: 'login',
      minWidth: 200,
      minHeight: 200
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(hostedWindows[0].modal).toBe(true)
    const existing = await webWindows.openModal({
      ...options('modal-service'),
      parent: 'login',
      minWidth: 200,
      minHeight: 200
    })
    expect(existing).toBe(win)
    expect(hostedWindows).toHaveLength(1)
  })
})

describe('control subscriptions', () => {
  it('supports independent subscribers and unsubscribe functions', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = onControl('shared', first)
    const stopSecond = onControl('shared', second)
    const receive = () => channels.all[0].onmessage?.({ data: { control: 'shared', data: 'label' } })
    receive()
    stopFirst()
    receive()
    stopSecond()
    receive()
    expect(first).toHaveBeenCalledExactlyOnceWith('label')
    expect(second).toHaveBeenCalledTimes(2)
    const later = vi.fn()
    const stopLater = onControl('shared', later)
    stopFirst()
    receive()
    expect(later).toHaveBeenCalledExactlyOnceWith('label')
    stopLater()
  })
})

describe('host UI', () => {
  it('mounts once, renders named iframes and modal backdrops, and closes through its title bar', async () => {
    mountWindowHost()
    mountWindowHost()
    expect(document.querySelectorAll('#web-window-host')).toHaveLength(1)
    expect(window.__WEB_WINDOW_HOST__).toBe(getHost())
    openHosted({ ...options('ui-modal'), modal: true })
    openHosted(options('ui-other'))
    await nextTick()
    const frame = document.querySelector<HTMLIFrameElement>('iframe[name="ui-modal"]')!
    expect(frame.src).toBe(location.origin + '/settings')
    const backdrop = document.querySelector<HTMLElement>('.web-window-backdrop')!
    expect(Number(backdrop.style.zIndex)).toBe(hostedWindows[0].z - 1)
    backdrop.click()
    expect(hostedWindows).toHaveLength(2)
    focusHosted('ui-modal')
    await nextTick()
    expect(document.querySelector('iframe[name="ui-modal"]')).toBe(frame)
    const close = frame.parentElement!.querySelector<HTMLButtonElement>('button')!
    close.click()
    await nextTick()
    expect(document.querySelector('iframe[name="ui-modal"]')).toBeNull()
    expect(windowExists('ui-modal')).toBe(false)
  })
})
