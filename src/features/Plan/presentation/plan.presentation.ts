import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '@common/middlewares/auth.middleware';
import { asyncRoute } from '@common/utils/api';
import type { PlanController } from './plan.controller';

export function createPlanRouter(controller: PlanController, authorize: RequestHandler): Router {
  const router = Router();
  router.use(authorize);
  router.get(
    '/plans',
    asyncRoute((req, res) => controller.handleListPlans(req as AuthenticatedRequest, res))
  );
  router.post(
    '/plans',
    asyncRoute((req, res) => controller.handleCreatePlan(req as AuthenticatedRequest, res))
  );
  router.get(
    '/plans/:id',
    asyncRoute((req, res) => controller.handleGetPlan(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/plans/:id',
    asyncRoute((req, res) => controller.handleUpdatePlan(req as AuthenticatedRequest, res))
  );
  router.delete(
    '/plans/:id',
    asyncRoute((req, res) => controller.handleDeletePlan(req as AuthenticatedRequest, res))
  );
  router.get(
    '/weeks',
    asyncRoute((req, res) => controller.handleListWeeks(req as AuthenticatedRequest, res))
  );
  router.post(
    '/weeks',
    asyncRoute((req, res) => controller.handleCreateWeek(req as AuthenticatedRequest, res))
  );
  router.post(
    '/weeks/:id/duplicate',
    asyncRoute((req, res) => controller.handleDuplicateWeek(req as AuthenticatedRequest, res))
  );
  router.get(
    '/weeks/:id',
    asyncRoute((req, res) => controller.handleGetWeek(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/weeks/:id',
    asyncRoute((req, res) => controller.handleUpdateWeek(req as AuthenticatedRequest, res))
  );
  router.delete(
    '/weeks/:id',
    asyncRoute((req, res) => controller.handleDeleteWeek(req as AuthenticatedRequest, res))
  );
  return router;
}
