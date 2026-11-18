import { Router } from 'express';
import type { AuthenticatedRequest } from '@common/middlewares/auth.middleware';
import type { RequestHandler } from 'express';
import { asyncRoute } from '@common/utils/api';
import type { AuthController } from './auth.controller';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  router.post(
    '/auth/register',
    asyncRoute((req, res) => controller.handleRegister(req, res))
  );
  router.post(
    '/auth/login',
    asyncRoute((req, res) => controller.handleLogin(req, res))
  );
  return router;
}

export function createProfileRouter(controller: AuthController, authorize: RequestHandler): Router {
  const router = Router();
  router.use(authorize);
  router.get(
    '/me',
    asyncRoute((req, res) => controller.handleGetProfile(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/me',
    asyncRoute((req, res) => controller.handleUpdateProfile(req as AuthenticatedRequest, res))
  );
  router.post(
    '/me/password',
    asyncRoute((req, res) => controller.handleChangePassword(req as AuthenticatedRequest, res))
  );
  return router;
}
