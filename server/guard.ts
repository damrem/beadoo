import { randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_HEADER = 'x-beads-token'

export const newToken = (): string => randomBytes(32).toString('hex')

type Headers = Record<string, string | string[] | undefined>

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function allowsWrite(headers: Headers, origin: string, token: string): boolean {
  const sentOrigin = headers.origin
  const sentToken = headers[TOKEN_HEADER]
  return (
    typeof sentOrigin === 'string' &&
    typeof sentToken === 'string' &&
    sentOrigin === origin &&
    sameText(sentToken, token)
  )
}
