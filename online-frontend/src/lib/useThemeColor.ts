import { useEffect } from 'react'

/**
 * Phone shell: the browser / standalone status bar takes the colour of the app bar (the canvas token), then goes
 * back to the build-time brand colour when the shell goes away. Read from the CSS token so a brand change flows through.
 */
export function useThemeColor(token: string): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return
    const before = meta.content
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (value) meta.content = value
    return () => {
      meta.content = before
    }
  }, [token])
}
