export type WriteQueue = <T>(task: () => Promise<T>) => Promise<T>

export function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task)
    tail = result.catch(() => undefined)
    return result
  }
}
