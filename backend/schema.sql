-- ============================================================
-- INVESTMENT PLATFORM - COMPLETE DATABASE SCHEMA
-- Run this file in PostgreSQL to initialize the database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  country VARCHAR(100),
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  referred_by UUID REFERENCES users(id) ON DELETE SET NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verify_token VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'approved', 'rejected')),
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USER BALANCES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_deposited DECIMAL(18,8) DEFAULT 0,
  active_investment DECIMAL(18,8) DEFAULT 0,
  total_earnings DECIMAL(18,8) DEFAULT 0,
  withdrawable_balance DECIMAL(18,8) DEFAULT 0,
  total_withdrawn DECIMAL(18,8) DEFAULT 0,
  referral_earnings DECIMAL(18,8) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INVESTMENT PLANS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS investment_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  tier_order INTEGER NOT NULL,
  description TEXT,
  roi_percent DECIMAL(5,2) NOT NULL,
  roi_period VARCHAR(20) DEFAULT 'daily' CHECK (roi_period IN ('daily', 'weekly', 'monthly')),
  duration_days INTEGER NOT NULL,
  min_amount DECIMAL(18,2) NOT NULL,
  max_amount DECIMAL(18,2) NOT NULL,
  color_hex VARCHAR(7) DEFAULT '#0094FF',
  icon VARCHAR(50) DEFAULT 'star',
  features TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USER INVESTMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES investment_plans(id),
  amount DECIMAL(18,2) NOT NULL,
  roi_percent DECIMAL(5,2) NOT NULL,
  roi_period VARCHAR(20) NOT NULL,
  duration_days INTEGER NOT NULL,
  total_expected_profit DECIMAL(18,8) NOT NULL,
  total_earned DECIMAL(18,8) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at TIMESTAMP DEFAULT NOW(),
  ends_at TIMESTAMP NOT NULL,
  last_profit_credited TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DEPOSITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES investment_plans(id),
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT_TRC20')),
  wallet_address VARCHAR(255) NOT NULL,
  txid VARCHAR(255),
  proof_file VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  admin_note TEXT,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- WITHDRAWALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'ETH', 'USDT_TRC20')),
  wallet_address VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processing')),
  admin_note TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- KYC DOCUMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('id_front', 'id_back', 'passport', 'proof_of_address', 'selfie')),
  file_path VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS TABLE (audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'profit', 'referral_bonus', 'manual_credit', 'manual_debit')),
  amount DECIMAL(18,8) NOT NULL,
  description TEXT,
  reference_id UUID,
  balance_after DECIMAL(18,8),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- REFERRAL EARNINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_id UUID REFERENCES deposits(id),
  amount DECIMAL(18,8) NOT NULL,
  percent DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SITE SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EMAIL TEMPLATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[],
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SEED DATA - Default Investment Plans
-- ============================================================
INSERT INTO investment_plans (name, tier_order, description, roi_percent, roi_period, duration_days, min_amount, max_amount, color_hex, icon, features) VALUES
(
  'Starter',
  1,
  'Perfect for new investors beginning their trading journey with minimal risk.',
  2.5,
  'daily',
  30,
  100.00,
  4999.00,
  '#4CAF50',
  'seedling',
  ARRAY['2.5% Daily ROI', '30-Day Duration', '24/7 Support', 'Email Reports', 'Basic Analytics']
),
(
  'Silver',
  2,
  'For intermediate traders seeking balanced growth with moderate exposure.',
  4.0,
  'daily',
  45,
  5000.00,
  24999.00,
  '#9E9E9E',
  'chart-line',
  ARRAY['4.0% Daily ROI', '45-Day Duration', 'Priority Support', 'Weekly Reports', 'Advanced Analytics', 'Copy Trading Access']
),
(
  'Gold',
  3,
  'Our premium tier for serious investors targeting maximum returns.',
  6.5,
  'daily',
  60,
  25000.00,
  500000.00,
  '#FFD700',
  'crown',
  ARRAY['6.5% Daily ROI', '60-Day Duration', 'Dedicated Manager', 'Daily Reports', 'Full Analytics Suite', 'Chambers Level Access', 'Mirror Trading']
);

-- ============================================================
-- SEED DATA - Default Site Settings
-- ============================================================
INSERT INTO site_settings (key, value, description) VALUES
('site_name', 'TransAtlantia Trades', 'Platform display name'),
('site_tagline', 'Profitability on the Rise', 'Hero section tagline'),
('maintenance_mode', 'false', 'Put site in maintenance mode'),
('min_withdrawal', '50', 'Minimum withdrawal amount in USD'),
('max_withdrawal', '50000', 'Maximum withdrawal amount per request'),
('referral_percent', '5', 'Referral bonus percentage on first deposit'),
('withdrawal_fee', '2', 'Withdrawal processing fee in percent'),
('btc_wallet', 'bc1qyourbtcwalletaddresshere', 'BTC deposit wallet address'),
('eth_wallet', '0xYourEthWalletAddressHere', 'ETH deposit wallet address'),
('usdt_trc20_wallet', 'TYourUsdtTrc20WalletAddressHere', 'USDT TRC20 deposit wallet address'),
('support_email', 'support@transatlantiatrades.com', 'Support contact email'),
('support_phone', '+1 (534) 228-3558', 'Support phone number'),
('company_address', '52 East 14th Street, New York, NY 10003', 'Company address');

-- ============================================================
-- SEED DATA - Default Email Templates
-- ============================================================
INSERT INTO email_templates (name, subject, body, variables) VALUES
(
  'welcome',
  'Welcome to {{site_name}}!',
  '<h2>Welcome, {{first_name}}!</h2><p>Your account has been created successfully. Please verify your email to get started.</p><p><a href="{{verify_link}}">Verify Email</a></p>',
  ARRAY['first_name', 'site_name', 'verify_link']
),
(
  'email_verification',
  'Verify your {{site_name}} email address',
  '<h2>Hi {{first_name}},</h2><p>Click the link below to verify your email address:</p><p><a href="{{verify_link}}">Verify Email Address</a></p><p>This link expires in 24 hours.</p>',
  ARRAY['first_name', 'site_name', 'verify_link']
),
(
  'password_reset',
  'Reset your {{site_name}} password',
  '<h2>Hi {{first_name}},</h2><p>You requested a password reset. Click the link below:</p><p><a href="{{reset_link}}">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>',
  ARRAY['first_name', 'site_name', 'reset_link']
),
(
  'deposit_received',
  'Deposit Received - {{site_name}}',
  '<h2>Hi {{first_name}},</h2><p>We have received your deposit of <strong>${{amount}}</strong> via {{currency}}. It is currently under review and will be confirmed within 24 hours.</p>',
  ARRAY['first_name', 'amount', 'currency', 'site_name']
),
(
  'deposit_confirmed',
  'Deposit Confirmed - {{site_name}}',
  '<h2>Hi {{first_name}},</h2><p>Your deposit of <strong>${{amount}}</strong> has been confirmed! Your investment plan is now active.</p>',
  ARRAY['first_name', 'amount', 'site_name']
),
(
  'withdrawal_approved',
  'Withdrawal Approved - {{site_name}}',
  '<h2>Hi {{first_name}},</h2><p>Your withdrawal of <strong>${{amount}}</strong> via {{currency}} has been approved and is being processed.</p>',
  ARRAY['first_name', 'amount', 'currency', 'site_name']
),
(
  'withdrawal_rejected',
  'Withdrawal Update - {{site_name}}',
  '<h2>Hi {{first_name}},</h2><p>Your withdrawal request of <strong>${{amount}}</strong> was not approved. Reason: {{reason}}. Please contact support for assistance.</p>',
  ARRAY['first_name', 'amount', 'reason', 'site_name']
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_user_investments_user_id ON user_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_investments_status ON user_investments(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- ============================================================
-- FUNCTION: Auto-update updated_at timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_balances_updated_at BEFORE UPDATE ON user_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON investment_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deposits_updated_at BEFORE UPDATE ON deposits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_withdrawals_updated_at BEFORE UPDATE ON withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
