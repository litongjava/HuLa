/**
 * Runs once, before any app code: imported by the browser replacement of @tauri-apps/api/core,
 * which main.ts loads first.
 */
import { failures, unhandled } from '../commands'
import { auth } from '../commands/http'
import { mountWindowHost } from '../windowHost'
import { downloads, opened } from './diagnostics'
import { installFakeMedia } from './fakeMedia'
import { LABEL, log } from './label'
import { handleOauthCallback } from './oauth'
import { registerWindow } from './windows'

export const isOauthCallback = handleOauthCallback()

if (!isOauthCallback) {
  installFakeMedia()
  registerWindow()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWindowHost, { once: true })
  } else {
    mountWindowHost()
  }
}
// diagnostics for tests: commands without a browser implementation and failed commands
;(window as any).__WEB_RUNTIME__ = { label: LABEL, auth, unhandled, failures, downloads, opened }
log('browser runtime ready for window', LABEL)
