import { PlugZapIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function UnreachableAlert({
  name,
  message,
  hasTunnel,
  onStart,
}: {
  name: string
  message: string
  hasTunnel: boolean
  onStart: () => Promise<void>
}) {
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const title = `The database "${name}" does not answer`
  const cause = message.startsWith(`${title}: `) ? message.slice(title.length + 2) : message

  const start = () => {
    setStarting(true)
    setFailure(null)
    onStart()
      .catch((reason: Error) => setFailure(reason.message))
      .finally(() => setStarting(false))
  }

  return (
    <Alert variant="destructive" className="m-4 w-auto">
      <PlugZapIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{cause}</p>
        {hasTunnel ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={start} disabled={starting}>
            {starting ? 'Starting the tunnel…' : 'Start the tunnel'}
          </Button>
        ) : (
          <p>The beadoo config gives no tunnel for this database. Start its Dolt server, then refresh.</p>
        )}
        {failure && <p role="status">{failure}</p>}
      </AlertDescription>
    </Alert>
  )
}
