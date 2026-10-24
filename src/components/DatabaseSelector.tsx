import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { AddDatabase } from '@/components/AddDatabase'
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DatabaseEntry } from '../../shared/contract'

const ADD_REPO = Symbol('add a repo')

export function DatabaseSelector({
  databases,
  value,
  onChange,
  onAdd,
}: {
  databases: DatabaseEntry[]
  value: string | null
  onChange: (name: string) => void
  onAdd: (path: string, name: string) => Promise<DatabaseEntry[]>
}) {
  const [adding, setAdding] = useState(false)

  return (
    <>
      <Select<string | typeof ADD_REPO>
        value={value}
        onValueChange={(name) => {
          if (name === ADD_REPO) setAdding(true)
          else if (typeof name === 'string') onChange(name)
        }}
      >
        <SelectTrigger aria-label="Database" className="min-w-32">
          <SelectValue placeholder="Database" />
        </SelectTrigger>
        <SelectContent>
          {databases.length > 0 && (
            <SelectGroup>
              {databases.map((db) => (
                <SelectItem key={db.name} value={db.name}>
                  {db.name}
                  {db.refused ? ' (refused)' : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {databases.length > 0 && <SelectSeparator />}
          <SelectGroup>
            <SelectItem value={ADD_REPO}>
              <PlusIcon />
              Add a repo…
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <AddDatabase open={adding} onOpenChange={setAdding} onAdd={onAdd} />
    </>
  )
}
