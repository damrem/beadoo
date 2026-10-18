import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AttributeFilters } from '@/components/AttributeFilters'
import { BeadDetail } from '@/components/BeadDetail'
import { BeadPage } from '@/components/BeadPage'
import { Board } from '@/components/Board'
import { DatabaseSelector } from '@/components/DatabaseSelector'
import { EpicHeader } from '@/components/EpicHeader'
import { EpicLanes } from '@/components/EpicLanes'
import { EpicSidebar } from '@/components/EpicSidebar'
import { EpicTable } from '@/components/EpicTable'
import { FilterBar } from '@/components/FilterBar'
import { Logo } from '@/components/Logo'
import { NoMatch } from '@/components/NoMatch'
import { RefreshButton } from '@/components/RefreshButton'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { UnreachableAlert } from '@/components/UnreachableAlert'
import { ViewSwitch } from '@/components/ViewSwitch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '@/lib/api'
import { beadAddressOf } from '@/lib/urls'
import { withBlockers } from '@/lib/blockers'
import { UNREACHABLE } from '../shared/contract'
import type { BeadList, DatabaseEntry } from '../shared/contract'
import {
  childrenOf,
  epicsOf,
  filterBeads,
  groupByParent,
  labelsOf,
  lanesOf,
  prioritiesOf,
  readViewState,
  statusTogglesOf,
  typesOf,
  writeViewState,
} from '@/lib/filters'
import type { BeadFilter, StoredFilters, ViewState } from '@/lib/filters'

export const POLL_MS = 60_000

const STORAGE_KEY = 'beadoo:filters'

const LEGACY_STORAGE_KEY = 'beads-page:filters'

function readStored(): StoredFilters {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}') as StoredFilters
  } catch {
    return {}
  }
}

function writeStored(filters: StoredFilters) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    return
  }
}

export function App() {
  const address = beadAddressOf(window.location)
  return address ? <BeadPage db={address.db} id={address.id} /> : <Beads />
}

function Beads() {
  const [view, setView] = useState<ViewState>(() => readViewState(window.location.search, readStored()))
  const [databases, setDatabases] = useState<DatabaseEntry[] | null>(null)
  const [data, setData] = useState<BeadList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastRead, setLastRead] = useState<Date | null>(null)
  const [actor, setActor] = useState<string | null>(null)
  const activeDb = useRef<string | null>(null)

  const update = (change: Partial<ViewState>) => setView((current) => ({ ...current, ...change }))

  useEffect(() => {
    window.history.replaceState(null, '', writeViewState(view))
    writeStored({
      status: view.status,
      text: view.text,
      view: view.mode,
      labels: view.labels,
      type: view.type,
      priority: view.priority,
    })
  }, [view])

  useEffect(() => {
    api
      .databases()
      .then((list) => {
        setDatabases(list)
        setView((current) =>
          current.db && list.some((db) => db.name === current.db)
            ? current
            : { ...current, db: (list.find((db) => !db.refused) ?? list[0])?.name ?? null },
        )
      })
      .catch((reason: Error) => setError(reason.message))
  }, [])

  const selectedDb = databases?.find((db) => db.name === view.db) ?? null

  const refresh = useCallback(() => {
    if (!selectedDb || selectedDb.refused) return
    const name = selectedDb.name
    const current = () => activeDb.current === name
    setLoading(true)
    api
      .beads(name)
      .then((list) => {
        if (!current()) return
        setData(list)
        setError(null)
        setUnreachable(false)
        setLastRead(new Date())
      })
      .catch((reason: Error) => {
        if (!current()) return
        setError(reason.message)
        setUnreachable(reason instanceof ApiError && reason.code === UNREACHABLE)
      })
      .finally(() => current() && setLoading(false))
  }, [selectedDb])

  useEffect(() => {
    setActor(null)
    if (!selectedDb || selectedDb.refused) return
    let live = true
    api
      .actor(selectedDb.name)
      .then((name) => live && setActor(name || null))
      .catch(() => live && setActor(null))
    return () => {
      live = false
    }
  }, [selectedDb])

  useEffect(() => {
    activeDb.current = selectedDb?.name ?? null
    setData(null)
    setError(null)
    setUnreachable(false)
    setLastRead(null)
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh, selectedDb])

  const beads = useMemo(() => withBlockers(data?.beads ?? [], data?.readyIds), [data])

  const groups = useMemo(() => groupByParent(beads), [beads])

  const epics = useMemo(() => (data ? epicsOf(beads, groups, view.status) : []), [data, beads, groups, view.status])

  const options = useMemo(
    () => ({
      labels: labelsOf(beads),
      types: typesOf(beads),
      priorities: prioritiesOf(beads),
      statuses: statusTogglesOf(beads),
    }),
    [beads],
  )

  const filter = useMemo<BeadFilter>(
    () => ({ status: view.status, text: view.text, labels: view.labels, type: view.type, priority: view.priority }),
    [view.status, view.text, view.labels, view.type, view.priority],
  )

  const lanes = useMemo(
    () => (data ? lanesOf(epics, groups, data.readyIds, filter, beads) : []),
    [data, beads, groups, epics, filter],
  )

  const epic = useMemo(() => {
    if (view.epic && lanes.some((lane) => lane.epic.id === view.epic)) return view.epic
    return lanes[0]?.epic.id ?? null
  }, [lanes, view.epic])

  const selectedEpic = lanes.find((lane) => lane.epic.id === epic)?.epic

  const boardBeads = useMemo(
    () => (data && epic ? filterBeads(childrenOf(groups, epic), data.readyIds, filter) : []),
    [data, groups, epic, filter],
  )

  const open = (id: string) => update({ bead: id })

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2">
        <h1 className="flex items-center gap-1.5 font-heading text-base font-semibold">
          <Logo />
          beadoo
        </h1>
        <ViewSwitch mode={view.mode} onMode={(mode) => update({ mode })} />
        <DatabaseSelector
          databases={databases ?? []}
          value={view.db}
          onChange={(db) => update({ db, epic: null, bead: null })}
        />
        <FilterBar
          status={view.status}
          statuses={options.statuses}
          text={view.text}
          onStatus={(status) => update({ status })}
          onText={(text) => update({ text })}
        />
        <AttributeFilters
          labels={view.labels}
          type={view.type}
          priority={view.priority}
          labelOptions={options.labels}
          typeOptions={options.types}
          priorityOptions={options.priorities}
          onLabels={(labels) => update({ labels })}
          onType={(type) => update({ type })}
          onPriority={(priority) => update({ priority })}
        />
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <RefreshButton lastRead={lastRead} loading={loading} onRefresh={refresh} />
        </div>
      </header>

      {selectedDb?.refused && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertTitle>The page does not read the database "{selectedDb.name}"</AlertTitle>
          <AlertDescription>{selectedDb.refused}</AlertDescription>
        </Alert>
      )}
      {error && unreachable && selectedDb && (
        <UnreachableAlert
          key={selectedDb.name}
          name={selectedDb.name}
          message={error}
          hasTunnel={Boolean(selectedDb.hasTunnel)}
          onStart={() => api.startTunnel(selectedDb.name).then(refresh)}
        />
      )}
      {error && !unreachable && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertTitle>The page could not read the beads</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!selectedDb?.refused && (
        <div className="flex min-h-0 flex-1">
          {data && view.mode === 'epic' ? (
            <>
              <EpicSidebar lanes={lanes} selected={epic} onSelect={(id) => update({ epic: id })} />
              <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
                {selectedEpic && <EpicHeader epic={selectedEpic} onOpen={open} />}
                {epic ? <Board beads={boardBeads} status={view.status} onOpen={open} /> : <NoMatch />}
              </main>
            </>
          ) : data ? (
            <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
              {view.mode === 'lanes' ? (
                <EpicLanes lanes={lanes} status={view.status} onOpen={open} />
              ) : (
                <EpicTable lanes={lanes} onOpen={open} />
              )}
            </main>
          ) : (
            !error && <Skeleton aria-label="Loading the beads" className="m-4 h-64 flex-1" />
          )}
        </div>
      )}

      {view.db && (
        <BeadDetail
          db={view.db}
          id={view.bead}
          actor={actor}
          beads={data?.beads}
          onClose={() => update({ bead: null })}
          onOpen={open}
          onWritten={refresh}
        />
      )}
    </div>
  )
}
