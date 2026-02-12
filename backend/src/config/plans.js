/**
 * Plan Metadata
 * Maps Razorpay plan IDs to product-facing plan information
 *
 * This provides a clean abstraction layer between payment provider
 * and product features. Frontend never sees Razorpay IDs.
 */

const PLAN_METADATA = {
  'plan_SEpaLM5SfcAXtI': {
    name: 'Pro',
    interval: 'monthly',
    price: 499,
    currency: 'INR',
    workspace_limit: 5,
    features: [
      '5 Concurrent Workspaces',
      'Unlimited Sessions',
      'Email Support',
      'Auto-save & Resume',
    ],
  },
  // Future plans can be added here
  // 'plan_annual_pro': { ... },
  // 'plan_team': { ... },
};

/**
 * Get plan metadata by Razorpay plan ID
 * @param {string} razorpayPlanId - Razorpay plan identifier
 * @returns {Object|null} Plan metadata or null if not found
 */
function getPlanMetadata(razorpayPlanId) {
  return PLAN_METADATA[razorpayPlanId] || null;
}

/**
 * Get default plan (Pro monthly)
 * @returns {Object} Default plan metadata
 */
function getDefaultPlan() {
  return {
    name: 'Free',
    interval: 'none',
    price: 0,
    currency: 'INR',
    workspace_limit: 0,
    features: [],
  };
}

module.exports = {
  PLAN_METADATA,
  getPlanMetadata,
  getDefaultPlan,
};
