import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * All environment variables the app depends on, validated once at startup.
 *
 * Why validate with a schema instead of just reading process.env.X directly
 * in each file: a missing or malformed env var should be a loud, immediate
 * startup failure with a clear message — not a silent `undefined` that
 * surfaces three layers deep as a confusing runtime error (e.g. "Cannot
 * read property 'query' of undefined") the first time a request comes in.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Fix the environment variables above (see .env.example) and restart.');
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
