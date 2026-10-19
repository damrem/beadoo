import { useCallback, useEffect, useState } from 'react'
import { BeadBody, beadTitle, useBead } from '@/components/BeadDetail'
import { BeadId } from '@/components/BeadId'
import { CopyLinkButton } from '@/components/BeadLink'
import { Logo } from '@/components/Logo'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { api } from '@/lib/api'
import { SpawnAllowed } from '@/lib/spawn-allowed'
import { boardUrl } from '@/lib/urls'
import type { Bead } from '../../shared/contract'

export function BeadPage({ db, id }: { db: string; id: string }) {
  const [actor, setActor] = useState<string | null>(null)
  const [beads, setBeads] = useState<Bead[] | undefined>(undefined)
  const [spawn, setSpawn] = useState(false)

  const readBeads = useCallback(() => {
    api
      .beads(db)
      .then((list) => setBeads(list.beads))
      .catch(() => setBeads(undefined))
  }, [db])

  const state = useBead(db, id, readBeads)
  const title = beadTitle(state)

  useEffect(() => {
    let live = true
    api
      .actor(db)
      .then((name) => live && setActor(name || null))
      .catch(() => live && setActor(null))
    return () => {
      live = false
    }
  }, [db])

  useEffect(readBeads, [readBeads])

  useEffect(() => {
    let live = true
    api
      .databases()
      .then((body) => live && setSpawn(body.spawn === true))
      .catch(() => live && setSpawn(false))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    document.title = `${id} · beadoo`
  }, [id])

  return (
    <SpawnAllowed.Provider value={spawn}>
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <a href={boardUrl(db)} className="flex items-center gap-1.5 font-heading text-base font-semibold">
            <Logo />
            beadoo
          </a>
          <span className="text-sm text-muted-foreground">{db}</span>
          <div className="ml-auto">
            <ThemeSwitch />
          </div>
        </header>
        <main className="flex flex-col gap-2 pt-4">
          <div className="flex items-center gap-2 px-4 font-mono text-sm text-muted-foreground">
            <BeadId id={id} />
            <CopyLinkButton db={db} id={id} />
          </div>
          <h1 className="px-4 font-heading text-xl font-semibold">{title}</h1>
          <BeadBody db={db} actor={actor} state={state} beads={beads} onWritten={readBeads} />
        </main>
      </div>
    </SpawnAllowed.Provider>
  )
}
