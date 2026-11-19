import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../../common/middlewares/auth.middleware.js';
import { asyncRoute } from '../../../common/utils/api.js';
import type { VisionController } from './vision.controller';

export function createVisionRouter(controller: VisionController, authorize: RequestHandler): Router {
  const router = Router();
  router.use(authorize);
  router.get(
    '/vision',
    asyncRoute((req, res) => controller.handleGet(req as AuthenticatedRequest, res))
  );
  router.put(
    '/vision',
    asyncRoute((req, res) => controller.handleSave(req as AuthenticatedRequest, res))
  );
  router.get(
    '/vision/wishlist',
    asyncRoute((req, res) => controller.handleListWishlist(req as AuthenticatedRequest, res))
  );
  router.post(
    '/vision/wishlist',
    asyncRoute((req, res) => controller.handleCreateWishlistItem(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/vision/wishlist/:id',
    asyncRoute((req, res) => controller.handleUpdateWishlistItem(req as AuthenticatedRequest, res))
  );
  router.delete(
    '/vision/wishlist/:id',
    asyncRoute((req, res) => controller.handleDeleteWishlistItem(req as AuthenticatedRequest, res))
  );
  return router;
}
