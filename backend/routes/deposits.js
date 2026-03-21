const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { uploadProof } = require('../middleware/upload');
const { sendEmail } = require('../utils/email');

// GET /api/deposits - User's deposit history
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT d.*, ip.name as plan_name
      FROM deposits d
      LEFT JOIN investment_plans ip ON d.plan_id = ip.id
      WHERE d.user_id = $1
      ORDER BY d.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, deposits: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/deposits - Submit deposit with proof
router.post('/', auth, (req, res, next) => {
  uploadProof(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount required'),
  body('currency').isIn(['BTC', 'ETH', 'USDT_TRC20']).withMessage('Valid currency required'),
  body('plan_id').notEmpty().withMessage('Investment plan required'),
  body('txid').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount, currency, plan_id, txid } = req.body;
    const proof_file = req.file ? req.file.filename : null;

    // Validate plan exists and amount is within range
    const planResult = await query('SELECT * FROM investment_plans WHERE id = $1 AND is_active = TRUE', [plan_id]);
    if (planResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Investment plan not found' });
    }

    const plan = planResult.rows[0];
    if (parseFloat(amount) < parseFloat(plan.min_amount) || parseFloat(amount) > parseFloat(plan.max_amount)) {
      return res.status(400).json({
        success: false,
        message: `Amount must be between $${plan.min_amount} and $${plan.max_amount} for this plan`
      });
    }

    // Get wallet address for currency
    const settingKey = currency === 'BTC' ? 'btc_wallet' : currency === 'ETH' ? 'eth_wallet' : 'usdt_trc20_wallet';
    const walletResult = await query('SELECT value FROM site_settings WHERE key = $1', [settingKey]);
    const wallet_address = walletResult.rows[0]?.value || '';

    const deposit = await query(`
      INSERT INTO deposits (user_id, plan_id, amount, currency, wallet_address, txid, proof_file)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, plan_id, amount, currency, wallet_address, txid, proof_file]);

    // Send notification email
    const userResult = await query('SELECT first_name, email FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    await sendEmail(user.email, 'deposit_received', {
      first_name: user.first_name,
      amount: parseFloat(amount).toFixed(2),
      currency,
    });

    // Create notification
    await query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, 'info')
    `, [req.user.id, 'Deposit Submitted', `Your deposit of $${parseFloat(amount).toFixed(2)} via ${currency} is under review.`]);

    res.status(201).json({
      success: true,
      message: 'Deposit submitted successfully. It will be confirmed within 24 hours.',
      deposit: deposit.rows[0]
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/deposits/wallets - Get deposit wallet addresses
router.get('/wallets/all', auth, async (req, res) => {
  try {
    const result = await query(
      "SELECT key, value FROM site_settings WHERE key IN ('btc_wallet', 'eth_wallet', 'usdt_trc20_wallet')"
    );
    const wallets = {};
    result.rows.forEach(row => {
      wallets[row.key] = row.value;
    });
    res.json({ success: true, wallets });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
