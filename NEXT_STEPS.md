# Step-by-Step: Create Razorpay Plan & Webhook

## ✅ Step 1: API Keys Configured

Your API keys are now configured:
- Key ID: `rzp_test_SEpU0ShVSLIxGk`
- Secret Key: `6oZmPBzsHurScH7EntTNcoVN`

---

## 📋 Step 2: Create Subscription Plan

### Go to Razorpay Dashboard → **Subscriptions** → **Plans**

1. Click **"+ Create Plan"** button

2. Fill in the form:
   ```
   Plan Name: OpenClaw Monthly Basic

   Billing Amount:
   - Enter amount (e.g., 499 for ₹499)
   - Note: This is in paise (₹4.99) or rupees (₹499) depending on UI

   Billing Interval: Every 1 Month

   Billing Cycles: 0 (for unlimited/recurring)

   Description: Monthly subscription for OpenClaw hosting
   ```

3. Click **"Create Plan"**

4. **Copy the Plan ID** that appears (looks like `plan_MXXXxxxxxxxxxxxx`)

### Paste the Plan ID here once you have it, and I'll update the configuration.

---

## 🔗 Step 3: Setup Webhook (We'll do this after Plan ID)

We'll use **ngrok** to create a public URL for local testing.

### Steps (I'll help you with this next):
1. Install ngrok
2. Start ngrok tunnel
3. Get the public HTTPS URL
4. Configure webhook in Razorpay dashboard
5. Copy webhook secret

---

## ⏳ Waiting For:
**Please create the subscription plan and paste the Plan ID here.**

Format:
```
RAZORPAY_PLAN_MONTHLY_BASIC=plan_MXXXxxxxxxxxxxxx
```
