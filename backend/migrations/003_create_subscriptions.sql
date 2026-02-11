-- Migration: Create subscriptions table
-- Description: Stores user subscription data synced with Razorpay

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_subscription_id VARCHAR(100) UNIQUE,
  status VARCHAR(20) NOT NULL,
  plan_id VARCHAR(50) NOT NULL,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_id ON subscriptions(razorpay_subscription_id);

-- Index for finding active subscriptions efficiently
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions(user_id, status, current_period_end)
  WHERE status = 'active';

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Check constraint for valid status values
ALTER TABLE subscriptions
  ADD CONSTRAINT check_subscription_status
  CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'payment_failed'));
