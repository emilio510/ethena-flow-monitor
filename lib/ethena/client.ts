import "server-only"

const ENDPOINT = "https://app.ethena.fi"
const DEFAULT_TIMEOUT_MS = 15_000

export class EthenaError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Ethena API error ${status}`)
    this.name = "EthenaError"
  }
}

export class EthenaTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Ethena API timed out after ${timeoutMs}ms`)
    this.name = "EthenaTimeoutError"
  }
}

/** Thin GET wrapper over Ethena's public transparency endpoints
 *  (e.g. /api/collateralization/status, /api/positions/current/collateral).
 *  Unauthenticated, JSON-only, no rate limit observed at our cadence. */
export async function ethenaFetch<T = unknown>(
  path: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // app.ethena.fi sits behind a CDN that 403s the default Node UA;
        // pose as a regular browser so the public transparency endpoints
        // respond. We're not bypassing auth — these paths have none.
        "User-Agent":
          "Mozilla/5.0 (compatible; EthenaFlowMonitor/1.0; +https://ethena-flow-monitor.vercel.app)",
        Accept: "application/json",
      },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new EthenaTimeoutError(timeoutMs)
    }
    throw err
  }
  if (!res.ok) {
    const body = await res.text()
    throw new EthenaError(res.status, body.slice(0, 500))
  }
  return (await res.json()) as T
}
