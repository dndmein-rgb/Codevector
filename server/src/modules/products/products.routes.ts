import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { getCategories, getProducts, getStats } from './products.controller.js';

export const productsRouter = Router();

/**
 * GET /products?limit=20&cursor=<id>&category=<name>
 * Newest-first, keyset-paginated, optionally filtered by category.
 */
productsRouter.get('/products', asyncHandler(getProducts));

/** GET /categories — distinct category list, for building a filter UI. */
productsRouter.get('/categories', asyncHandler(getCategories));

/** GET /stats — total product count (cheap, unfiltered COUNT(*) only). */
productsRouter.get('/stats', asyncHandler(getStats));
