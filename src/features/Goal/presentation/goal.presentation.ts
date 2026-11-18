import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '@common/middlewares/auth.middleware';
import { asyncRoute } from '@common/utils/api';
import type { GoalController } from './goal.controller';

export function createGoalRouter(controller: GoalController, authorize: RequestHandler): Router {
  const router = Router();
  router.use(authorize);
  router.get(
    '/goals',
    asyncRoute((req, res) => controller.handleList(req as AuthenticatedRequest, res))
  );
  router.post(
    '/goals',
    asyncRoute((req, res) => controller.handleCreate(req as AuthenticatedRequest, res))
  );
  router.get(
    '/goals/:id',
    asyncRoute((req, res) => controller.handleGet(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/goals/:id',
    asyncRoute((req, res) => controller.handleUpdate(req as AuthenticatedRequest, res))
  );
  router.delete(
    '/goals/:id',
    asyncRoute((req, res) => controller.handleDelete(req as AuthenticatedRequest, res))
  );
  router.get(
    '/goals/:goalId/milestones',
    asyncRoute((req, res) => controller.handleListMilestones(req as AuthenticatedRequest, res))
  );
  router.post(
    '/goals/:goalId/milestones',
    asyncRoute((req, res) => controller.handleCreateMilestone(req as AuthenticatedRequest, res))
  );
  router.patch(
    '/goals/:goalId/milestones/:id',
    asyncRoute((req, res) => controller.handleUpdateMilestone(req as AuthenticatedRequest, res))
  );
  router.delete(
    '/goals/:goalId/milestones/:id',
    asyncRoute((req, res) => controller.handleDeleteMilestone(req as AuthenticatedRequest, res))
  );
  return router;
}
