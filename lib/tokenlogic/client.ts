import { env } from "@/config/env"

export class TokenLogicError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`TokenLogic API ${status} on ${path}: ${body.slice(0, 200)}`)
  }
}

export async function tlFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${env.TOKENLOGIC_API_BASE_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TOKENLOGIC_API_KEY}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text()
    throw new TokenLogicError(res.status, path, body)
  }
  return (await res.json()) as T
}
