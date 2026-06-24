import type { Request, Response } from 'express';
import { getProductCount, listCategories, listProducts } from './products.service.js';

/**
 * Controllers stay thin on purpose: parse what's needed from the
 * request, call the service, shape the response. No SQL, no pagination
 * math here — that lives in the service/repository so it can be tested
 * and reasoned about without spinning up an HTTP server.
 */

export async function getProducts(req: Request, res: Response): Promise<void> {
  const result = await listProducts({
    limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
    cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
  });

  res.json(result);
}

export async function getCategories(_req: Request, res: Response): Promise<void> {
  const categories = await listCategories();
  res.json({ categories });
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  const total = await getProductCount();
  res.json({ totalProducts: total });
}
