const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

// GET /api/withdrawals - User's withdrawal history
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, withdrawals: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/withdrawals - Request withdrawal
router.post('/', auth, [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount required'),
  body('currency').isIn(['BTC', 'ETH', 'USDT_TRC20']).withMessage('Valid currency required'),
  body('wallet_address').trim().notEmpty().withMessage('Wallet address required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount, currency, wallet_address } = req.body;

    // Get min/max withdrawal settings
    const settingsResult = await query(
      "SELECT key, value FROM site_settings WHERE key IN ('min_withdrawal', 'max_withdrawal')"
    );
    const settings = {};
    settingsResult.rows.forEach(r => settings[r.key] = parseFloat(r.value));

    if (parseFloat(amount) < settings.min_withdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is $${settings.min_withdrawal}`
      });
    }

    if (parseFloat(amount) > settings.max_withdrawal) {
      return res.status(400).json({
        success: false,
        message: `Maximum withdrawal amount is $${settings.max_withdrawal}`
      });
    }

    // Check balance
    const balanceResult = await query(
      'SELECT withdrawable_balance FROM user_balances WHERE user_id = $1',
      [req.user.id]
    );

    const balance = parseFloat(balanceResult.rows[0]?.withdrawable_balance || 0);
    if (parseFloat(amount) > balance) {
      return res.status(400).json({ success: false, message: 'Insufficient withdrawable balance' });
    }

    // Check for pending withdrawals
    const pendingResult = await query(
      "SELECT COUNT(*) FROM withdrawals WHERE user_id = $1 AND status = 'pending'",
      [req.user.id]
    );
    if (parseInt(pendingResult.rows[0].count) > 0) {
      return res.status(400).json({ success: false, message: 'You already have a pending withdrawal request' });
    }

    // Use a DB transaction to prevent race condition double-spend
    // If two requests arrive simultaneously, the second will see balance=0 after the first commits
    const { getClient } = require('../utils/db');
    const client = await getClient();
    let withdrawal;
    try {
      await client.query('BEGIN');

      // Re-read balance inside transaction with a row lock
      const lockedBalance = await client.query(
        'SELECT withdrawable_balance FROM user_balances WHERE user_id = $1 FOR UPDATE',
        [req.user.id]
      );
      const currentBalance = parseFloat(lockedBalance.rows[0]?.withdrawable_balance || 0);
      if (parseFloat(amount) > currentBalance) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ success: false, message: 'Insufficient balance' });
      }

      // Deduct balance
      await client.query(
        'UPDATE user_balances SET withdrawable_balance = withdrawable_balance - $1 WHERE user_id = $2',
        [amount, req.user.id]
      );

      // Create withdrawal record
      const result = await client.query(`
        INSERT INTO withdrawals (user_id, amount, currency, wallet_address)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [req.user.id, amount, currency, wallet_address]);
      withdrawal = { rows: result.rows };

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      client.release();
      throw txError;
    }
    client.release();

    // Log transaction
    const newBalance = await query('SELECT withdrawable_balance FROM user_balances WHERE user_id = $1', [req.user.id]);
    await query(`
      INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after)
      VALUES ($1, 'withdrawal', $2, $3, $4, $5)
    `, [req.user.id, amount, `Withdrawal request via ${currency}`, withdrawal.rows[0].id, newBalance.rows[0].withdrawable_balance]);

    // Notify
    const userResult = await query('SELECT first_name, email FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    await query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, $2, $3, 'info')
    `, [req.user.id, 'Withdrawal Requested', `Your withdrawal of $${parseFloat(amount).toFixed(2)} is pending approval.`]);

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully.',
      withdrawal: withdrawal.rows[0]
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
