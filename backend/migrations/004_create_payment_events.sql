-- Migration: Create payment_events table
-- Description: Immutable audit log of all Razorpay webhook events

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id),
  razorpay_payment_id VARCHAR(100),
  event_type VARCHAR(50) NOT NULL,
  amount_cents INTEGER,
  currency VARCHAR(3) DEFAULT 'INR',
  webhook_payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance and querying
CREATE INDEX IF NOT EXISTS idx_payment_events_subscription_id ON payment_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_razorpay_payment_id ON payment_events(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type ON payment_events(event_type);

-- JSONB index for efficient webhook payload queries
CREATE INDEX IF NOT EXISTS idx_payment_events_webhook_payload ON payment_events USING GIN (webhook_payload);

-- Comment to document immutability requirement
COMMENT ON TABLE payment_events IS 'Immutable audit log - never UPDATE or DELETE, only INSERT';
