import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../../common/middlewares/auth.middleware.js';
import { asyncRoute } from '../../../common/utils/api.js';
import type { ReportController } from './report.controller';

export function createReportRouter(controller: ReportController, authorize: RequestHandler): Router {
  const router = Router();
  router.use(authorize);
  router.get(
    '/reports/overview',
    asyncRoute((req, res) => controller.handleOverview(req as AuthenticatedRequest, res))
  );
  router.get(
    '/reports/weekly',
    asyncRoute((req, res) => controller.handleWeekly(req as AuthenticatedRequest, res))
  );
  return router;
}
