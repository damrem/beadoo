export type LabelProperty = { name: string; value: string }

export function labelParts(label: string): LabelProperty | null {
  const colon = label.indexOf(':')
  if (colon <= 0 || colon === label.length - 1) return null
  return { name: label.slice(0, colon), value: label.slice(colon + 1) }
}

export const mergedLabels = (...lists: (string[] | undefined)[]): string[] => [
  ...new Set(lists.flatMap((labels) => labels ?? [])),
]
