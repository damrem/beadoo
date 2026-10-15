import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { STALE } from '../../shared/contract'
import type { Bead } from '../../shared/contract'
import {
  changedFields,
  changesOf,
  closes,
  COMPLEXITY,
  COMPLEXITY_VALUES,
  editableOf,
  editProblem,
  FIELD_LABELS,
  lineDiff,
  PRIORITIES,
  showValue,
  STATUSES,
  TEXT_FIELDS,
  TYPES,
  versionOf,
} from '../../shared/edit'
import type { EditableFields, FieldName } from '../../shared/edit'

type Choice = 'mine' | 'theirs'

type Conflict = { theirs: Bead; fields: FieldName[]; choices: Partial<Record<FieldName, Choice>> }

const words = (text: string) => text.split(/[\s,]+/).filter((word) => word !== '')

const complexityOf = (labels: string[]) => labels.find((label) => COMPLEXITY.test(label))?.match(COMPLEXITY)?.[1] ?? ''

const otherLabels = (labels: string[]) => labels.filter((label) => !COMPLEXITY.test(label))

function Row({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

function Diff({ mine, theirs }: { mine: string; theirs: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border font-mono text-xs" aria-label="Line diff">
      {lineDiff(mine, theirs).map((line, index) => (
        <div
          key={index}
          className={cn(
            'px-2 whitespace-pre-wrap',
            line.kind === 'mine' && 'bg-blue-500/10',
            line.kind === 'theirs' && 'bg-amber-500/15',
          )}
        >
          {line.kind === 'mine' ? 'mine   ' : line.kind === 'theirs' ? 'theirs ' : '       '}
          {line.text}
        </div>
      ))}
    </pre>
  )
}

function ConflictView({
  mine,
  conflict,
  saving,
  onChoose,
  onApply,
  onCancel,
}: {
  mine: EditableFields
  conflict: Conflict
  saving: boolean
  onChoose: (field: FieldName, choice: Choice) => void
  onApply: () => void
  onCancel: () => void
}) {
  const theirs = editableOf(conflict.theirs)
  return (
    <section aria-label="Conflict" className="flex flex-col gap-3">
      <Alert>
        <AlertTitle>Somebody changed this bead after the page read it</AlertTitle>
        <AlertDescription>For each field, keep your value or take the value of the database. Then save again.</AlertDescription>
      </Alert>
      {conflict.fields.map((field) => (
        <fieldset key={field} className="flex flex-col gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">{FIELD_LABELS[field]}</legend>
          {TEXT_FIELDS.includes(field) ? (
            <Diff mine={String(mine[field])} theirs={String(theirs[field])} />
          ) : (
            <dl className="grid grid-cols-[4rem_1fr] gap-1 text-sm">
              <dt className="text-muted-foreground">Mine</dt>
              <dd>{showValue(field, mine[field])}</dd>
              <dt className="text-muted-foreground">Theirs</dt>
              <dd>{showValue(field, theirs[field])}</dd>
            </dl>
          )}
          <div className="flex gap-4 text-sm">
            {(['mine', 'theirs'] as const).map((choice) => (
              <label key={choice} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`choice-${field}`}
                  checked={conflict.choices[field] === choice}
                  onChange={() => onChoose(field, choice)}
                />
                {choice === 'mine' ? `Keep my ${FIELD_LABELS[field].toLowerCase()}` : `Take their ${FIELD_LABELS[field].toLowerCase()}`}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={onApply}>
          {saving ? 'Saving…' : 'Save with these choices'}
        </Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

export function BeadEditor({
  db,
  bead,
  onSaved,
  onCancel,
}: {
  db: string
  bead: Bead
  onSaved: (bead: Bead) => void
  onCancel: () => void
}) {
  const [base, setBase] = useState(bead)
  const [draft, setDraft] = useState(() => editableOf(bead))
  const [closeReason, setCloseReason] = useState('')
  const [noteEntry, setNoteEntry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  const set = <K extends FieldName>(field: K, value: EditableFields[K]) => setDraft((current) => ({ ...current, [field]: value }))

  const save = async (from: Bead, values: EditableFields, retried = false): Promise<void> => {
    const before = editableOf(from)
    const request = {
      version: versionOf(from),
      changes: changesOf(before, values),
      ...(closeReason.trim() ? { closeReason } : {}),
      ...(noteEntry.trim() ? { noteEntry } : {}),
    }
    const problem = editProblem(request, before)
    if (problem) {
      setError(problem)
      return
    }
    if (Object.keys(request.changes).length === 0 && !request.noteEntry) {
      onCancel()
      return
    }
    setSaving(true)
    setError(null)
    try {
      onSaved(await api.edit(db, from.id, request))
    } catch (reason) {
      const theirs = reason instanceof ApiError && reason.code === STALE ? reason.bead : undefined
      if (!theirs) {
        setError((reason as Error).message)
        return
      }
      const fields = changedFields(before, editableOf(theirs))
      if (fields.length === 0 && !retried) {
        setBase(theirs)
        await save(theirs, values, true)
        return
      }
      const edited = changedFields(before, values)
      setConflict({
        theirs,
        fields,
        choices: Object.fromEntries(fields.map((field) => [field, edited.includes(field) ? 'mine' : 'theirs'])),
      })
    } finally {
      setSaving(false)
    }
  }

  const applyChoices = () => {
    if (!conflict) return
    const theirs = editableOf(conflict.theirs)
    const merged = { ...draft }
    for (const field of conflict.fields) {
      if (conflict.choices[field] === 'theirs') Object.assign(merged, { [field]: theirs[field] })
    }
    setDraft(merged)
    setBase(conflict.theirs)
    setConflict(null)
    void save(conflict.theirs, merged)
  }

  if (conflict) {
    return (
      <ConflictView
        mine={draft}
        conflict={conflict}
        saving={saving}
        onChoose={(field, choice) =>
          setConflict((current) => current && { ...current, choices: { ...current.choices, [field]: choice } })
        }
        onApply={applyChoices}
        onCancel={onCancel}
      />
    )
  }

  const closing = closes(editableOf(base), draft)

  return (
    <form
      aria-label="Edit the bead"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save(base, draft)
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>The page could not save the edit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Row label="Title">{(id) => <Input id={id} value={draft.title} onChange={(event) => set('title', event.target.value)} />}</Row>
      <div className="grid grid-cols-3 gap-2">
        <Row label="Status">
          {(id) => (
            <NativeSelect id={id} value={draft.status} onChange={(event) => set('status', event.target.value)}>
              {[...new Set([...STATUSES, draft.status])].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </NativeSelect>
          )}
        </Row>
        <Row label="Priority">
          {(id) => (
            <NativeSelect id={id} value={draft.priority} onChange={(event) => set('priority', Number(event.target.value))}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  P{priority}
                </option>
              ))}
            </NativeSelect>
          )}
        </Row>
        <Row label="Type">
          {(id) => (
            <NativeSelect id={id} value={draft.issue_type} onChange={(event) => set('issue_type', event.target.value)}>
              {[...new Set([...TYPES, draft.issue_type])].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </NativeSelect>
          )}
        </Row>
      </div>
      {closing && (
        <Row label="Close reason">
          {(id) => <Textarea id={id} aria-required value={closeReason} onChange={(event) => setCloseReason(event.target.value)} />}
        </Row>
      )}
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <Row label="Labels">
          {(id) => (
            <Input
              id={id}
              defaultValue={otherLabels(draft.labels).join(', ')}
              onChange={(event) => {
                const complexity = complexityOf(draft.labels)
                set('labels', [...words(event.target.value), ...(complexity ? [`complexity:${complexity}`] : [])])
              }}
            />
          )}
        </Row>
        <Row label="Complexity">
          {(id) => (
            <NativeSelect
              id={id}
              value={complexityOf(draft.labels)}
              onChange={(event) =>
                set('labels', [
                  ...otherLabels(draft.labels),
                  ...(event.target.value ? [`complexity:${event.target.value}`] : []),
                ])
              }
            >
              <option value="">none</option>
              {COMPLEXITY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          )}
        </Row>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Parent">
          {(id) => <Input id={id} value={draft.parent} onChange={(event) => set('parent', event.target.value.trim())} />}
        </Row>
        <Row label="Dependencies">
          {(id) => (
            <Input
              id={id}
              defaultValue={draft.dependencies.join(', ')}
              onChange={(event) => set('dependencies', words(event.target.value))}
            />
          )}
        </Row>
      </div>
      <Row label="Description">
        {(id) => <Textarea id={id} value={draft.description} onChange={(event) => set('description', event.target.value)} />}
      </Row>
      <Row label="Notes">
        {(id) => <Textarea id={id} value={draft.notes} onChange={(event) => set('notes', event.target.value)} />}
      </Row>
      <Row label="New note entry">
        {(id) => (
          <Textarea
            id={id}
            placeholder="The page adds the date and the time"
            value={noteEntry}
            onChange={(event) => setNoteEntry(event.target.value)}
          />
        )}
      </Row>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
