<template>
  <div v-for="win in hostedWindows" :key="win.label" class="web-window-layer" :style="{ zIndex: win.z }">
    <div v-if="win.modal" class="web-window-backdrop" :style="{ zIndex: win.z - 1 }"></div>
    <section
      class="web-window"
      role="dialog"
      :aria-label="win.title"
      :aria-modal="win.modal"
      :style="{
        left: `${win.x}px`,
        top: `${win.y}px`,
        width: `${win.width}px`,
        height: `${win.height + TITLE_BAR_HEIGHT}px`,
        zIndex: win.z
      }"
      @pointerdown="focusHosted(win.label)">
      <header
        class="web-window-titlebar"
        @pointerdown="startDrag($event, win)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @lostpointercapture="endDrag">
        <span class="web-window-title">{{ win.title }}</span>
        <button
          type="button"
          class="web-window-close"
          aria-label="关闭窗口"
          @pointerdown.stop="focusHosted(win.label)"
          @click="closeHosted(win.label)">
          ×
        </button>
      </header>
      <iframe
        :name="win.label"
        :src="win.src"
        :title="win.title"
        :style="{ pointerEvents: dragging ? 'none' : 'auto' }"
        @load="bindFrameFocus($event, win.label)"></iframe>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  closeHosted,
  constrainPosition,
  focusHosted,
  type HostedWindow,
  hostedWindows,
  resizeHosted,
  TITLE_BAR_HEIGHT
} from './host'

const dragging = ref(false)
let drag: { win: HostedWindow; pointerId: number; x: number; y: number; element: HTMLElement } | undefined

function startDrag(event: PointerEvent, win: HostedWindow) {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
  event.preventDefault()
  drag = {
    win,
    pointerId: event.pointerId,
    x: event.clientX - win.x,
    y: event.clientY - win.y,
    element: event.currentTarget
  }
  dragging.value = true
  drag.element.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  drag.win.x = event.clientX - drag.x
  drag.win.y = event.clientY - drag.y
  constrainPosition(drag.win)
}

function endDrag() {
  const previous = drag
  drag = undefined
  dragging.value = false
  if (previous?.element.hasPointerCapture(previous.pointerId)) {
    previous.element.releasePointerCapture(previous.pointerId)
  }
}

function bindFrameFocus(event: Event, label: string) {
  if (!(event.target instanceof HTMLIFrameElement)) return
  try {
    const frameWindow = event.target.contentWindow
    const focus = () => focusHosted(label)
    frameWindow?.addEventListener('focus', focus)
    frameWindow?.addEventListener('pointerdown', focus, true)
  } catch {
    // A frame that navigates away from the app can still be focused using its title bar.
  }
}

function fitViewport() {
  for (const win of hostedWindows) resizeHosted(win.label, win.width, win.height)
}

onMounted(() => window.addEventListener('resize', fitViewport))
onBeforeUnmount(() => {
  endDrag()
  window.removeEventListener('resize', fitViewport)
})
</script>

<style scoped>
/* Separate stacking contexts keep each backdrop above older windows without moving iframes in the DOM. */
.web-window-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.web-window,
.web-window-backdrop {
  pointer-events: auto;
}

.web-window {
  position: fixed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: var(--bg-popover);
  color: var(--text-color);
  box-shadow: 0 12px 40px rgb(0 0 0 / 30%);
}

.web-window-titlebar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 36px;
  height: 36px;
  padding-left: 12px;
  border-bottom: 1px solid var(--line-color);
  cursor: move;
  touch-action: none;
  user-select: none;
}

.web-window-title {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.web-window-close {
  flex-shrink: 0;
  width: 36px;
  height: 35px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 24px;
  cursor: pointer;
}

.web-window-close:hover {
  background: var(--line-color);
}

.web-window iframe {
  display: block;
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 0;
}

.web-window-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 40%);
}
</style>
