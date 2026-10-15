import type { Bead } from './contract.ts'

export const STATUSES = ['open', 'in_progress', 'blocked', 'deferred', 'closed'] as const

export const TYPES = ['task', 'bug', 'feature', 'chore', 'epic', 'decision', 'spike', 'story', 'milestone'] as const

export const PRIORITIES = [0, 1, 2, 3, 4] as const

export const COMPLEXITY = /^complexity:(.*)$/

export const COMPLEXITY_VALUES = ['0', '1', '2', '3', '4'] as const

const LABEL = /^[^\s,]+$/

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export type EditableFields = {
  title: string
  status: string
  priority: number
  issue_type: string
  labels: string[]
  parent: string
  dependencies: string[]
  description: string
  notes: string
}

export type FieldName = keyof EditableFields

export const FIELD_NAMES: FieldName[] = [
  'title',
  'status',
  'priority',
  'issue_type',
  'labels',
  'parent',
  'dependencies',
  'description',
  'notes',
]

export const FIELD_LABELS: Record<FieldName, string> = {
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  issue_type: 'Type',
  labels: 'Labels',
  parent: 'Parent',
  dependencies: 'Dependencies',
  description: 'Description',
  notes: 'Notes',
}

export const TEXT_FIELDS: FieldName[] = ['title', 'description', 'notes']

export type EditRequest = {
  version: string
  changes: Partial<EditableFields>
  closeReason?: string
  noteEntry?: string
}

export const versionOf = (bead: Bead): string => `${bead.updated_at ?? ''}|${bead.revision ?? ''}`

const sorted = (values: string[]) => [...new Set(values)].sort()

export const blockersOf = (bead: Bead): string[] =>
  sorted((bead.dependencies ?? []).filter((dep) => dep.dependency_type !== 'parent-child').map((dep) => dep.id))

export const editableOf = (bead: Bead): EditableFields => ({
  title: bead.title ?? '',
  status: bead.status ?? 'open',
  priority: bead.priority ?? 2,
  issue_type: bead.issue_type ?? 'task',
  labels: sorted(bead.labels ?? []),
  parent: bead.parent ?? '',
  dependencies: blockersOf(bead),
  description: bead.description ?? '',
  notes: bead.notes ?? '',
})

const sameValue = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && sorted(a).every((value, index) => value === sorted(b)[index])
    : a === b

export const changedFields = (before: EditableFields, after: Partial<EditableFields>): FieldName[] =>
  FIELD_NAMES.filter((name) => name in after && !sameValue(before[name], after[name]))

export const changesOf = (before: EditableFields, after: EditableFields): Partial<EditableFields> =>
  Object.fromEntries(changedFields(before, after).map((name) => [name, after[name]])) as Partial<EditableFields>

export function labelProblem(labels: string[]): string | null {
  const bad = labels.find((label) => !LABEL.test(label))
  if (bad !== undefined) return `The label "${bad}" holds a space or a comma.`
  const complexity = labels.filter((label) => COMPLEXITY.test(label))
  if (complexity.length > 1) return `A bead takes one complexity label only, and this one has ${complexity.join(', ')}.`
  const value = complexity[0]?.match(COMPLEXITY)?.[1]
  if (value !== undefined && !(COMPLEXITY_VALUES as readonly string[]).includes(value)) {
    return `The complexity label takes a value from 0 to 4, not "${value}".`
  }
  return null
}

export function editProblem(request: EditRequest, current: EditableFields): string | null {
  const { changes } = request
  if (changes.title !== undefined && changes.title.trim() === '') return 'A bead needs a title.'
  if (changes.status !== undefined && !(STATUSES as readonly string[]).includes(changes.status)) {
    return `The status "${changes.status}" is not one of ${STATUSES.join(', ')}.`
  }
  if (changes.priority !== undefined && !(PRIORITIES as readonly number[]).includes(changes.priority)) {
    return `The priority takes a value from 0 to 4, not "${changes.priority}".`
  }
  if (changes.issue_type !== undefined && !(TYPES as readonly string[]).includes(changes.issue_type)) {
    return `The type "${changes.issue_type}" is not one of ${TYPES.join(', ')}.`
  }
  if (changes.labels !== undefined) {
    const problem = labelProblem(changes.labels)
    if (problem) return problem
  }
  if (changes.parent !== undefined && changes.parent !== '' && !ID.test(changes.parent)) {
    return `"${changes.parent}" is not a bead id.`
  }
  const badDep = changes.dependencies?.find((dep) => !ID.test(dep))
  if (badDep !== undefined) return `"${badDep}" is not a bead id.`
  if (changes.status === 'closed' && current.status !== 'closed' && !request.closeReason?.trim()) {
    return 'Give a reason to close the bead.'
  }
  return null
}

export function isEditRequest(value: unknown): value is EditRequest {
  if (typeof value !== 'object' || value === null) return false
  const { version, changes, closeReason, noteEntry } = value as Record<string, unknown>
  if (typeof version !== 'string' || typeof changes !== 'object' || changes === null || Array.isArray(changes)) return false
  if (closeReason !== undefined && typeof closeReason !== 'string') return false
  if (noteEntry !== undefined && typeof noteEntry !== 'string') return false
  const fields = changes as Record<string, unknown>
  return Object.entries(fields).every(([name, field]) => {
    if (!(FIELD_NAMES as string[]).includes(name)) return false
    if (name === 'priority') return typeof field === 'number'
    if (name === 'labels' || name === 'dependencies') {
      return Array.isArray(field) && field.every((item) => typeof item === 'string')
    }
    return typeof field === 'string'
  })
}

export const stampOf = (date: Date): string => {
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

export const withEntry = (notes: string, stamp: string, entry: string): string =>
  notes.trim() === '' ? `${stamp} ${entry.trim()}` : `${notes.replace(/\s+$/, '')}\n${stamp} ${entry.trim()}`

export type DiffLine = { kind: 'same' | 'mine' | 'theirs'; text: string }

export function lineDiff(mine: string, theirs: string): DiffLine[] {
  const a = mine === '' ? [] : mine.split('\n')
  const b = theirs === '' ? [] : theirs.split('\n')
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i]! })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push({ kind: 'mine', text: a[i]! })
      i += 1
    } else {
      lines.push({ kind: 'theirs', text: b[j]! })
      j += 1
    }
  }
  while (i < a.length) lines.push({ kind: 'mine', text: a[i++]! })
  while (j < b.length) lines.push({ kind: 'theirs', text: b[j++]! })
  return lines
}

export const showValue = (name: FieldName, value: EditableFields[FieldName]): string => {
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.join(', ')
  if (name === 'priority') return `P${value}`
  return value === '' ? 'none' : String(value)
}
