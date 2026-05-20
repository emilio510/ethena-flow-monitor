import "server-only"

const ENDPOINT = "https://blue-api.morpho.org/graphql"
const DEFAULT_TIMEOUT_MS = 20_000

export class MorphoError extends Error {
  constructor(public status: number, public body: string) {
    super(`Morpho API error ${status}`)
    this.name = "MorphoError"
  }
}

export class MorphoTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Morpho API timed out after ${timeoutMs}ms`)
    this.name = "MorphoTimeoutError"
  }
}

export async function morphoQuery<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new MorphoTimeoutError(timeoutMs)
    }
    throw err
  }
  if (!res.ok) {
    const body = await res.text()
    throw new MorphoError(res.status, body)
  }
  const json = (await res.json()) as {
    data?: T
    errors?: Array<{ message: string; status?: string }>
  }
  if (json.errors && json.errors.length > 0) {
    // Surface NOT_FOUND as a typed signal so callers can treat it as
    // "wallet has never used this product on this chain" (a normal answer)
    // instead of a fatal fetch error. Any other error kind still escalates.
    const allNotFound = json.errors.every((e) => e.status === "NOT_FOUND")
    if (allNotFound) {
      throw new MorphoNotFoundError(json.errors.map((e) => e.message).join("; "))
    }
    throw new MorphoError(200, json.errors.map((e) => e.message).join("; "))
  }
  if (!json.data) {
    throw new MorphoError(200, "Morpho response missing data field")
  }
  return json.data
}

export class MorphoNotFoundError extends Error {
  constructor(public detail: string) {
    super(`Morpho NOT_FOUND: ${detail}`)
    this.name = "MorphoNotFoundError"
  }
}
