/**
 * Window label of the current browser context.
 *
 * In Tauri every window has a label. Browser pages retain it through window.name;
 * hosted child windows inherit it from the iframe name attribute.
 * Without a name the first path segment is used (`/home` -> `home`, `/` -> `login`).
 */
const firstSegment = location.pathname.split('/')[1] || ''

export const LABEL: string = window.name || (firstSegment === '' ? 'login' : firstSegment)
window.name = LABEL

/** Main windows replace the current page; every other window opens in a hosted iframe. */
export const PAGE_WINDOWS = new Set(['home', 'login'])

export const log = (...args: unknown[]) => console.debug('[web]', ...args)
