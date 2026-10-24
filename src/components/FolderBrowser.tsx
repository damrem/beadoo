import { ArrowUpIcon, FolderIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { FolderList } from '../../shared/contract'

export function FolderBrowser({ start, onChoose }: { start: string; onChoose: (path: string) => void }) {
  const [list, setList] = useState<FolderList | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const open = (path: string | null) => {
    setFailure(null)
    return api
      .folders(path)
      .then(setList)
      .catch((reason: Error) => {
        setFailure(reason.message)
        throw reason
      })
  }

  useEffect(() => {
    const typed = start.trim()
    open(typed.startsWith('/') || typed.startsWith('~') ? typed : null).catch(() => {
      if (typed) open(null).catch(() => {})
    })
  }, [])

  return (
    <section aria-label="Folder browser" className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Parent folder"
          title="Parent folder"
          disabled={!list?.parent}
          onClick={() => list?.parent && open(list.parent).catch(() => {})}
        >
          <ArrowUpIcon />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={list?.path}>
          {list?.path ?? 'Loading…'}
        </span>
      </div>
      <ul aria-label="Folders" className="flex max-h-56 flex-col overflow-y-auto">
        {list?.folders.map((folder) => (
          <li key={folder.path}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => open(folder.path).catch(() => {})}
            >
              <FolderIcon />
              <span className="truncate">{folder.name}</span>
              {folder.hasBeads && <span className="ml-auto rounded bg-muted px-1.5 text-xs text-muted-foreground">beads</span>}
            </Button>
          </li>
        ))}
        {list && list.folders.length === 0 && <li className="px-2.5 py-1 text-xs text-muted-foreground">No folder</li>}
      </ul>
      {failure && (
        <p role="alert" className="text-destructive">
          {failure}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant={list?.hasBeads ? 'default' : 'outline'}
        disabled={!list}
        className="self-end"
        onClick={() => list && onChoose(list.path)}
      >
        Choose this folder
      </Button>
    </section>
  )
}
