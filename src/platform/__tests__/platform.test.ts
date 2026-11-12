import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatform } from '@/platform'
import { isMobile } from '@/utils/PlatformConstants'
import { desktopPlatform } from '../desktop'
import { desktopWindows } from '../desktop/windows'
import { mobilePlatform } from '../mobile'
import { getPlatform as getWebPlatform } from '../web/adapter'
import { getCurrentWebviewWindow } from '../web/tauri/api/webviewWindow'
import { WebWindow } from '../web/tauri/api/window'
import { closeHosted, hostedWindows } from '../web/windowHost/host'
import { webWindows } from '../web/windows'

vi.mock('@/utils/PlatformConstants', () => ({ isMobile: vi.fn() }))

describe('platform adapters', () => {
  it('provides browser capabilities without native window controls', () => {
    expect(getWebPlatform()).toEqual({
      kind: 'web',
      windows: webWindows,
      capabilities: {
        windowControls: false,
        screenshot: false,
        childWindow: 'dialog',
        websocketStateEvents: true
      }
    })
  })

  it('preserves desktop capabilities', () => {
    expect(desktopPlatform).toEqual({
      kind: 'desktop',
      windows: desktopWindows,
      capabilities: {
        windowControls: true,
        screenshot: true,
        childWindow: 'native',
        websocketStateEvents: true
      }
    })
  })

  it('preserves mobile capabilities', () => {
    expect(mobilePlatform).toEqual({
      kind: 'mobile',
      windows: mobilePlatform.windows,
      capabilities: {
        windowControls: false,
        screenshot: false,
        childWindow: 'none',
        websocketStateEvents: true
      }
    })
  })

  it('resolves the Tauri adapter through the public entry and detects the platform at call time', () => {
    vi.mocked(isMobile).mockReturnValue(false)
    expect(getPlatform()).toBe(desktopPlatform)

    vi.mocked(isMobile).mockReturnValue(true)
    expect(getPlatform()).toBe(mobilePlatform)

    vi.mocked(isMobile).mockReturnValue(false)
    expect(getPlatform()).toBe(desktopPlatform)
  })
})

describe('platform window services', () => {
  const openOptions = {
    label: 'settings',
    url: '/settings',
    title: 'Settings',
    width: 840,
    height: 840,
    minWidth: 840,
    minHeight: 600,
    resizable: true,
    visible: false
  }
  const modalOptions = {
    label: 'modal-serviceAgreement',
    title: 'Service agreement',
    width: 600,
    height: 600,
    minWidth: 500,
    minHeight: 500,
    parent: 'login'
  }

  beforeEach(() => {
    // Keep iframe DOM and URL assertions without loading the app over the network in happy-dom.
    vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (
      this: HTMLIFrameElement,
      src: string
    ) {
      this.srcdoc = '<!doctype html><html><body></body></html>'
      this.setAttribute('src', src)
    })
  })

  afterEach(() => {
    for (const win of [...hostedWindows]) closeHosted(win.label)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns null when opening a mobile child window', async () => {
    await expect(mobilePlatform.windows.open(openOptions)).resolves.toBeNull()
  })

  it('returns null when opening a mobile modal window', async () => {
    await expect(mobilePlatform.windows.openModal(modalOptions)).resolves.toBeNull()
  })

  it('returns a browser window handle and hosts the requested route', async () => {
    vi.useFakeTimers()
    const win = await webWindows.open(openOptions)
    expect(win?.label).toBe('settings')
    expect(hostedWindows).toContainEqual(
      expect.objectContaining({ label: 'settings', src: location.origin + '/settings', modal: false })
    )
    await vi.runOnlyPendingTimersAsync()
  })

  it('closes the requested window only after the browser window is created', async () => {
    vi.useFakeTimers()
    const close = vi.spyOn(WebWindow.prototype, 'close').mockResolvedValue()
    const previousWindow = getCurrentWebviewWindow()

    await webWindows.open({ ...openOptions, closeAfterCreated: previousWindow.label })
    expect(close).not.toHaveBeenCalled()
    await vi.runOnlyPendingTimersAsync()
    expect(close).toHaveBeenCalledOnce()
    expect(close.mock.instances[0]).toBe(previousWindow)
  })

  it('focuses an existing browser modal without opening another tab', async () => {
    const existingWindow = getCurrentWebviewWindow()
    const focus = vi.spyOn(existingWindow, 'setFocus').mockResolvedValue()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    const win = await webWindows.openModal({ ...modalOptions, label: existingWindow.label })
    expect(win).toBe(existingWindow)
    expect(focus).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
  })
})
