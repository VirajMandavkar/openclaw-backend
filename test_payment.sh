#!/bin/bash
# Razorpay Payment Flow Test Script

echo "=== Testing Razorpay Integration ==="
echo ""

# Step 1: Login
echo "[1/4] Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@integration.com","password":"Test123!@#"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Check existing subscription
echo "[2/4] Checking subscription status..."
SUB_CHECK=$(curl -s -X GET http://localhost:3000/api/payments/subscription \
  -H "Authorization: Bearer $TOKEN")

echo "$SUB_CHECK"
echo ""

# Step 3: Create checkout (if no active subscription)
echo "[3/4] Creating Razorpay checkout..."
CHECKOUT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"plan_id":"plan_SEpaLM5SfcAXtI"}')

echo "$CHECKOUT_RESPONSE"
echo ""

# Extract short_url
SHORT_URL=$(echo $CHECKOUT_RESPONSE | grep -o '"short_url":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$SHORT_URL" ]; then
  echo "✅ Checkout created successfully!"
  echo ""
  echo "=== NEXT STEPS ==="
  echo "1. Open this URL in your browser:"
  echo "   $SHORT_URL"
  echo ""
  echo "2. Use Razorpay test card:"
  echo "   Card: 4111 1111 1111 1111"
  echo "   CVV: Any 3 digits (e.g., 123)"
  echo "   Expiry: Any future date"
  echo "   Name: Any name"
  echo ""
  echo "3. After payment, check subscription status:"
  echo "   curl -H 'Authorization: Bearer $TOKEN' http://localhost:3000/api/payments/subscription"
else
  echo "⚠️  Checkout response:"
  echo "$CHECKOUT_RESPONSE"
fi

echo ""
echo "=== JWT Token (save this) ==="
echo "$TOKEN"
