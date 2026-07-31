# Deployment Guide for Lumina Admin Backend

## Production prerequisites
- PostgreSQL database available and configured
- AI recommendation service running if used by frontend
- Stripe keys for payments
- Environment variables configured in `.env`

## Local production run
1. Copy the example environment file:
   ```powershell
   copy .env.example .env
   ```
2. Update `.env` with your actual database and API settings.
3. Install dependencies:
   ```powershell
   npm install
   ```
4. Start the app in production mode:
   ```powershell
   set NODE_ENV=production
   npm run start:prod
   ```

## Docker deployment
From the repository root:

```powershell
docker build -f back_end/admin_backend/Dockerfile -t lumina-admin-backend .
docker run -d -p 5000:5000 --name lumina-admin-backend --env-file back_end/admin_backend/.env lumina-admin-backend
```

If you need a local `.env` file, copy the example first:

```powershell
copy back_end/admin_backend\.env.example back_end/admin_backend\.env
```

Then edit `back_end/admin_backend/.env` with your real credentials and keys.

## Production checks
- Verify `http://localhost:5000/api/health`
- Confirm static pages are available through the unified server
- Ensure `FRONTEND_ORIGIN` matches the URL of your deployed frontend
