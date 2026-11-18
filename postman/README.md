# LifePlan API in Postman

Import `LifePlan API.postman_collection.json` and `environments/local.environment.yaml` into Postman. The API base URL defaults to `http://localhost:4000`, leaving port 3000 free for the Next.js app.

Start MongoDB, copy `.env.example` to `.env`, set a unique `JWT_SECRET` of at least 32 characters, and run `pnpm dev`. Then run the collection in order. **Authentication and Profile → Register** creates a throwaway test account and saves its bearer token; resource create requests save IDs automatically. The collection covers Vision and wishlist, authorization and validation, Goal archive/delete guards, Plan/Goal/Task rename propagation, and cleanup that verifies Week and Plan deletion unassign Task assignments.

The sample password is for local Postman accounts only. Do not reuse it for a real account. The API stores password hashes and never returns them.

The collection covers `POST /auth/register`, `POST /auth/login`, `GET/PATCH /me`, `POST /me/password`; CRUD for `/tasks`, `/goals`, `/plans`, and `/weeks`; nested goal milestone list/create/update/delete; overview/weekly reports; `GET/PUT /vision`; and `/vision/wishlist` list/create/update/delete. Every data endpoint requires the bearer token saved by Register or Login. Lists accept `page` and `limit`; task lists also accept `plan` and `week` filters.

`build-collection.mjs` generates the importable collection from its request definitions. Keep the generated JSON in sync when changing that script.
