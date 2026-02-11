# Ngrok Setup Guide

## Step 1: Get Your Authtoken

1. Go to: https://dashboard.ngrok.com/signup (or login if already registered)
2. After login, go to: https://dashboard.ngrok.com/get-started/your-authtoken
3. Copy the authtoken (looks like: `2abc...xyz_1234...`)

## Step 2: Configure Ngrok

Open a new terminal/PowerShell and run:
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

## Step 3: Start Ngrok Tunnel

Run this command:
```bash
ngrok http 3000
```

You should see output like:
```
Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Forwarding                    https://abc123def456.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (the one that looks like `https://abc123def456.ngrok.io`)

## Step 4: Configure Webhook in Razorpay

1. Go to Razorpay Dashboard: https://dashboard.razorpay.com/
2. Navigate to: **Settings** → **Webhooks**
3. Click **"Create New Webhook"** or **"Add Webhook URL"**
4. Enter:
   - **Webhook URL**: `https://YOUR_NGROK_URL.ngrok.io/api/webhooks/razorpay`
   - Example: `https://abc123def456.ngrok.io/api/webhooks/razorpay`
5. Select **Active Events**:
   - ✅ subscription.activated
   - ✅ subscription.charged
   - ✅ subscription.completed
   - ✅ subscription.cancelled
   - ✅ subscription.pending
   - ✅ subscription.halted
   - ✅ subscription.resumed
   - ✅ subscription.paused
   - ✅ payment.failed
6. Click **"Create Webhook"**
7. **Copy the Webhook Secret** that appears

---

## Ready?

Once you have:
1. ✅ Ngrok running
2. ✅ HTTPS URL from ngrok
3. ✅ Webhook configured in Razorpay
4. ✅ Webhook Secret copied

**Paste the Webhook Secret here and I'll update the configuration!**
