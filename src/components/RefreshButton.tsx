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
  const readText = lastRead ? `Read at ${timeOf(lastRead)}` : 'Not read yet'
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span title={readText}>{lastRead ? timeOf(lastRead) : 'Not read'}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Refresh"
        title="Refresh"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCwIcon className={cn(loading && 'animate-spin')} />
      </Button>
    </div>
  )
}
