export function shortId(id: string): string {
  const hyphen = id.indexOf('-')
  if (hyphen <= 0 || hyphen === id.length - 1) return id
  return id.slice(hyphen + 1)
}
