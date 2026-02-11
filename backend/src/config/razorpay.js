/**
 * Razorpay Configuration
 * Sets up Razorpay SDK for payment processing
 *
 * IMPORTANT: Never log or expose API secrets
 */

const Razorpay = require('razorpay');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required Razorpay environment variables:', missingEnvVars);
  console.error('Please configure these in your .env file');
  // Don't throw in development if using placeholder values
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing Razorpay configuration: ${missingEnvVars.join(', ')}`);
  }
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Webhook secret for signature verification
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/**
 * Verify Razorpay webhook signature
 * Uses HMAC SHA256 to validate webhook authenticity
 *
 * @param {string} razorpaySignature - Signature from X-Razorpay-Signature header
 * @param {string} requestBody - Raw request body as string
 * @returns {boolean} - True if signature is valid
 */
function verifyWebhookSignature(razorpaySignature, requestBody) {
  const crypto = require('crypto');

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(requestBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(razorpaySignature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // timingSafeEqual throws if buffers are different lengths
    return false;
  }
}

/**
 * Razorpay plan IDs
 * Define your subscription plans here
 * These should match plans created in Razorpay dashboard
 */
const PLANS = {
  MONTHLY_BASIC: process.env.RAZORPAY_PLAN_MONTHLY_BASIC || 'plan_monthly_basic',
  // Add more plans as needed
};

module.exports = {
  razorpay,
  verifyWebhookSignature,
  WEBHOOK_SECRET,
  PLANS,
};
