/**
 * Webhook Handler Service
 * Contains state machine logic for processing Razorpay webhook events
 *
 * CRITICAL RULES:
 * 1. Always use database transactions
 * 2. Lock subscription row during state changes (SELECT FOR UPDATE)
 * 3. Insert into payment_events for audit trail
 * 4. Execute side effects (container ops) AFTER state updates
 * 5. Latest timestamp wins for conflicting events
 */

const subscriptionModel = require('../models/subscription');
const workspaceModel = require('../models/workspace');
const containerManager = require('../services/containerManager');
const logger = require('../utils/logger');

/**
 * Valid subscription state transitions
 * Based on design document state machine
 */
const VALID_TRANSITIONS = {
  pending: ['active'],
  active: ['past_due', 'cancelled', 'expired'],
  past_due: ['active', 'cancelled', 'expired'],
  cancelled: [], // Terminal state
  expired: [], // Terminal state
};

/**
 * Check if a state transition is valid
 */
function isValidTransition(fromState, toState) {
  if (!VALID_TRANSITIONS[fromState]) {
    return false;
  }
  return VALID_TRANSITIONS[fromState].includes(toState);
}

/**
 * Main webhook event handler
 * Routes events to specific handlers based on event type
 *
 * @param {string} eventType - Razorpay event type
 * @param {Object} entity - Subscription or payment entity from webhook
 * @param {Object} webhookPayload - Full webhook payload
 * @param {string} eventId - Event ID for idempotency
 * @param {Object} client - PostgreSQL client (transaction)
 */
async function handleWebhookEvent(eventType, entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id || entity.subscription_id;

  logger.info('Processing webhook event', {
    eventType,
    razorpaySubscriptionId,
    eventId,
  });

  // Route to specific event handlers
  switch (eventType) {
    case 'subscription.activated':
      await handleSubscriptionActivated(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.charged':
      await handleSubscriptionCharged(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.completed':
      await handleSubscriptionCompleted(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.cancelled':
      await handleSubscriptionCancelled(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.pending':
      await handleSubscriptionPending(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.halted':
      await handleSubscriptionHalted(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.resumed':
      await handleSubscriptionResumed(entity, webhookPayload, eventId, client);
      break;

    case 'subscription.paused':
      await handleSubscriptionPaused(entity, webhookPayload, eventId, client);
      break;

    case 'payment.failed':
      await handlePaymentFailed(entity, webhookPayload, eventId, client);
      break;

    default:
      logger.info('Ignoring webhook event (not handled)', { eventType });
      // Still log to payment_events for audit trail
      await insertPaymentEvent(null, eventType, entity, webhookPayload, eventId, client);
  }
}

/**
 * subscription.activated - First payment successful
 * Transition: pending → active
 */
async function handleSubscriptionActivated(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  // Lock and get subscription
  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) {
    logger.warn('Subscription not found for activation', { razorpaySubscriptionId });
    return;
  }

  // Validate state transition
  if (!isValidTransition(subscription.status, 'active')) {
    logger.warn('Invalid state transition for activation', {
      from: subscription.status,
      to: 'active',
      subscriptionId: subscription.id,
    });
    // Log event but don't update state
    await insertPaymentEvent(subscription.id, 'subscription.activated', entity, webhookPayload, eventId, client);
    return;
  }

  // Update subscription to active
  await client.query(
    `UPDATE subscriptions
     SET status = 'active',
         current_period_start = $1,
         current_period_end = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [
      new Date(entity.current_start * 1000),
      new Date(entity.current_end * 1000),
      subscription.id,
    ]
  );

  // Insert payment event
  await insertPaymentEvent(subscription.id, 'subscription.activated', entity, webhookPayload, eventId, client);

  logger.info('Subscription activated', {
    subscriptionId: subscription.id,
    userId,
    status: 'active',
  });

  // Side effect: No container action needed (user can now create workspaces)
}

/**
 * subscription.charged - Recurring payment successful
 * Action: Update period dates, remain active
 */
async function handleSubscriptionCharged(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;
  const razorpayPaymentId = webhookPayload.payload.payment?.entity?.id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) {
    logger.warn('Subscription not found for charge', { razorpaySubscriptionId });
    return;
  }

  // Update period dates
  await client.query(
    `UPDATE subscriptions
     SET current_period_start = $1,
         current_period_end = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [
      new Date(entity.current_start * 1000),
      new Date(entity.current_end * 1000),
      subscription.id,
    ]
  );

  // Insert payment event with payment ID
  await insertPaymentEvent(
    subscription.id,
    'subscription.charged',
    entity,
    webhookPayload,
    eventId,
    client,
    razorpayPaymentId
  );

  logger.info('Subscription charged', {
    subscriptionId: subscription.id,
    razorpayPaymentId,
  });
}

/**
 * subscription.completed - All cycles completed
 * Transition: active → expired
 */
async function handleSubscriptionCompleted(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) return;

  if (!isValidTransition(subscription.status, 'expired')) {
    logger.warn('Invalid state transition for completion', {
      from: subscription.status,
      to: 'expired',
    });
    await insertPaymentEvent(subscription.id, 'subscription.completed', entity, webhookPayload, eventId, client);
    return;
  }

  // Update to expired
  await client.query(
    `UPDATE subscriptions
     SET status = 'expired',
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id]
  );

  await insertPaymentEvent(subscription.id, 'subscription.completed', entity, webhookPayload, eventId, client);

  logger.info('Subscription completed (expired)', {
    subscriptionId: subscription.id,
    userId,
  });

  // Side effect: Stop all containers (async after transaction commits)
  // We'll handle this with a background job or direct call
  await stopUserContainers(userId, 'subscription_expired');
}

/**
 * subscription.cancelled - User or merchant cancelled
 * Transition: any state → cancelled
 */
async function handleSubscriptionCancelled(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) return;

  // Terminal state - always allowed (priority event)
  await client.query(
    `UPDATE subscriptions
     SET status = 'cancelled',
         cancelled_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id]
  );

  await insertPaymentEvent(subscription.id, 'subscription.cancelled', entity, webhookPayload, eventId, client);

  logger.info('Subscription cancelled', {
    subscriptionId: subscription.id,
    userId,
  });

  // Side effect: Stop all containers immediately
  await stopUserContainers(userId, 'subscription_cancelled');
}

/**
 * subscription.pending - Payment awaiting (renewal failed)
 * Transition: active → past_due
 */
async function handleSubscriptionPending(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) return;

  if (!isValidTransition(subscription.status, 'past_due')) {
    logger.warn('Invalid state transition for pending', {
      from: subscription.status,
      to: 'past_due',
    });
    await insertPaymentEvent(subscription.id, 'subscription.pending', entity, webhookPayload, eventId, client);
    return;
  }

  await client.query(
    `UPDATE subscriptions
     SET status = 'past_due',
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id]
  );

  await insertPaymentEvent(subscription.id, 'subscription.pending', entity, webhookPayload, eventId, client);

  logger.info('Subscription marked past_due', {
    subscriptionId: subscription.id,
    userId,
  });

  // Side effect: User cannot start new containers, but running ones continue (grace period)
}

/**
 * subscription.halted - Merchant paused (fraud/dispute)
 * Transition: active → past_due
 */
async function handleSubscriptionHalted(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) return;

  if (!isValidTransition(subscription.status, 'past_due')) {
    await insertPaymentEvent(subscription.id, 'subscription.halted', entity, webhookPayload, eventId, client);
    return;
  }

  await client.query(
    `UPDATE subscriptions
     SET status = 'past_due',
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id]
  );

  await insertPaymentEvent(subscription.id, 'subscription.halted', entity, webhookPayload, eventId, client);

  logger.warn('Subscription halted by merchant', {
    subscriptionId: subscription.id,
    userId,
  });
}

/**
 * subscription.resumed - Subscription resumed after halt
 * Transition: past_due → active
 */
async function handleSubscriptionResumed(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) return;

  if (!isValidTransition(subscription.status, 'active')) {
    await insertPaymentEvent(subscription.id, 'subscription.resumed', entity, webhookPayload, eventId, client);
    return;
  }

  await client.query(
    `UPDATE subscriptions
     SET status = 'active',
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id]
  );

  await insertPaymentEvent(subscription.id, 'subscription.resumed', entity, webhookPayload, eventId, client);

  logger.info('Subscription resumed', {
    subscriptionId: subscription.id,
    userId,
  });
}

/**
 * subscription.paused - User-initiated pause
 * Transition: active → past_due
 */
async function handleSubscriptionPaused(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.id;
  const userId = entity.notes?.user_id;

  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) return;

  if (!isValidTransition(subscription.status, 'past_due')) {
    await insertPaymentEvent(subscription.id, 'subscription.paused', entity, webhookPayload, eventId, client);
    return;
  }

  await client.query(
    `UPDATE subscriptions
     SET status = 'past_due',
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id]
  );

  await insertPaymentEvent(subscription.id, 'subscription.paused', entity, webhookPayload, eventId, client);

  logger.info('Subscription paused', {
    subscriptionId: subscription.id,
    userId,
  });
}

/**
 * payment.failed - Payment attempt failed
 * Action: Log event, send notification
 */
async function handlePaymentFailed(entity, webhookPayload, eventId, client) {
  const razorpaySubscriptionId = entity.subscription_id;
  const razorpayPaymentId = entity.id;
  const userId = entity.notes?.user_id;

  // Get subscription to get UUID
  const subscription = await getAndLockSubscription(razorpaySubscriptionId, client);
  if (!subscription) {
    logger.warn('Subscription not found for failed payment', { razorpaySubscriptionId, razorpayPaymentId });
    return;
  }

  await insertPaymentEvent(
    subscription.id,
    'payment.failed',
    entity,
    webhookPayload,
    eventId,
    client,
    razorpayPaymentId
  );

  logger.warn('Payment failed', {
    razorpayPaymentId,
    razorpaySubscriptionId,
    subscriptionId: subscription.id,
    userId,
    error: entity.error_reason || 'Unknown',
  });

  // Side effect: Send notification to user (implement later)
}

/**
 * Get subscription and lock row for update
 * Prevents race conditions during concurrent webhook processing
 */
async function getAndLockSubscription(razorpaySubscriptionId, client) {
  const result = await client.query(
    `SELECT * FROM subscriptions
     WHERE razorpay_subscription_id = $1
     FOR UPDATE`,
    [razorpaySubscriptionId]
  );

  return result.rows[0] || null;
}

/**
 * Insert payment event into audit log
 * This table is append-only (never update/delete)
 */
async function insertPaymentEvent(
  subscriptionId,
  eventType,
  entity,
  webhookPayload,
  eventId,
  client,
  razorpayPaymentId = null,
  amountCents = null
) {
  await client.query(
    `INSERT INTO payment_events (
      subscription_id, event_type, razorpay_payment_id,
      razorpay_event_id, webhook_payload, amount_cents, currency
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      subscriptionId,
      eventType,
      razorpayPaymentId,
      eventId,
      JSON.stringify(webhookPayload),
      amountCents,
      'INR',
    ]
  );
}

/**
 * Stop all user containers (side effect)
 * Called after subscription cancelled/expired
 */
async function stopUserContainers(userId, reason) {
  try {
    const workspaces = await workspaceModel.findByUserId(userId);
    const runningWorkspaces = workspaces.filter((w) => w.container_status === 'running');

    logger.info('Stopping user containers', {
      userId,
      reason,
      count: runningWorkspaces.length,
    });

    for (const workspace of runningWorkspaces) {
      try {
        if (workspace.container_id) {
          await containerManager.stopContainer(workspace.container_id);
          await workspaceModel.updateStatus(workspace.id, 'stopped');
          logger.info('Container stopped', {
            workspaceId: workspace.id,
            containerId: workspace.container_id,
            reason,
          });
        }
      } catch (error) {
        logger.error('Failed to stop container', {
          workspaceId: workspace.id,
          error: error.message,
        });
        // Continue stopping other containers even if one fails
      }
    }
  } catch (error) {
    logger.error('Failed to stop user containers', {
      userId,
      error: error.message,
    });
    // Don't throw - this is a side effect, shouldn't fail webhook processing
  }
}

module.exports = {
  handleWebhookEvent,
  isValidTransition,
  VALID_TRANSITIONS,
};
