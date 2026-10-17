import { labelParts } from '@/lib/labels'

const STATUS_EMOJIS: Record<string, string> = {
  open: '📋',
  in_progress: '🚧',
  blocked: '⛔',
  closed: '✅',
  deferred: '💤',
  pinned: '📌',
  hooked: '🪝',
}

const TYPE_EMOJIS: Record<string, string> = {
  epic: '🏔️',
  feature: '✨',
  task: '📝',
  bug: '🐛',
  chore: '🧹',
  decision: '⚖️',
  spike: '🔬',
  story: '📖',
  milestone: '🏁',
  message: '✉️',
  gate: '🚪',
  molecule: '🧬',
  agent: '🤖',
  role: '🎭',
  event: '📅',
}

const LABEL_EMOJIS: Record<string, string> = {
  handoff: '👋',
  skills: '🧰',
  beads: '📿',
  workflow: '🔄',
  hooks: '🪝',
  scan: '🔍',
  'insights-scan': '💡',
  docs: '📚',
  security: '🔒',
  context: '🧠',
  panes: '🪟',
  links: '🔗',
}

const PROPERTY_EMOJIS: Record<string, string> = {
  repo: '📦',
  complexity: '🧩',
  cx: '🧩',
  scan: '🔍',
  os: '💻',
  area: '🗺️',
}

export const statusEmoji = (status: string): string | undefined => STATUS_EMOJIS[status]

export const typeEmoji = (type: string | undefined): string | undefined => (type ? TYPE_EMOJIS[type] : undefined)

export function labelEmoji(label: string): string | undefined {
  const property = labelParts(label)
  return property ? PROPERTY_EMOJIS[property.name] : LABEL_EMOJIS[label]
}
