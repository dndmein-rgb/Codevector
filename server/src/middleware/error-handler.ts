import type { ErrorRequestHandler, Request, Response } from 'express';
import { InvalidQueryError } from '../modules/products/products.service.js';
import { isProduction } from '../config/env.js';

/**
 * Single place that decides how a thrown error becomes an HTTP response.
 * Domain-specific errors (like InvalidQueryError) map to a clean 4xx with
 * a useful message; anything unrecognized is logged server-side and
 * returned as a generic 500 — we don't leak internal error details
 * (stack traces, SQL text) to the client in production.
 */
export const errorHandler: ErrorRequestHandler = (err, req: Request, res: Response, _next) => {
  if (err instanceof InvalidQueryError) {
    res.status(400).json({ error: 'invalid_query', issues: err.issues });
    return;
  }

  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);

  res.status(500).json({
    error: 'internal_server_error',
    message: isProduction ? 'Something went wrong.' : String(err),
  });
};

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'not_found', path: req.path });
}
