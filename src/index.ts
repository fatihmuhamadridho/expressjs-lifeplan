import 'dotenv/config';
import express, { Request, Response, Router } from 'express';
import type { Server } from 'node:http';
import cors from 'cors';
import { closeMongoDB, connectMongoDB, ensureDatabaseIndexes } from '@common/configs/mongodb';
import { createAuthMiddleware } from '@common/middlewares/auth.middleware';
import { apiErrorHandler } from '@common/utils/api';
import { GoalController, GoalRepositoryImpl, createGoalRouter } from '@features/Goal';
import { PlanController, PlanRepositoryImpl, createPlanRouter } from '@features/Plan';
import { ReportController, ReportRepositoryImpl, createReportRouter } from '@features/Report';
import { TaskController, TaskRepositoryImpl, createTaskRouter } from '@features/Task';
import { VisionController, VisionRepositoryImpl, createVisionRouter } from '@features/Vision';
import { AuthController, AuthRepositoryImpl, createAuthRouter, createProfileRouter } from '@features/User';
import { httpLogger } from '@common/utils/httpLogger';
import { logger } from '@common/utils/logger';

const app = express();

app.use(cors());
app.use(express.json());
app.use(httpLogger);

app.get('/', (_req: Request, res: Response) => {
  res.json({ name: 'LifePlan API', version: 'v1', status: 'ok' });
});

const PORT = process.env.PORT || 4000;

async function createApiRouter(): Promise<Router> {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  const database = await connectMongoDB();
  await ensureDatabaseIndexes(database);
  const authorize = createAuthMiddleware(jwtSecret);
  const taskRepository = new TaskRepositoryImpl(database);
  const planRepository = new PlanRepositoryImpl(database);
  const goalRepository = new GoalRepositoryImpl(database);
  const authController = new AuthController(new AuthRepositoryImpl(database), jwtSecret);

  router.use(createAuthRouter(authController));
  router.use(createProfileRouter(authController, authorize));
  router.use(createTaskRouter(new TaskController(taskRepository), authorize));
  router.use(createGoalRouter(new GoalController(goalRepository), authorize));
  router.use(createPlanRouter(new PlanController(planRepository), authorize));
  router.use(createReportRouter(new ReportController(new ReportRepositoryImpl(database)), authorize));
  router.use(createVisionRouter(new VisionController(new VisionRepositoryImpl(database)), authorize));
  return router;
}

let apiRouterPromise: Promise<Router> | undefined;

function getApiRouter(): Promise<Router> {
  apiRouterPromise ??= createApiRouter().catch((error: unknown) => {
    apiRouterPromise = undefined;
    throw error;
  });
  return apiRouterPromise;
}

app.use('/api/v1', async (req, res, next) => {
  try {
    const router = await getApiRouter();
    router(req, res, next);
  } catch (error) {
    next(error);
  }
});
app.use((_req: Request, res: Response) =>
  res.status(404).json({ error: { code: 'not_found', message: 'Route was not found.' } })
);
app.use(apiErrorHandler);

export default app;

async function startServer(): Promise<void> {
  await getApiRouter();
  const server: Server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down server');
    server.close((error) => {
      if (error) {
        logger.error({ error }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }

      void closeMongoDB().catch((closeError: unknown) => {
        logger.error({ error: closeError }, 'MongoDB shutdown failed');
        process.exitCode = 1;
      });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (!process.env.VERCEL) {
  void startServer().catch(async (error: unknown) => {
    logger.error(
      { message: error instanceof Error ? error.message : 'Unknown startup error' },
      'Application startup failed'
    );
    await closeMongoDB();
    process.exitCode = 1;
  });
}
