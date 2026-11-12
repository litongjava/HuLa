import { createApp } from 'vue'
import { getHost } from './host'
import WebWindowHost from './WebWindowHost.vue'

export function mountWindowHost() {
  if (window.top !== window || document.getElementById('web-window-host')) return
  window.__WEB_WINDOW_HOST__ = getHost()
  const container = document.createElement('div')
  container.id = 'web-window-host'
  document.body.append(container)
  createApp(WebWindowHost).mount(container)
}
