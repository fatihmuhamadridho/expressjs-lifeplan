import { Router, type RequestHandler } from 'express';
import { type AuthenticatedRequest } from '../../../common/middlewares/auth.middleware.js';
import { asyncRoute } from '../../../common/utils/api.js';
import type { TaskController } from './task.controller';

export function createTaskRouter(controller: TaskController, authorize: RequestHandler): Router {
  const router = Router();
  router.use(authorize);
  router.get(
    '/tasks',
    asyncRoute((req, res) => controller.handleList(req as AuthenticatedRequest, res))
  );
  router.post(
    '/tasks',
    asyncRoute((req, res) => controller.handleCreate(req as AuthenticatedRequest, res))
  );
  router.get(
    '/tasks/:id',
    asyncRoute((req, res) => controller.handleGet(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/tasks/:id',
    asyncRoute((req, res) => controller.handleUpdate(req as AuthenticatedRequest, res))
  );
  router.delete(
    '/tasks/:id',
    asyncRoute((req, res) => controller.handleDelete(req as AuthenticatedRequest, res))
  );
  return router;
}
