const BASE_URL = "https://app.ethena.fi/api"
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Ethena's CDN (Cloudflare) 403s requests from Vercel's serverless egress
 * when no User-Agent header is sent — server-side `fetch` in Node 20+ omits
 * it by default. We send a generic monitoring UA so requests succeed on
 * Vercel while still being honest about what we are.
 *
 * Background: a prior version of this codebase hit the same CDN block and
 * solved it the same way (commit e4983a233). The fix got reverted alongside
 * the CEX feature rollback; reapplying here so the public-API source-of-truth
 * path doesn't silently fall back to on-chain only in production.
 */
const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent": "ethena-flow-monitor/1.0 (+https://ethena-flow-monitor.vercel.app)",
  Accept: "application/json",
}

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
      headers: { ...DEFAULT_HEADERS, ...(init?.headers ?? {}) },
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
