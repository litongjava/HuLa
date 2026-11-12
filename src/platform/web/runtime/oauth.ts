/**
 * Third-party login callback. The initiating tab keeps a one-time secret in memory and validates
 * callback messages from other tabs before delivering credentials to its local login listeners.
 */
import { emitLocal, onControl, postControl } from './bus'

type OauthCallback = {
  requestId: string
  secret: string
  token?: string
  refreshToken?: string
  uid?: string
  code?: string
}

let pendingSecret: string | null = null

function randomHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createOauthSecret(): string {
  pendingSecret = randomHex()
  return pendingSecret
}

export function acceptOauthCallback(msg: OauthCallback): boolean {
  if (!pendingSecret || pendingSecret !== msg.secret) return false
  pendingSecret = null
  if (msg.token) {
    const payload = `token=${encodeURIComponent(msg.token)}&refreshToken=${encodeURIComponent(msg.refreshToken || '')}&uid=${encodeURIComponent(msg.uid || '')}`
    emitLocal('oauth-token', payload)
  } else if (msg.code) {
    emitLocal('gitee-auth-code', msg.code)
  }
  postControl('oauth-callback-result', { requestId: msg.requestId, ok: true })
  return true
}

function readOauthCallback(): Omit<OauthCallback, 'requestId'> | null {
  // The server appends "?token=..." to a redirect that already has "?secret=...", so read both parts.
  const query = new URLSearchParams(location.search.replace(/\?/g, '&'))
  const secret = query.get('secret')
  if (!secret || (!query.get('token') && !query.get('code'))) return null
  return {
    secret,
    token: query.get('token') || undefined,
    refreshToken: query.get('refreshToken') || undefined,
    uid: query.get('uid') || undefined,
    code: query.get('code') || undefined
  }
}

// Register before app startup so the initiating tab can receive callbacks from newly opened tabs.
if (!readOauthCallback()) onControl('oauth-callback', acceptOauthCallback)

export function handleOauthCallback(): boolean {
  const callback = readOauthCallback()
  if (!callback) return false

  window.stop()
  const body = document.createElement('body')
  body.style.cssText =
    'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif'
  const heading = document.createElement('h1')
  const message = document.createElement('p')
  heading.textContent = '正在完成登录...'
  body.append(heading, message)
  document.body.replaceWith(body)

  const requestId = randomHex()
  let finished = false
  const timeout = setTimeout(() => {
    finished = true
    heading.textContent = '登录请求无效或已过期，请回到应用重新发起登录。'
  }, 5000)
  onControl('oauth-callback-result', (result: { requestId: string; ok: boolean }) => {
    if (finished || result.requestId !== requestId || result.ok !== true) return
    finished = true
    clearTimeout(timeout)
    heading.textContent = '登录成功'
    message.textContent = '您可以关闭此窗口返回应用。'
    setTimeout(() => window.close(), 2000)
  })
  postControl('oauth-callback', { requestId, ...callback })
  return true
}
