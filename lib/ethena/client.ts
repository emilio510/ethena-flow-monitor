const BASE_URL = "https://app.ethena.fi/api"
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Ethena's CDN (Cloudflare) returns an HTML anti-bot challenge instead of
 * the JSON payload when a request looks too synthetic. From Vercel's egress
 * a bare `fetch` lands on the challenge page; the response is 200 OK with
 * a `<!DOCTYPE>` body that fails our JSON parse downstream.
 *
 * Mimicking a real browser tap (UA + Referer + Origin + Sec-Fetch-* +
 * Accept-Language) unlocks the JSON path. The Referer/Origin pair is the
 * load-bearing pair — CF whitelists requests that look like they originated
 * from the dashboard itself.
 */
const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://app.ethena.fi/dashboards/backing-assets",
  Origin: "https://app.ethena.fi",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
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
  // Cloudflare anti-bot can return 200 OK with an HTML challenge page. The
  // downstream JSON parse fails with a cryptic SyntaxError — surface it as a
  // typed error so the caller (and Vercel logs) know the real cause.
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("json")) {
    const body = await res.text()
    throw new EthenaCdnChallengeError(contentType, body.slice(0, 200))
  }
  return (await res.json()) as T
}

export class EthenaCdnChallengeError extends Error {
  constructor(public contentType: string, public bodyPreview: string) {
    super(`Ethena CDN returned ${contentType || "non-JSON"} (likely anti-bot challenge)`)
    this.name = "EthenaCdnChallengeError"
  }
}
