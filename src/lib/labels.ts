export type LabelProperty = { name: string; value: string }

export function labelParts(label: string): LabelProperty | null {
  const colon = label.indexOf(':')
  if (colon <= 0 || colon === label.length - 1) return null
  return { name: label.slice(0, colon), value: label.slice(colon + 1) }
}

export function mergedLabels(own: string[] = [], ...children: (string[] | undefined)[]): string[] {
  const ownNames = new Set(own.flatMap((label) => labelParts(label)?.name ?? []))
  const inherited = children
    .flatMap((labels) => labels ?? [])
    .filter((label) => {
      const property = labelParts(label)
      return !property || !ownNames.has(property.name)
    })
  return [...new Set([...own, ...inherited])]
}
