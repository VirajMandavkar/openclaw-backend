# Deploy OpenClaw Backend to Render

## Prerequisites

- GitHub account
- Render account (sign up at https://render.com)
- Razorpay test credentials

---

## Step 1: Push Code to GitHub

1. **Initialize Git** (if not already done):
```bash
cd c:\Users\manda\OneDrive\Desktop\wrapper
git init
git add .
git commit -m "Initial commit - OpenClaw backend ready for deployment"
```

2. **Create GitHub repository**:
   - Go to https://github.com/new
   - Name: `openclaw-backend` (or your preferred name)
   - Set to **Private**
   - Don't initialize with README (we already have code)
   - Click **Create repository**

3. **Push code to GitHub**:
```bash
git remote add origin https://github.com/YOUR_USERNAME/openclaw-backend.git
git branch -M main
git push -u origin main
```

---

## Step 2: Create PostgreSQL Database on Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `openclaw-db`
   - **Database**: `openclaw_saas`
   - **User**: `openclaw_user`
   - **Region**: Singapore (or closest to you)
   - **Plan**: **Free**
4. Click **"Create Database"**
5. Wait for provisioning (2-3 minutes)
6. **Copy the Internal Database URL** (starts with `postgresql://`)

---

## Step 3: Deploy Backend Service

### Option A: Using Blueprint (Automated)

1. Click **"New +"** → **"Blueprint"**
2. Connect your GitHub repository
3. Render will auto-detect `render.yaml`
4. Click **"Apply"**
5. Skip to Step 4

### Option B: Manual Setup

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `openclaw-backend`
3. Configure:
   - **Name**: `openclaw-backend`
   - **Region**: Singapore
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Environment**: **Docker**
   - **Dockerfile Path**: `./Dockerfile`
   - **Plan**: **Free**
4. **Health Check Path**: `/health`
5. Click **"Create Web Service"**

---

## Step 4: Configure Environment Variables

In your Render service dashboard, go to **"Environment"** and add:

### Required Variables

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `DATABASE_URL` | `<Internal DB URL from Step 2>` | Copy from database dashboard |
| `JWT_SECRET` | `<generate random 64-char string>` | Use: `openssl rand -hex 32` |
| `FRONTEND_URL` | `http://localhost:5173` | Update later when frontend deployed |
| `RAZORPAY_KEY_ID` | `rzp_test_SEpU0ShVSLIxGk` | Your test key |
| `RAZORPAY_KEY_SECRET` | `6oZmPBzsHurScH7EntTNcoVN` | Your test secret |
| `RAZORPAY_WEBHOOK_SECRET` | `248c10e539867e04ce6524b0ce093c56dab590823543df7c0f6d35753d7791b5` | Current webhook secret |
| `RAZORPAY_PLAN_MONTHLY_BASIC` | `plan_SEpaLM5SfcAXtI` | Your plan ID |
| `OPENCLAW_NETWORK` | `openclaw_internal` | |
| `OPENCLAW_PORT` | `3000` | |

Click **"Save Changes"** - service will auto-redeploy.

---

## Step 5: Run Database Migrations

After deployment succeeds:

1. Go to your service → **"Shell"** tab
2. Run migrations:
```bash
psql $DATABASE_URL < /app/migrations/001_initial_schema.sql
```

**OR** connect from local machine:
```bash
psql "<External Database URL from Render>" < backend/migrations/001_initial_schema.sql
```

---

## Step 6: Verify Deployment

1. **Check Health**:
   - Service URL: `https://openclaw-backend-XXXX.onrender.com`
   - Open: `https://openclaw-backend-XXXX.onrender.com/health`
   - Should return: `{"status":"healthy","database":"connected"}`

2. **Check Logs**:
   - Go to **"Logs"** tab
   - Should see: `🚀 OpenClaw Control Plane running on http://localhost:3000`

---

## Step 7: Update Razorpay Webhook URL

1. Go to: https://dashboard.razorpay.com/app/webhooks
2. Find your webhook: `https://pia-multilinear-september.ngrok-free.dev/api/webhooks/razorpay`
3. Click **"Edit"**
4. **Update URL** to: `https://openclaw-backend-XXXX.onrender.com/api/webhooks/razorpay`
   (Replace `XXXX` with your actual Render subdomain)
5. **Keep the same webhook secret**
6. Click **"Update"**

---

## Step 8: Test Production Webhooks

### Test 1: Health Check
```bash
curl https://openclaw-backend-XXXX.onrender.com/health
```

### Test 2: Create Test Subscription

1. **Register user**:
```bash
curl -X POST https://openclaw-backend-XXXX.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"prod-test@test.com","password":"TestPass123!"}'
```

2. **Login**:
```bash
curl -X POST https://openclaw-backend-XXXX.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"prod-test@test.com","password":"TestPass123!"}'
```

3. **Create checkout**:
```bash
curl -X POST https://openclaw-backend-XXXX.onrender.com/api/payments/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"plan_id":"plan_SEpaLM5SfcAXtI"}'
```

4. **Complete payment** with test UPI: `success@razorpay`

5. **Check logs** in Render dashboard - should see webhook processing

---

## Free Tier Limits

**Render Free Tier:**
- ✅ Spins down after 15 minutes of inactivity
- ✅ 750 hours/month free (enough for one service)
- ✅ PostgreSQL: 1GB storage, 97 connection limit
- ⚠️ Cold starts take ~30 seconds (first request after sleep)

**For production traffic**, upgrade to **Starter plan ($7/month)**.

---

## Troubleshooting

### Build fails
- Check Dockerfile path is correct: `backend/Dockerfile`
- Verify `package.json` has all dependencies

### Database connection fails
- Verify `DATABASE_URL` is set correctly
- Check database is in "Available" state
- Ensure migrations ran successfully

### Webhooks not received
- Check webhook URL matches Render service URL
- Verify webhook secret matches in both Razorpay and Render env vars
- Check Render logs for incoming requests

### Service keeps restarting
- Check logs for errors
- Verify all required env vars are set
- Ensure port 3000 is used (matches PORT env var)

---

## Next Steps

After successful deployment:

1. ✅ Update `FRONTEND_URL` when frontend is deployed
2. ✅ Set up custom domain (optional)
3. ✅ Enable auto-deploy on GitHub push
4. ✅ Set up monitoring/alerts
5. ✅ Switch to Razorpay live mode for production

---

## Security Notes

- Never commit `.env` files
- Rotate secrets regularly
- Use Render's encrypted environment variables
- Enable HTTPS only (Render does this automatically)
- Set up proper CORS for frontend domain
