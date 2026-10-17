import { shortId } from '@/lib/ids'

export function BeadId({ id, className }: { id: string; className?: string }) {
  return (
    <span title={id} className={className}>
      {shortId(id)}
    </span>
  )
}
