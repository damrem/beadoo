export const HOST = '127.0.0.1'
export const DEFAULT_PORT = 4747

export type ServerAddress = { port: number; origin: string; publicOrigin?: string }

type Env = Record<string, string | undefined>

export function serverAddress(env: Env): ServerAddress | string {
  const text = env.PORT?.trim() || String(DEFAULT_PORT)
  const port = Number(text)
  if (!/^\d+$/.test(text) || port < 1 || port > 65535) return `PORT must be a number from 1 to 65535, and not "${text}".`
  const origin = `http://${HOST}:${port}`
  const publicUrl = env.PORTLESS_URL?.trim()
  if (!publicUrl) return { port, origin }
  if (!URL.canParse(publicUrl)) return `PORTLESS_URL must be a URL, and not "${publicUrl}".`
  return { port, origin, publicOrigin: new URL(publicUrl).origin }
}
