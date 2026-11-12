import { invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { UserAttentionType, primaryMonitor, type Monitor } from '@tauri-apps/api/window'
import { info } from '@tauri-apps/plugin-log'
import { assign } from 'es-toolkit/compat'
import { computed, nextTick } from 'vue'
import { isCompatibility, isMac, isWindows, isWindows10 } from '@/utils/PlatformConstants'
import type { WindowService } from '../types'

/** 判断是兼容的系统 */
const isCompatibilityMode = computed(() => isCompatibility())
const WINDOW_SAFE_PADDING = 32
const MIN_LOGICAL_WIDTH = 320
const MIN_LOGICAL_HEIGHT = 200
const MAC_TRAFFIC_LIGHTS_SPACING = 6

export const clampSizeToMonitor = (width: number, height: number, monitor?: Monitor | null) => {
  if (!monitor) {
    return { width, height }
  }

  const scaleFactor = monitor.scaleFactor ?? 1
  const maxLogicalWidth = Math.max(MIN_LOGICAL_WIDTH, monitor.size.width / scaleFactor - WINDOW_SAFE_PADDING)
  const maxLogicalHeight = Math.max(MIN_LOGICAL_HEIGHT, monitor.size.height / scaleFactor - WINDOW_SAFE_PADDING)

  return {
    width: Math.min(width, Math.floor(maxLogicalWidth)),
    height: Math.min(height, Math.floor(maxLogicalHeight))
  }
}

// Mac 端用于模拟父窗口禁用态的透明蒙层
const MAC_MODAL_OVERLAY_ID = 'mac-modal-overlay'
// 记录当前已经打开模态窗口的 label，方便在最后一个关闭时移除蒙层
const activeMacModalLabels = new Set<string>()

// 创建或复用蒙层 DOM
const ensureMacOverlayElement = () => {
  if (typeof document === 'undefined') return
  if (document.getElementById(MAC_MODAL_OVERLAY_ID)) return
  const overlay = document.createElement('div')
  overlay.id = MAC_MODAL_OVERLAY_ID
  assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    backgroundColor: 'transparent',
    pointerEvents: 'auto',
    width: '100vw',
    height: '100vh',
    userSelect: 'none',
    cursor: 'not-allowed'
  })
  const mountPoint = document.body ?? document.documentElement
  mountPoint?.appendChild(overlay)
}

// 移除蒙层
const removeMacOverlayElement = () => {
  if (typeof document === 'undefined') return
  document.getElementById(MAC_MODAL_OVERLAY_ID)?.remove()
}

// 记录当前窗口并展示蒙层
const attachMacModalOverlay = (label: string) => {
  if (!isMac()) return
  activeMacModalLabels.add(label)
  ensureMacOverlayElement()
}

// 解除当前窗口的蒙层记录，如果没有其他窗口则移除蒙层
const detachMacModalOverlay = (label: string) => {
  if (!isMac()) return
  activeMacModalLabels.delete(label)
  if (activeMacModalLabels.size === 0) {
    removeMacOverlayElement()
  }
}

export const focusExistingWindow = async (L: string) => {
  const isExistsWinds = await WebviewWindow.getByLabel(L)
  if (isExistsWinds) {
    nextTick().then(async () => {
      // 如果窗口已存在，首先检查是否最小化了
      const minimized = await isExistsWinds.isMinimized()
      // 检查是否是隐藏
      const hidden = await isExistsWinds.isVisible()
      if (!hidden) {
        await isExistsWinds.show()
      }
      if (minimized) {
        // 如果已最小化，恢复窗口
        await isExistsWinds.unminimize()
      }
      // 如果窗口已存在，则给它焦点，使其在最前面显示
      await isExistsWinds.setFocus()
    })
  }
}

export const desktopWindows: WindowService = {
  async open({
    label,
    url,
    title,
    width,
    height,
    minWidth,
    minHeight,
    resizable,
    transparent,
    visible,
    closeAfterCreated
  }) {
    const monitor = await primaryMonitor()
    const clampedSize = clampSizeToMonitor(width, height, monitor)
    const clampedMinWidth = Math.min(minWidth, clampedSize.width)
    const clampedMinHeight = Math.min(minHeight, clampedSize.height)

    const webview = new WebviewWindow(label, {
      title: title,
      url: url,
      fullscreen: false,
      resizable: resizable,
      center: true,
      width: clampedSize.width,
      height: clampedSize.height,
      minHeight: clampedMinHeight,
      minWidth: clampedMinWidth,
      skipTaskbar: false,
      decorations: !isCompatibilityMode.value,
      transparent: transparent || isCompatibilityMode.value,
      titleBarStyle: 'overlay', // mac覆盖标签栏
      hiddenTitle: true, // mac隐藏标题栏
      visible: visible,
      dragDropEnabled: true, // 启用文件拖放
      ...(isWindows10() ? { shadow: false } : {})
    })

    await webview.once('tauri://created', async () => {
      if (isMac()) {
        try {
          await invoke('set_macos_traffic_lights_spacing', {
            windowLabel: label,
            spacing: MAC_TRAFFIC_LIGHTS_SPACING
          })
        } catch {}
      }
      if (closeAfterCreated) {
        const win = await WebviewWindow.getByLabel(closeAfterCreated)
        win?.close()
      }
    })

    await webview.once('tauri://error', async () => {
      info('窗口创建失败')
      // TODO 这里利用错误处理的方式来查询是否是已经创建了窗口,如果一开始就使用WebviewWindow.getByLabel来查询在刷新的时候就会出现问题 (nyh -> 2024-03-06 23:54:17)
      await focusExistingWindow(label)
    })

    return webview
  },
  async openModal({ label, title, width, height, minWidth, minHeight, parent, payload }) {
    // 检查窗口是否已存在
    const existingWindow = await WebviewWindow.getByLabel(label)
    const parentWindow = parent ? await WebviewWindow.getByLabel(parent) : null

    if (existingWindow) {
      if (isMac()) {
        attachMacModalOverlay(label)
      }
      // 如果窗口已存在，则聚焦到现有窗口并使其闪烁
      existingWindow.requestUserAttention(UserAttentionType.Critical)
      return existingWindow
    }

    // 创建新窗口
    const monitor = await primaryMonitor()
    const clampedSize = clampSizeToMonitor(width, height, monitor)
    const clampedMinWidth = Math.min(minWidth, clampedSize.width)
    const clampedMinHeight = Math.min(minHeight, clampedSize.height)

    const modalWindow = new WebviewWindow(label, {
      url: `/${label}`,
      title: title,
      width: clampedSize.width,
      height: clampedSize.height,
      resizable: false,
      center: true,
      minWidth: clampedMinWidth,
      minHeight: clampedMinHeight,
      focus: true,
      minimizable: false,
      parent: parentWindow ? parentWindow : parent,
      decorations: !isCompatibilityMode.value,
      transparent: isCompatibilityMode.value,
      titleBarStyle: 'overlay', // mac覆盖标签栏
      hiddenTitle: true, // mac隐藏标题栏
      visible: false,
      dragDropEnabled: true, // 启用文件拖放
      ...(isWindows10() ? { shadow: false } : {})
    })

    // 监听窗口创建完成事件
    modalWindow.once('tauri://created', async () => {
      if (isWindows()) {
        // 禁用父窗口，模拟模态窗口效果
        await parentWindow?.setEnabled(false)
      }

      // 如果有 payload，发送到子窗口
      if (payload) {
        console.log('新窗口的载荷：', payload)
        await invoke('push_window_payload', { label, payload })
      }

      // 设置窗口为焦点
      await modalWindow.setFocus()

      if (isMac()) {
        try {
          await invoke('set_window_movable', {
            windowLabel: label,
            movable: false
          })
        } catch (error) {
          console.error('设置子窗口不可拖动失败:', error)
        }
        try {
          await invoke('set_macos_traffic_lights_spacing', {
            windowLabel: label,
            spacing: MAC_TRAFFIC_LIGHTS_SPACING
          })
        } catch {}
        attachMacModalOverlay(label)
      }
    })

    // 监听错误事件
    modalWindow.once('tauri://error', async (e) => {
      console.error(`${title}窗口创建失败:`, e)
      window.$message?.error(`创建${title}窗口失败`)
      await parentWindow?.setEnabled(true)
    })

    void modalWindow.once('tauri://destroyed', async () => {
      if (isMac()) {
        detachMacModalOverlay(label)
      }
      if (isWindows()) {
        try {
          await parentWindow?.setEnabled(true)
        } catch (error) {
          console.error('重新启用父窗口失败:', error)
        }
      }
    })

    return modalWindow
  }
}
