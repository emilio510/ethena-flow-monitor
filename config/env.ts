import "server-only"
import { z } from "zod"

const Schema = z.object({
  TOKENLOGIC_API_KEY: z.string().min(1, "TOKENLOGIC_API_KEY is required"),
  TOKENLOGIC_API_BASE_URL: z.string().url().default("https://api.tokenlogic.xyz"),
})

export type Env = z.infer<typeof Schema>

export const env: Env = Schema.parse({
  TOKENLOGIC_API_KEY: process.env.TOKENLOGIC_API_KEY,
  TOKENLOGIC_API_BASE_URL: process.env.TOKENLOGIC_API_BASE_URL,
})
