import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { CheckIcon, LinkIcon } from 'lucide-react'
import { BeadId } from '@/components/BeadId'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { absoluteUrl, beadUrl } from '@/lib/urls'

const plainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

export function BeadLink({
  db,
  id,
  onOpen,
  className,
  children,
}: {
  db: string
  id: string
  onOpen?: (id: string) => void
  className?: string
  children?: ReactNode
}) {
  return (
    <a
      href={beadUrl(db, id)}
      className={cn('font-mono underline', className)}
      onClick={(event) => {
        if (!onOpen || !plainClick(event)) return
        event.preventDefault()
        onOpen(id)
      }}
    >
      {children ?? <BeadId id={id} />}
    </a>
  )
}

export function CopyLinkButton({ db, id }: { db: string; id: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      ?.writeText(absoluteUrl(beadUrl(db, id)))
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }
  return (
    <Button size="xs" variant="ghost" onClick={copy} title="Copy the link of the bead page">
      {copied ? <CheckIcon /> : <LinkIcon />}
      {copied ? 'Link copied' : 'Copy link'}
    </Button>
  )
}
