/**
 * Payment Routes
 * Handles Razorpay subscription creation, webhooks, and user subscription management
 *
 * SECURITY:
 * - Webhook endpoint uses signature verification (not JWT)
 * - User endpoints require JWT authentication
 * - All payment state changes are webhook-driven
 */

const express = require('express');
const crypto = require('crypto');
const { razorpay, verifyWebhookSignature, PLANS } = require('../config/razorpay');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const subscriptionModel = require('../models/subscription');
const userModel = require('../models/user');
const containerManager = require('../services/containerManager');
const workspaceModel = require('../models/workspace');
const logger = require('../utils/logger');
const db = require('../config/database');

const router = express.Router();

/**
 * POST /api/payments/checkout
 * Create Razorpay subscription and return checkout URL
 *
 * Auth: Requires JWT
 * Input: { plan_id: 'monthly_basic' }
 * Output: { subscription_id, checkout_url, short_url }
 */
router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { plan_id } = req.body;

    // Validate plan_id
    const validPlans = Object.values(PLANS);
    if (!plan_id || !validPlans.includes(plan_id)) {
      return res.status(400).json({
        error: 'Invalid plan',
        message: `Plan ID must be one of: ${validPlans.join(', ')}`,
      });
    }

    // Check if user already has an active subscription
    const existingActiveSubscription = await subscriptionModel.hasActive(userId);
    if (existingActiveSubscription) {
      return res.status(409).json({
        error: 'Subscription exists',
        message: 'You already have an active subscription',
      });
    }

    // Check if user has a pending subscription (return existing one for idempotency)
    const pendingSubscription = await subscriptionModel.findPendingByUserId(userId);
    if (pendingSubscription) {
      logger.info('Returning existing pending subscription', {
        userId,
        subscriptionId: pendingSubscription.razorpay_subscription_id,
      });

      return res.json({
        subscription_id: pendingSubscription.razorpay_subscription_id,
        short_url: pendingSubscription.short_url,
        message: 'Pending subscription already exists',
      });
    }

    // Get user details for Razorpay
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account not found',
      });
    }

    try {
      // Create subscription in Razorpay
      const razorpaySubscription = await razorpay.subscriptions.create({
        plan_id: plan_id,
        customer_notify: 1, // Send email/SMS to customer
        total_count: 12, // 12 months (can be infinite with 0)
        quantity: 1,
        notes: {
          user_id: userId,
          email: user.email,
        },
      });

      logger.info('Razorpay subscription created', {
        userId,
        razorpaySubscriptionId: razorpaySubscription.id,
        planId: plan_id,
      });

      // Create local subscription record with status 'pending'
      const subscription = await subscriptionModel.create({
        userId,
        razorpaySubscriptionId: razorpaySubscription.id,
        status: 'pending',
        planId: plan_id,
        currentPeriodStart: new Date(razorpaySubscription.current_start * 1000),
        currentPeriodEnd: new Date(razorpaySubscription.current_end * 1000),
      });

      logger.info('Local subscription created', {
        subscriptionId: subscription.id,
        status: 'pending',
      });

      // Return checkout URL to frontend
      res.json({
        subscription_id: razorpaySubscription.id,
        short_url: razorpaySubscription.short_url,
        message: 'Subscription created. Please complete payment.',
      });
    } catch (error) {
      logger.error('Failed to create Razorpay subscription', {
        userId,
        error: error.message,
        stack: error.stack,
      });

      // Razorpay API error
      if (error.error && error.error.code) {
        return res.status(503).json({
          error: 'Payment provider error',
          message: 'Unable to create subscription. Please try again later.',
          details: error.error.description || error.message,
        });
      }

      throw error;
    }
  })
);

/**
 * GET /api/payments/subscription
 * Get current user's subscription details
 *
 * Auth: Requires JWT
 * Output: Subscription object or 404
 */
router.get(
  '/subscription',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId;

    const subscription = await subscriptionModel.findByUserId(userId);

    if (!subscription) {
      return res.status(404).json({
        error: 'No subscription',
        message: 'You do not have a subscription yet',
      });
    }

    // Return clean subscription status for frontend
    res.json({
      status: subscription.status,
      plan: subscription.plan_id,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      workspace_limit: 5, // Based on plan (hardcoded for MVP)
      cancelled_at: subscription.cancelled_at,
      is_active: subscription.status === 'active',
      days_remaining: subscription.current_period_end
        ? Math.ceil((new Date(subscription.current_period_end) - new Date()) / (1000 * 60 * 60 * 24))
        : 0,
    });
  })
);

/**
 * POST /api/payments/cancel
 * Cancel user's subscription (at period end, not immediate)
 *
 * Auth: Requires JWT + active subscription
 * Input: { reason: 'optional feedback' }
 * Output: Cancellation confirmation
 */
router.post(
  '/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { reason } = req.body;

    const subscription = await subscriptionModel.findByUserId(userId);

    if (!subscription) {
      return res.status(404).json({
        error: 'No subscription',
        message: 'You do not have a subscription to cancel',
      });
    }

    // Check if already cancelled
    if (subscription.status === 'cancelled') {
      return res.json({
        message: 'Subscription is already cancelled',
        end_date: subscription.current_period_end,
      });
    }

    // Check if subscription is in a cancellable state
    if (subscription.status === 'expired') {
      return res.status(400).json({
        error: 'Cannot cancel',
        message: 'Subscription has already expired',
      });
    }

    try {
      // Cancel subscription in Razorpay (at period end)
      const razorpayResponse = await razorpay.subscriptions.cancel(
        subscription.razorpay_subscription_id,
        {
          cancel_at_cycle_end: 1, // Cancel at end of current billing cycle
        }
      );

      logger.info('Razorpay subscription cancelled', {
        userId,
        subscriptionId: subscription.id,
        razorpaySubscriptionId: subscription.razorpay_subscription_id,
        reason: reason || 'No reason provided',
      });

      // Webhook will update local state when Razorpay processes cancellation
      // Return immediate response to user
      res.json({
        message: 'Subscription will be cancelled at the end of the current period',
        end_date: subscription.current_period_end,
        access_until: subscription.current_period_end,
      });
    } catch (error) {
      logger.error('Failed to cancel Razorpay subscription', {
        userId,
        subscriptionId: subscription.id,
        error: error.message,
      });

      if (error.error && error.error.code) {
        return res.status(503).json({
          error: 'Payment provider error',
          message: 'Unable to cancel subscription. Please try again later.',
          details: error.error.description || error.message,
        });
      }

      throw error;
    }
  })
);

/**
 * POST /api/webhooks/razorpay
 * Receive and process Razorpay webhook events
 *
 * Auth: Razorpay signature verification (NOT JWT)
 * Security: Signature verification is MANDATORY
 */
router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }), // Get raw body for signature verification
  async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'];

      // Check if body exists and is Buffer
      if (!req.body) {
        logger.error('Webhook body is missing');
        return res.status(400).json({ error: 'Body missing' });
      }

      if (!Buffer.isBuffer(req.body)) {
        logger.error('Webhook body is not a Buffer', { type: typeof req.body });
        return res.status(400).json({ error: 'Body must be raw' });
      }

      const rawBody = req.body.toString('utf8');

    // [1] Signature Verification
    if (!signature) {
      logger.error('Webhook signature missing', {
        ip: req.ip,
        headers: req.headers,
      });
      return res.status(401).json({ error: 'Signature missing' });
    }

    const isValid = verifyWebhookSignature(signature, rawBody);
    if (!isValid) {
      logger.error('Webhook signature verification failed', {
        ip: req.ip,
        signature: signature.substring(0, 10) + '...',
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse webhook payload after verification
    let webhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody);
    } catch (error) {
      logger.error('Webhook payload parsing failed', {
        error: error.message,
      });
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventType = webhookPayload.event;
    const eventId = webhookPayload.payload?.payment?.entity?.id || webhookPayload.payload?.subscription?.entity?.id || `event_${Date.now()}`;

    logger.info('Webhook received', {
      eventType,
      eventId,
    });

    // [2] Idempotency Check
    try {
      const existingEvent = await db.query(
        'SELECT id FROM payment_events WHERE razorpay_event_id = $1',
        [eventId]
      );

      if (existingEvent.rows.length > 0) {
        logger.info('Webhook already processed (duplicate)', {
          eventType,
          eventId,
        });
        return res.status(200).json({ status: 'already_processed' });
      }
    } catch (error) {
      logger.error('Idempotency check failed', {
        error: error.message,
      });
      return res.status(503).json({ error: 'Database error' });
    }

    // [3] Process webhook event
    try {
      await processWebhookEvent(webhookPayload, eventId);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      logger.error('Webhook processing failed', {
        eventType,
        eventId,
        error: error.message,
        stack: error.stack,
      });
      // Return 500 so Razorpay retries
      res.status(500).json({ error: 'Processing failed' });
    }
    } catch (topLevelError) {
      logger.error('Webhook handler crashed', {
        error: topLevelError.message,
        stack: topLevelError.stack,
      });
      return res.status(500).json({ error: 'Internal error' });
    }
  }
);

/**
 * Process webhook event and update subscription state
 * @param {Object} webhookPayload - Full webhook payload from Razorpay
 * @param {string} eventId - Event ID for idempotency
 */
async function processWebhookEvent(webhookPayload, eventId) {
  const eventType = webhookPayload.event;
  const entity = webhookPayload.payload.subscription?.entity || webhookPayload.payload.payment?.entity;

  if (!entity) {
    logger.warn('Webhook payload missing entity', { eventType });
    return;
  }

  const razorpaySubscriptionId = entity.id || entity.subscription_id;
  const userId = entity.notes?.user_id;

  if (!razorpaySubscriptionId) {
    logger.warn('Webhook missing subscription ID', { eventType });
    return;
  }

  // Start database transaction
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Import webhook handler module (to be created next)
    const webhookHandler = require('../services/webhookHandler');
    await webhookHandler.handleWebhookEvent(eventType, entity, webhookPayload, eventId, client);

    await client.query('COMMIT');
    logger.info('Webhook processed successfully', { eventType, eventId });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Webhook processing transaction failed', {
      eventType,
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = router;
