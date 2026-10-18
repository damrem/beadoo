export type StartedNote = {
  at: string
  kind?: string
  worktree?: string
  branch?: string
  parent?: string
  location?: string
  mode?: string
}

const KEYS = ['kind', 'worktree', 'branch', 'parent', 'location', 'mode'] as const

const LINE = /^started (\d{4}-\d{2}-\d{2} \d{2}:\d{2})(.*)$/

const PAIR = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g

const valueText = (value: string): string => (value === '' || /[\s"]/.test(value) ? JSON.stringify(value) : value)

const valueOf = (text: string): string => {
  if (!text.startsWith('"')) return text
  try {
    return JSON.parse(text) as string
  } catch {
    return text
  }
}

export function startedLine(note: StartedNote): string {
  const pairs = KEYS.flatMap((key) => (note[key] === undefined ? [] : [`${key}=${valueText(note[key])}`]))
  return [`started ${note.at}`, ...pairs].join(' ')
}

function parseLine(line: string): StartedNote | null {
  const match = LINE.exec(line.trim())
  if (!match) return null
  const note: StartedNote = { at: match[1]! }
  const rest = match[2] ?? ''
  const legacy = /^ in (\S.*)$/.exec(rest)
  if (legacy) return { ...note, worktree: legacy[1]!.trim() }
  for (const [, key, value] of rest.matchAll(PAIR)) {
    if ((KEYS as readonly string[]).includes(key!)) note[key as (typeof KEYS)[number]] = valueOf(value!)
  }
  return note
}

export function startedNotes(notes: string | null | undefined): StartedNote[] {
  return (notes ?? '').split('\n').flatMap((line) => {
    const note = parseLine(line)
    return note ? [note] : []
  })
}

export function lastStarted(notes: string | null | undefined): StartedNote | null {
  return startedNotes(notes).at(-1) ?? null
}
