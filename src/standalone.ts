/**
 * True in an iPhone/iPad Safari tab (not yet on the home screen). `navigator.standalone` exists in
 * Safari only: false in a tab, true as a home-screen app. macOS Safari has it too, so a touch
 * screen is required as well (iPadOS reports a Mac user agent, but has touch points).
 */
export function inMobileSafariTab(nav: Pick<Navigator, 'maxTouchPoints'> & { standalone?: boolean }): boolean {
  return nav.standalone === false && nav.maxTouchPoints > 1
}
