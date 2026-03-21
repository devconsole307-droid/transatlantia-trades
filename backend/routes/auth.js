const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../utils/db');
const { sendEmail } = require('../utils/email');
const { auth } = require('../middleware/auth');

const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// POST /api/auth/register
router.post('/register', [
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim(),
  body('country').optional().trim(),
  body('referral_code').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { first_name, last_name, email, password, phone, country, referral_code } = req.body;

    // Check if email exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Find referrer
    let referrerId = null;
    if (referral_code) {
      const referrer = await query('SELECT id FROM users WHERE referral_code = $1', [referral_code]);
      if (referrer.rows.length > 0) referrerId = referrer.rows[0].id;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verify_token = uuidv4();
    let userReferralCode = generateReferralCode();

    // Ensure unique referral code
    let codeExists = true;
    while (codeExists) {
      const check = await query('SELECT id FROM users WHERE referral_code = $1', [userReferralCode]);
      if (check.rows.length === 0) codeExists = false;
      else userReferralCode = generateReferralCode();
    }

    // Create user
    const newUser = await query(`
      INSERT INTO users (first_name, last_name, email, password_hash, phone, country, referral_code, referred_by, email_verify_token)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, first_name, last_name, email, referral_code
    `, [first_name, last_name, email, password_hash, phone, country, userReferralCode, referrerId, verify_token]);

    const user = newUser.rows[0];

    // Create balance record
    await query('INSERT INTO user_balances (user_id) VALUES ($1)', [user.id]);

    // Send welcome + verification email (don't fail registration if email fails)
    const backendUrl = (process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
    const frontendUrl = (process.env.FRONTEND_URL || process.env.SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
    const verifyLink = `${backendUrl}/api/auth/verify-email/${verify_token}`;
    const emailSent = await sendEmail(email, 'welcome', { first_name, verify_link: verifyLink });
    if (!emailSent) {
      console.warn(`[EMAIL] Failed to send welcome email to ${email} — check SMTP settings in .env`);
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? 'Account created! Please check your email to verify your account.'
        : 'Account created! (Email delivery failed — contact support to verify your account manually.)',
      user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const { email, password } = req.body;

    const result = await query(`
      SELECT u.*, ub.withdrawable_balance, ub.total_deposited, ub.total_earnings, ub.active_investment
      FROM users u
      LEFT JOIN user_balances ub ON u.id = ub.user_id
      WHERE u.email = $1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        is_admin: user.is_admin,
        email_verified: user.email_verified,
        kyc_status: user.kyc_status,
        referral_code: user.referral_code,
        balance: {
          withdrawable: parseFloat(user.withdrawable_balance) || 0,
          total_deposited: parseFloat(user.total_deposited) || 0,
          total_earnings: parseFloat(user.total_earnings) || 0,
          active_investment: parseFloat(user.active_investment) || 0,
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await query(
      'UPDATE users SET email_verified = TRUE, email_verify_token = NULL WHERE email_verify_token = $1 RETURNING id',
      [token]
    );

    if (result.rows.length === 0) {
      const fe = (process.env.FRONTEND_URL || process.env.SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
      return res.redirect(`${fe}/login.html?error=invalid_token`);
    }

    const feUrl = (process.env.FRONTEND_URL || process.env.SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
    res.redirect(`${feUrl}/login.html?verified=true`);
  } catch (error) {
    const feErr = (process.env.FRONTEND_URL || process.env.SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
    res.redirect(`${feErr}/login.html?error=server_error`);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], async (req, res) => {
  try {
    const { email } = req.body;
    const result = await query('SELECT id, first_name FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const user = result.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [resetToken, expires, user.id]
    );

    const feReset = (process.env.FRONTEND_URL || process.env.SITE_URL || 'http://localhost:5000').replace(/\/$/, '');
    const resetLink = `${feReset}/reset-password.html?token=${resetToken}`;
    await sendEmail(email, 'password_reset', { first_name: user.first_name, reset_link: resetLink });

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  try {
    const { token, password } = req.body;

    const result = await query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [password_hash, result.rows[0].id]
    );

    res.json({ success: true, message: 'Password reset successfully. Please login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.country, u.is_admin,
             u.email_verified, u.kyc_status, u.referral_code, u.referred_by, u.last_login, u.created_at,
             ub.total_deposited, ub.active_investment, ub.total_earnings, ub.withdrawable_balance,
             ub.total_withdrawn, ub.referral_earnings
      FROM users u
      LEFT JOIN user_balances ub ON u.id = ub.user_id
      WHERE u.id = $1
    `, [req.user.id]);

    const user = result.rows[0];
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
