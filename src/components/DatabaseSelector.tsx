import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DatabaseEntry } from '@/lib/api'

export function DatabaseSelector({
  databases,
  value,
  onChange,
}: {
  databases: DatabaseEntry[]
  value: string | null
  onChange: (name: string) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(name) => {
        if (typeof name === 'string') onChange(name)
      }}
    >
      <SelectTrigger aria-label="Database" className="min-w-40">
        <SelectValue placeholder="Database" />
      </SelectTrigger>
      <SelectContent>
        {databases.map((db) => (
          <SelectItem key={db.name} value={db.name}>
            {db.name}
            {db.refused ? ' (refused)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
