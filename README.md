# LifePlan API

## Local development

Install dependencies with `pnpm install`, copy `.env.example` to `.env`, configure MongoDB and a JWT secret of at least 32 characters, then run `pnpm dev`. Run `pnpm start` for the standalone server. The TypeScript runtime resolves the project's import aliases.

## Deploy to Vercel

Import the `expressjs-lifeplan` repository and select the **Express** framework preset. Set Root Directory to the repository root. Keep Build Command and Output Directory at the preset defaults; do not set the output directory to `dist` or use `pnpm start` as a build command. Vercel detects `src/index.ts` and its default Express app export, and handles all routes without custom rewrites.

Configure these environment variables for the deployment environment before redeploying:

| Variable           | Required value                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URL`      | A reachable MongoDB connection string, such as MongoDB Atlas; localhost is not reachable from Vercel.                 |
| `MONGODB_DATABASE` | The database name.                                                                                                    |
| `JWT_SECRET`       | A private random secret with at least 32 characters. Keep it stable across deployments to preserve existing sessions. |
| `NODE_ENV`         | `production` to use JSON logging without the development pretty logger.                                               |

Use a supported Node.js version compatible with MongoDB Driver 7 (Node.js 22 or newer). Configure MongoDB network access to allow connections from your Vercel deployment. Week duplication requires MongoDB transactions, so use a replica set such as Atlas.

The `/` endpoint reports process availability. API routes under `/api/v1` initialize MongoDB and indexes once per warm instance; concurrent requests share that initialization. Initialization failures go through the API error handler and can be retried on a later request. A healthy `/` response alone does not confirm database connectivity.

If a deployment returns 500, inspect Vercel Runtime Logs. Check missing environment variables, MongoDB network access and credentials, and index creation errors. Environment changes require a new deployment.
