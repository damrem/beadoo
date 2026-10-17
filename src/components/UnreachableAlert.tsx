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
      <AlertTitle>The database "{name}" does not answer</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {hasTunnel ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={start} disabled={starting}>
            {starting ? 'Starting the tunnel…' : 'Start the tunnel'}
          </Button>
        ) : (
          <p>beadoo.json gives no tunnel for this database. Start its Dolt server, then refresh.</p>
        )}
        {failure && <p role="status">{failure}</p>}
      </AlertDescription>
    </Alert>
  )
}
