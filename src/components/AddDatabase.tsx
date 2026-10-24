import { FolderOpenIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { FolderBrowser } from '@/components/FolderBrowser'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DatabaseEntry } from '../../shared/contract'

export function AddDatabase({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (path: string, name: string) => Promise<DatabaseEntry[]>
}) {
  const id = useId()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const change = (next: boolean) => {
    onOpenChange(next)
    if (next) return
    setPath('')
    setName('')
    setBrowsing(false)
    setFailure(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAdding(true)
    setFailure(null)
    onAdd(path, name)
      .then(() => change(false))
      .catch((reason: Error) => setFailure(reason.message))
      .finally(() => setAdding(false))
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogTitle>Add a repo</DialogTitle>
        <DialogDescription>beadoo keeps the repo in its config, so the repo stays in the list at the next start.</DialogDescription>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-path`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Folder
            </label>
            <div className="flex gap-1.5">
              <Input
                id={`${id}-path`}
                value={path}
                placeholder="~/Projects/shop"
                required
                onChange={(event) => setPath(event.target.value)}
              />
              <Button type="button" variant="outline" aria-expanded={browsing} onClick={() => setBrowsing((current) => !current)}>
                <FolderOpenIcon />
                Browse
              </Button>
            </div>
          </div>
          {browsing && (
            <FolderBrowser
              start={path}
              onChoose={(chosen) => {
                setPath(chosen)
                setBrowsing(false)
              }}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Name
            </label>
            <Input id={`${id}-name`} value={name} placeholder="The name of the folder" onChange={(event) => setName(event.target.value)} />
          </div>
          {failure && (
            <p role="alert" className="text-destructive">
              {failure}
            </p>
          )}
          <Button type="submit" disabled={adding || path.trim() === ''} className="self-end">
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
