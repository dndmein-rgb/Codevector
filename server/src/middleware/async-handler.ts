import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express does not automatically forward rejected promises from an async
 * route handler into the error-handling middleware — an unhandled
 * rejection in an `async (req, res) => {...}` handler silently hangs the
 * request instead of returning a 500. This wraps a handler so any thrown
 * error or rejected promise is passed to `next()`, where the centralized
 * error handler (see error-handler.ts) can turn it into a proper response.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
