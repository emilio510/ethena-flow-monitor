const BASE_URL = "https://app.ethena.fi/api"
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Error thrown by ethenaFetch on non-2xx responses.
 * Matches the TokenLogic client shape: the user-visible `message` carries only
 * the status code so neither the upstream body nor the API path leak into
 * error.tsx on the client. Server handlers can still read `.path` and `.body`.
 */
export class EthenaApiError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`Ethena API error ${status}`)
    this.name = "EthenaApiError"
  }
}

export class EthenaTimeoutError extends Error {
  constructor(public path: string, public timeoutMs: number) {
    super(`Ethena API timed out after ${timeoutMs}ms`)
    this.name = "EthenaTimeoutError"
  }
}

/**
 * Public, unauthenticated fetch wrapper for app.ethena.fi/api endpoints.
 * Callers MUST validate the JSON with a zod schema; `T` is a typing hint only.
 */
export async function ethenaFetch<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new EthenaTimeoutError(path, timeoutMs)
    }
    throw err
  }
  if (!res.ok) {
    const body = await res.text()
    throw new EthenaApiError(res.status, path, body)
  }
  return (await res.json()) as T
}
