import { isMobile } from '@/utils/PlatformConstants'
import { desktopPlatform } from './desktop'
import { mobilePlatform } from './mobile'
import type { PlatformAdapter } from './types'

/**
 * Tauri build: desktop or mobile, decided at runtime after initializePlatform().
 * The browser build replaces this module (see build/config/webAlias.ts).
 */
export const getPlatform = (): PlatformAdapter => (isMobile() ? mobilePlatform : desktopPlatform)
