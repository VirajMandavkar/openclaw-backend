# Razorpay Configuration Guide

## Step 1: Provide Your Test Credentials

I need the following from your Razorpay Dashboard:

### 1. API Keys (Settings → API Keys)
- **Key ID**: Should start with `rzp_test_`
- **Key Secret**: Long alphanumeric string

### 2. Plan ID (Subscriptions → Plans)
- The Plan ID of the subscription plan you created
- Example: `plan_MXXXxxxxxxxxxxxx`

### 3. Webhook Secret (Settings → Webhooks)
- If you've already configured webhooks, copy the secret
- If not, we'll configure it after setting up ngrok

## Step 2: How to Configure

Once you provide these, I'll update:
- `backend/.env` file
- `docker-compose.yml` file
- Restart the backend

## Step 3: Test Flow

After configuration:
1. Setup ngrok for webhook testing
2. Complete a test payment
3. Verify webhook events
4. Confirm subscription activation

---

**Please provide your Razorpay test credentials so I can configure the system.**

Format:
```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=yyyyyyyyyyyyyyyyyyyy
RAZORPAY_PLAN_MONTHLY_BASIC=plan_zzzzzzzzzzzzz
RAZORPAY_WEBHOOK_SECRET=wwwwwwwwwwwwwwwwwwww (if you have it)
```
