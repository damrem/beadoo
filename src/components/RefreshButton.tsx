import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const timeOf = (date: Date): string =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function RefreshButton({
  lastRead,
  loading,
  onRefresh,
}: {
  lastRead: Date | null
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{lastRead ? `Read at ${timeOf(lastRead)}` : 'Not read yet'}</span>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCwIcon className={cn(loading && 'animate-spin')} />
        Refresh
      </Button>
    </div>
  )
}
