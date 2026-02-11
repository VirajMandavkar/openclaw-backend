@echo off
REM Razorpay Payment Flow Test Script (Windows)

echo === Testing Razorpay Integration ===
echo.

REM Step 1: Login
echo [1/4] Logging in...
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"test@integration.com\",\"password\":\"Test123!@#\"}" > login.json

REM Extract token (simplified - may need jq or PowerShell for proper parsing)
echo Check login.json for your token
echo.

REM Step 2: Create checkout (replace YOUR_TOKEN with actual token)
echo [2/4] Creating Razorpay checkout...
echo Please run this command with your token:
echo curl -X POST http://localhost:3000/api/payments/checkout -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d "{\"plan_id\":\"plan_SEpaLM5SfcAXtI\"}"
echo.

echo === Manual Testing Steps ===
echo 1. Get your token from login.json
echo 2. Run the checkout command above with your token
echo 3. Open the short_url in browser
echo 4. Use test card: 4111 1111 1111 1111
echo.

pause
