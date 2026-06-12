const DEFAULT_TIMEOUT_MS = 15_000

/** Cloudflare-fronted APIs (Kamino, Fluid) can 403 requests with no UA on
 *  serverless egress. Same UA approach as lib/ethena/client.ts. */
const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent": "ethena-flow-monitor/1.0 (+https://ethena-flow-monitor.vercel.app)",
  Accept: "application/json",
}

export class SolanaApiError extends Error {
  constructor(public source: "kamino" | "fluid" | "solana-rpc", public status: number, public path: string, public body: string) {
    super(`${source} API error ${status}`)
    this.name = "SolanaApiError"
  }
}

export class SolanaTimeoutError extends Error {
  constructor(public source: "kamino" | "fluid" | "solana-rpc", public path: string, public timeoutMs: number) {
    super(`${source} API timed out after ${timeoutMs}ms`)
    this.name = "SolanaTimeoutError"
  }
}

export async function kaminoFetch<T = unknown>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return jsonFetch<T>("kamino", `https://api.kamino.finance${path}`, path, timeoutMs)
}

export async function fluidFetch<T = unknown>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return jsonFetch<T>("fluid", `https://api.solana.fluid.io${path}`, path, timeoutMs)
}

async function jsonFetch<T>(source: "kamino" | "fluid" | "solana-rpc", url: string, path: string, timeoutMs: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new SolanaTimeoutError(source, path, timeoutMs)
    }
    throw err
  }
  if (!res.ok) {
    const body = await res.text()
    throw new SolanaApiError(source, res.status, path, body)
  }
  return (await res.json()) as T
}
