/**
 * True in the browser build (`vite --mode web`). Constant at build time, so desktop-only or
 * browser-only branches are removed from the other build.
 * Business code should prefer getPlatform().capabilities from '@/platform'.
 */
export const isWeb = import.meta.env.VITE_RUNTIME === 'web'
