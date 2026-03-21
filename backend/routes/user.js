const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { uploadKyc } = require('../middleware/upload');

// GET /api/user/dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [balanceResult, investmentsResult, depositsResult, withdrawalsResult, notificationsResult, referralResult] = await Promise.all([
      query('SELECT * FROM user_balances WHERE user_id = $1', [userId]),
      query("SELECT ui.*, ip.name as plan_name, ip.color_hex FROM user_investments ui JOIN investment_plans ip ON ui.plan_id = ip.id WHERE ui.user_id = $1 AND ui.status = 'active' ORDER BY ui.created_at DESC", [userId]),
      query("SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5", [userId]),
      query("SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5", [userId]),
      query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [userId]),
      query("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM referral_earnings WHERE referrer_id = $1", [userId]),
    ]);

    const balance = balanceResult.rows[0] || {};

    res.json({
      success: true,
      dashboard: {
        balance: {
          withdrawable: parseFloat(balance.withdrawable_balance) || 0,
          total_deposited: parseFloat(balance.total_deposited) || 0,
          total_earnings: parseFloat(balance.total_earnings) || 0,
          active_investment: parseFloat(balance.active_investment) || 0,
          total_withdrawn: parseFloat(balance.total_withdrawn) || 0,
          referral_earnings: parseFloat(balance.referral_earnings) || 0,
        },
        active_investments: investmentsResult.rows,
        recent_deposits: depositsResult.rows,
        recent_withdrawals: withdrawalsResult.rows,
        notifications: notificationsResult.rows,
        referral_stats: {
          count: parseInt(referralResult.rows[0].count),
          total: parseFloat(referralResult.rows[0].total),
        }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/user/transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const type = req.query.type;

    const params = [req.user.id];
    let typeClause = '';
    if (type) {
      params.push(type);
      typeClause = ` AND type = $${params.length}`;
    }

    const result = await query(
      `SELECT * FROM transactions WHERE user_id = $1${typeClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const total = await query(
      `SELECT COUNT(*) FROM transactions WHERE user_id = $1${typeClause}`,
      params
    );

    res.json({
      success: true,
      transactions: result.rows,
      pagination: { page, limit, total: parseInt(total.rows[0].count) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/user/referrals
router.get('/referrals', auth, async (req, res) => {
  try {
    const referred = await query(`
      SELECT u.first_name, u.last_name, u.email, u.created_at,
             COALESCE(SUM(d.amount), 0) as total_deposited
      FROM users u
      LEFT JOIN deposits d ON u.id = d.user_id AND d.status = 'confirmed'
      WHERE u.referred_by = $1
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.created_at
      ORDER BY u.created_at DESC
    `, [req.user.id]);

    const earnings = await query(
      'SELECT * FROM referral_earnings WHERE referrer_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    const user = await query('SELECT referral_code FROM users WHERE id = $1', [req.user.id]);
    const settingsResult = await query("SELECT value FROM site_settings WHERE key = 'referral_percent'");

    res.json({
      success: true,
      referral_code: user.rows[0].referral_code,
      referral_link: `${process.env.SITE_URL}/register.html?ref=${user.rows[0].referral_code}`,
      referral_percent: settingsResult.rows[0]?.value || '5',
      referred_users: referred.rows,
      earnings: earnings.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/profile
router.put('/profile', auth, [
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  body('phone').optional().trim(),
  body('country').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { first_name, last_name, phone, country } = req.body;
    const result = await query(
      'UPDATE users SET first_name=$1, last_name=$2, phone=$3, country=$4 WHERE id=$5 RETURNING id, first_name, last_name, email, phone, country',
      [first_name, last_name, phone, country, req.user.id]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/user/change-password
router.put('/change-password', auth, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
], async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/user/kyc
router.post('/kyc', auth, (req, res, next) => {
  uploadKyc(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ success: false, message: 'No documents uploaded' });
    }

    for (const [docType, files] of Object.entries(req.files)) {
      const file = files[0];
      await query(`
        INSERT INTO kyc_documents (user_id, doc_type, file_path)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [req.user.id, docType, file.filename]);
    }

    await query("UPDATE users SET kyc_status = 'submitted' WHERE id = $1", [req.user.id]);
    res.json({ success: true, message: 'KYC documents submitted for review.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// GET /api/user/investments - all investments for the user
router.get('/investments', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT ui.*, ip.name as plan_name, ip.color_hex
      FROM user_investments ui
      JOIN investment_plans ip ON ui.plan_id = ip.id
      WHERE ui.user_id = $1
      ORDER BY ui.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, investments: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// GET /api/user/withdraw-limits — fetch admin-configured withdrawal limits
router.get('/withdraw-limits', auth, async (req, res) => {
  try {
    const result = await query(
      "SELECT key, value FROM site_settings WHERE key IN ('min_withdrawal', 'max_withdrawal', 'withdrawal_fee')"
    );
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json({
      success: true,
      min: parseFloat(settings.min_withdrawal) || 50,
      max: parseFloat(settings.max_withdrawal) || 50000,
      fee_percent: parseFloat(settings.withdrawal_fee) || 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/user/mark-notifications-read
router.post('/notifications/read', auth, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
