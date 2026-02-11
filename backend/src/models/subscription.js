/**
 * Subscription Model
 * Handles subscription CRUD operations with parameterized queries
 * Synced with Razorpay subscription data
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Create a new subscription
 * @param {Object} subscriptionData - Subscription details
 * @returns {Promise<Object>} Created subscription
 */
async function create(subscriptionData) {
  const {
    userId,
    razorpaySubscriptionId,
    status,
    planId,
    currentPeriodStart,
    currentPeriodEnd,
  } = subscriptionData;

  try {
    const result = await db.query(
      `INSERT INTO subscriptions
       (user_id, razorpay_subscription_id, status, plan_id, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, razorpay_subscription_id, status, plan_id,
                 current_period_start, current_period_end, created_at, updated_at`,
      [userId, razorpaySubscriptionId, status, planId, currentPeriodStart, currentPeriodEnd]
    );

    logger.info('Subscription created', {
      subscriptionId: result.rows[0].id,
      userId,
      planId,
      status,
    });

    return result.rows[0];
  } catch (error) {
    logger.error('Error creating subscription', { error: error.message, userId });
    throw error;
  }
}

/**
 * Find subscription by ID
 * @param {string} subscriptionId - Subscription UUID
 * @returns {Promise<Object|null>} Subscription or null
 */
async function findById(subscriptionId) {
  const result = await db.query(
    `SELECT id, user_id, razorpay_subscription_id, status, plan_id,
            current_period_start, current_period_end, created_at, updated_at
     FROM subscriptions WHERE id = $1`,
    [subscriptionId]
  );

  return result.rows[0] || null;
}

/**
 * Find subscription by Razorpay subscription ID
 * @param {string} razorpaySubscriptionId - Razorpay subscription ID
 * @returns {Promise<Object|null>} Subscription or null
 */
async function findByRazorpayId(razorpaySubscriptionId) {
  const result = await db.query(
    `SELECT id, user_id, razorpay_subscription_id, status, plan_id,
            current_period_start, current_period_end, created_at, updated_at
     FROM subscriptions WHERE razorpay_subscription_id = $1`,
    [razorpaySubscriptionId]
  );

  return result.rows[0] || null;
}

/**
 * Find active subscription for user
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} Active subscription or null
 */
async function findActiveByUserId(userId) {
  const result = await db.query(
    `SELECT id, user_id, razorpay_subscription_id, status, plan_id,
            current_period_start, current_period_end, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1
       AND status = 'active'
       AND current_period_end > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Find pending subscription for user (for idempotency in checkout)
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} Pending subscription or null
 */
async function findPendingByUserId(userId) {
  const result = await db.query(
    `SELECT id, user_id, razorpay_subscription_id, status, plan_id,
            current_period_start, current_period_end, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1
       AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Find all subscriptions for user
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Array of subscriptions
 */
async function findByUserId(userId) {
  const result = await db.query(
    `SELECT id, user_id, razorpay_subscription_id, status, plan_id,
            current_period_start, current_period_end, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

/**
 * Update subscription status
 * @param {string} subscriptionId - Subscription UUID
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated subscription
 */
async function updateStatus(subscriptionId, status) {
  const result = await db.query(
    `UPDATE subscriptions
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, user_id, razorpay_subscription_id, status, plan_id,
               current_period_start, current_period_end, created_at, updated_at`,
    [status, subscriptionId]
  );

  if (result.rows.length === 0) {
    throw new Error('Subscription not found');
  }

  logger.info('Subscription status updated', { subscriptionId, status });

  return result.rows[0];
}

/**
 * Update subscription period
 * @param {string} subscriptionId - Subscription UUID
 * @param {Object} periodData - Period start and end dates
 * @returns {Promise<Object>} Updated subscription
 */
async function updatePeriod(subscriptionId, periodData) {
  const { currentPeriodStart, currentPeriodEnd } = periodData;

  const result = await db.query(
    `UPDATE subscriptions
     SET current_period_start = $1, current_period_end = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, user_id, razorpay_subscription_id, status, plan_id,
               current_period_start, current_period_end, created_at, updated_at`,
    [currentPeriodStart, currentPeriodEnd, subscriptionId]
  );

  if (result.rows.length === 0) {
    throw new Error('Subscription not found');
  }

  logger.info('Subscription period updated', { subscriptionId });

  return result.rows[0];
}

/**
 * Update subscription by Razorpay ID
 * @param {string} razorpaySubscriptionId - Razorpay subscription ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated subscription
 */
async function updateByRazorpayId(razorpaySubscriptionId, updateData) {
  const { status, currentPeriodStart, currentPeriodEnd } = updateData;

  const result = await db.query(
    `UPDATE subscriptions
     SET status = $1,
         current_period_start = $2,
         current_period_end = $3,
         updated_at = NOW()
     WHERE razorpay_subscription_id = $4
     RETURNING id, user_id, razorpay_subscription_id, status, plan_id,
               current_period_start, current_period_end, created_at, updated_at`,
    [status, currentPeriodStart, currentPeriodEnd, razorpaySubscriptionId]
  );

  if (result.rows.length === 0) {
    throw new Error('Subscription not found');
  }

  logger.info('Subscription updated', { razorpaySubscriptionId, status });

  return result.rows[0];
}

/**
 * Check if user has active subscription
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>} True if user has active subscription
 */
async function hasActive(userId) {
  const subscription = await findActiveByUserId(userId);
  return subscription !== null;
}

/**
 * Find expiring subscriptions (for notifications)
 * @param {number} daysAhead - Days ahead to check
 * @returns {Promise<Array>} Array of expiring subscriptions
 */
async function findExpiring(daysAhead = 3) {
  // SECURITY: Validate and sanitize daysAhead to prevent SQL injection
  const validatedDays = parseInt(daysAhead, 10);
  if (isNaN(validatedDays) || validatedDays < 1 || validatedDays > 365) {
    throw new Error('Invalid daysAhead parameter (must be 1-365)');
  }

  const result = await db.query(
    `SELECT id, user_id, razorpay_subscription_id, status, plan_id,
            current_period_end, created_at
     FROM subscriptions
     WHERE status = 'active'
       AND current_period_end > NOW()
       AND current_period_end <= NOW() + $1 * INTERVAL '1 day'
     ORDER BY current_period_end ASC`,
    [validatedDays]
  );

  return result.rows;
}

module.exports = {
  create,
  findById,
  findByRazorpayId,
  findActiveByUserId,
  findPendingByUserId,
  findByUserId,
  updateStatus,
  updatePeriod,
  updateByRazorpayId,
  hasActive,
  findExpiring,
};
