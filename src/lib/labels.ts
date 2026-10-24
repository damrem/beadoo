export type LabelProperty = { name: string; value: string }

export function labelParts(label: string): LabelProperty | null {
  const colon = label.indexOf(':')
  if (colon <= 0 || colon === label.length - 1) return null
  return { name: label.slice(0, colon), value: label.slice(colon + 1) }
}

export const labelText = (label: string): string => {
  const property = labelParts(label)
  return property ? `${property.name}: ${property.value}` : label
}

export function labelGroups(labels: string[]): string[][] {
  const plain: string[][] = []
  const attributes = new Map<string, string[]>()
  for (const label of labels) {
    const name = labelParts(label)?.name
    if (name === undefined) plain.push([label])
    else attributes.set(name, [...(attributes.get(name) ?? []), label])
  }
  return [...plain, ...attributes.values()]
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
