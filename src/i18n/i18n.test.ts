import { describe, expect, it } from 'vitest'
import { messages } from './messages.ts'

/** Every message of a language as text; functions are called with 0, 1 and 2 for each argument. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (typeof node === 'function') return [0, 1, 2].map((n) => String(node(n, n, n)))
  if (typeof node === 'object' && node) return Object.values(node).flatMap(texts)
  return []
}

describe.each(Object.entries(messages))('%s', (_, m) => {
  it('has no empty message', () => {
    for (const text of texts(m)) expect(text.trim()).not.toBe('')
  })
})

it('fr keeps «» and ? ! : ; off a normal space, so they never wrap onto their own line', () => {
  for (const text of texts(messages.fr)) expect(text).not.toMatch(/ [?!:;»]|« /)
})
