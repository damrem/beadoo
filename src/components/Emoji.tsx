export function Emoji({ emoji }: { emoji: string | undefined }) {
  if (!emoji) return null
  return <span aria-hidden="true">{emoji}</span>
}
