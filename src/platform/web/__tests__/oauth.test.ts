import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let channel: TestBroadcastChannel

class TestBroadcastChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn()

  constructor() {
    channel = this
  }
}

function receive(control: string, data: unknown) {
  channel.onmessage?.({ data: { control, data } })
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
  vi.stubGlobal('stop', vi.fn())
  history.replaceState(null, '', '/login')
  document.body.replaceWith(document.createElement('body'))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  history.replaceState(null, '', '/')
})

describe('OAuth secrets', () => {
  it('generates distinct 128-bit hex secrets without writing browser storage', async () => {
    const { createOauthSecret } = await import('../runtime/oauth')
    const store = vi.spyOn(Storage.prototype, 'setItem')
    const first = createOauthSecret()
    const second = createOauthSecret()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(second).toMatch(/^[0-9a-f]{32}$/)
    expect(second).not.toBe(first)
    expect(store).not.toHaveBeenCalled()
  })

  it('rejects incorrect and reused secrets and emits encoded credentials only locally', async () => {
    const { acceptOauthCallback, createOauthSecret } = await import('../runtime/oauth')
    const { addListener } = await import('../runtime/bus')
    const listener = vi.fn()
    addListener('oauth-token', listener)
    const secret = createOauthSecret()
    const callback = { requestId: 'request', secret, token: 't&= +', refreshToken: 'r/?&', uid: '用 户' }

    expect(acceptOauthCallback({ ...callback, secret: 'wrong' })).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    expect(channel.postMessage).not.toHaveBeenCalled()
    expect(acceptOauthCallback(callback)).toBe(true)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: 'token=t%26%3D%20%2B&refreshToken=r%2F%3F%26&uid=%E7%94%A8%20%E6%88%B7'
      })
    )
    expect(acceptOauthCallback(callback)).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(channel.postMessage.mock.calls).toEqual([
      [{ control: 'oauth-callback-result', data: { requestId: 'request', ok: true } }]
    ])
  })

  it('registers the initiating tab handler on import and invalidates an older secret', async () => {
    const { createOauthSecret } = await import('../runtime/oauth')
    const { addListener } = await import('../runtime/bus')
    const listener = vi.fn()
    addListener('gitee-auth-code', listener)
    const oldSecret = createOauthSecret()
    const secret = createOauthSecret()
    receive('oauth-callback', { requestId: 'old', secret: oldSecret, code: 'old-code' })
    expect(channel.postMessage).not.toHaveBeenCalled()
    receive('oauth-callback', { requestId: 'gitee', secret, code: 'gitee-code' })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ payload: 'gitee-code' }))
    expect(channel.postMessage).toHaveBeenCalledWith({
      control: 'oauth-callback-result',
      data: { requestId: 'gitee', ok: true }
    })
  })
})

describe('OAuth callback page', () => {
  it('leaves ordinary pages alone', async () => {
    const { handleOauthCallback } = await import('../runtime/oauth')
    const body = document.body
    expect(handleOauthCallback()).toBe(false)
    expect(document.body).toBe(body)
    expect(channel.postMessage).not.toHaveBeenCalled()
  })

  it('parses the extra question mark, waits for its acknowledgement and closes after two seconds', async () => {
    history.replaceState(null, '', '/?secret=secret?token=t%26x&refreshToken=r%2B1&uid=42')
    const { handleOauthCallback } = await import('../runtime/oauth')
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    expect(handleOauthCallback()).toBe(true)
    expect(window.stop).toHaveBeenCalledOnce()
    expect(document.body.textContent).toBe('正在完成登录...')
    const request = channel.postMessage.mock.calls[0][0]
    expect(request).toEqual({
      control: 'oauth-callback',
      data: {
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
        secret: 'secret',
        token: 't&x',
        refreshToken: 'r+1',
        uid: '42',
        code: undefined
      }
    })
    receive('oauth-callback-result', { requestId: 'other', ok: true })
    receive('oauth-callback-result', { requestId: request.data.requestId, ok: false })
    expect(document.body.textContent).toBe('正在完成登录...')
    receive('oauth-callback-result', { requestId: request.data.requestId, ok: true })
    expect(document.body.textContent).toBe('登录成功您可以关闭此窗口返回应用。')
    vi.advanceTimersByTime(1999)
    expect(close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(close).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(5000)
    expect(document.body.textContent).toBe('登录成功您可以关闭此窗口返回应用。')
  })

  it('times out after five seconds and ignores late results', async () => {
    history.replaceState(null, '', '/?secret=secret&code=gitee-code')
    const { handleOauthCallback } = await import('../runtime/oauth')
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    handleOauthCallback()
    const request = channel.postMessage.mock.calls[0][0]
    expect(request.data.code).toBe('gitee-code')
    vi.advanceTimersByTime(4999)
    expect(document.body.textContent).toBe('正在完成登录...')
    vi.advanceTimersByTime(1)
    expect(document.body.textContent).toBe('登录请求无效或已过期，请回到应用重新发起登录。')
    receive('oauth-callback-result', { requestId: request.data.requestId, ok: true })
    vi.advanceTimersByTime(2000)
    expect(document.body.textContent).toBe('登录请求无效或已过期，请回到应用重新发起登录。')
    expect(close).not.toHaveBeenCalled()
  })

  it('registers the result handler before posting and does not validate callbacks in this tab', async () => {
    history.replaceState(null, '', '/?secret=secret&code=gitee-code')
    const { createOauthSecret, handleOauthCallback } = await import('../runtime/oauth')
    const secret = createOauthSecret()
    receive('oauth-callback', { requestId: 'ignored', secret, code: 'ignored-code' })
    expect(channel.postMessage).not.toHaveBeenCalled()
    channel.postMessage.mockImplementation((request) => {
      receive('oauth-callback-result', { requestId: request.data.requestId, ok: true })
    })
    handleOauthCallback()
    expect(document.body.textContent).toBe('登录成功您可以关闭此窗口返回应用。')
  })
})
