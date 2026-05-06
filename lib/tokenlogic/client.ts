import { env } from "@/config/env"

const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Error thrown by tlFetch on non-2xx responses.
 * The user-visible `message` carries only the status code so neither the
 * upstream response body nor the internal API path leak into the browser
 * (error.tsx logs `error.message` to the client console). Server-side
 * handlers can still inspect `.path` and `.body` for diagnostics.
 */
export class TokenLogicError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`TokenLogic API error ${status}`)
    this.name = "TokenLogicError"
  }
}

export class TokenLogicTimeoutError extends Error {
  constructor(public path: string, public timeoutMs: number) {
    super(`TokenLogic API timed out after ${timeoutMs}ms`)
    this.name = "TokenLogicTimeoutError"
  }
}

/**
 * Authenticated fetch wrapper. Callers MUST validate the JSON shape with a
 * zod schema; the `T` generic is a typing hint only — no runtime check.
 */
export async function tlFetch<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const url = `${env.TOKENLOGIC_API_BASE_URL}${path}`
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.TOKENLOGIC_API_KEY}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new TokenLogicTimeoutError(path, timeoutMs)
    }
    throw err
  }
  if (!res.ok) {
    const body = await res.text()
    throw new TokenLogicError(res.status, path, body)
  }
  return (await res.json()) as T
}
