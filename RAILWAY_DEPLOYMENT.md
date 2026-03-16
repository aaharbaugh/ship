# Railway Deployment

This repo can run on Railway as a single service:

- the Docker image builds `shared`, `api`, and `web`
- the Express server serves `web/dist` in production
- REST API, WebSocket collaboration, and the frontend all use the same origin

## Recommended Railway Shape

- One Railway service from the repo root
- One Railway Postgres database
- Optional persistent volume mounted at `/app/api/uploads` if you want local file uploads to survive restarts

## Required Environment Variables

- `NODE_ENV=production`
- `PORT=${{PORT}}`
- `DATABASE_URL=<Railway Postgres connection string>`
- `SESSION_SECRET=<long random secret>`
- `APP_BASE_URL=https://<your-service-domain>`
- `CORS_ORIGIN=https://<your-service-domain>`
- `SKIP_SSM=1`

## Optional Environment Variables

- `ENVIRONMENT=railway`
- `S3_UPLOADS_BUCKET=<bucket name>` if you want S3-backed uploads
- `CDN_DOMAIN=<cdn domain>` if you want CDN-backed uploads
- `AWS_REGION=<aws region>` if using S3

If `S3_UPLOADS_BUCKET` and `CDN_DOMAIN` are not set, uploads fall back to local filesystem storage.

## Railway Service Settings

- Source directory: repo root
- Builder: Dockerfile
- Health check path: `/health`

## Deploy Steps

1. Create a new Railway project.
2. Add a Postgres database.
3. Create a service from this repo root.
4. Set the environment variables above.
5. Deploy.

## Post-Deploy Checks

1. Open the app root URL and confirm the login page loads.
2. Sign in and confirm authenticated navigation works.
3. Create/edit a document and verify autosave.
4. Open the same document in two tabs and verify collaboration updates.
5. Run the smoke gate locally before promoting confidence:

```bash
sg docker -c "cd /home/aaron/projects/gauntlet/ship/ship && pnpm run test:e2e:smoke"
```
