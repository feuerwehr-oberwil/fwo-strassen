// Colours shared by the map and the mode screens.
/**
 * target = asked/introduced, select = tapped but not yet checked, ok/bad = after answering,
 * dim = a miss in the summary while another one is in focus.
 */
export type Tone = 'target' | 'select' | 'ok' | 'bad' | 'dim'
export const TONE_COLOR: Record<Tone, string> = {
  target: '#f97316',
  select: '#1d4ed8',
  ok: '#16a34a',
  bad: '#dc2626',
  dim: '#fca5a5',
}

/** One colour per house-number section, in number order (dark enough for white label text). */
export const SECTION_COLORS = ['#1d4ed8', '#15803d', '#b45309', '#be185d', '#6d28d9'] as const
export const NEUTRAL = '#57534e'
/** The truck route from the Magazin, and the truck driving it. */
export const ROUTE_COLOR = '#1c1917'
export const TRUCK_COLOR = '#dc2626'
