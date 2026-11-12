import type { WindowService } from '../types'
import { invoke } from './tauri/api/core'
import { WebviewWindow } from './tauri/api/webviewWindow'

export const webWindows: WindowService = {
  async open(options) {
    const win = new WebviewWindow(options.label, {
      url: options.url,
      title: options.title,
      width: options.width,
      height: options.height,
      modal: false
    })
    await win.once('tauri://created', async () => {
      if (options.closeAfterCreated) {
        const previousWindow = await WebviewWindow.getByLabel(options.closeAfterCreated)
        previousWindow?.close()
      }
    })
    return win
  },
  async openModal(options) {
    const existingWindow = await WebviewWindow.getByLabel(options.label)
    if (existingWindow) {
      await existingWindow.setFocus()
      return existingWindow
    }

    const win = new WebviewWindow(options.label, {
      url: `/${options.label}`,
      title: options.title,
      width: options.width,
      height: options.height,
      modal: true
    })
    await win.once('tauri://created', async () => {
      if (options.payload) {
        await invoke('push_window_payload', { label: options.label, payload: options.payload })
      }
    })
    return win
  }
}
