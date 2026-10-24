export function NoMatch({ text = '' }: { text?: string }) {
  const search = text.trim()
  return (
    <p className="p-4 text-sm text-muted-foreground">
      {search ? `No bead matches "${search}" and the filters.` : 'No bead matches the filters.'}
    </p>
  )
}
