// Colours shared by the map and the mode screens.
export type Tone = 'target' | 'ok' | 'bad'
export const TONE_COLOR: Record<Tone, string> = { target: '#f97316', ok: '#16a34a', bad: '#dc2626' }

/** One colour per house-number section, in number order. */
export const SECTION_COLORS = ['#2563eb', '#16a34a', '#d97706', '#db2777', '#7c3aed'] as const
export const NEUTRAL = '#57534e'
