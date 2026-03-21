const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query } = require('../utils/db');
const { adminAuth } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const [
      usersCount, activeInvestments, pendingDeposits, pendingWithdrawals,
      totalDeposited, totalWithdrawn, recentUsers, recentDeposits
    ] = await Promise.all([
      query("SELECT COUNT(*) FROM users WHERE is_admin = FALSE"),
      query("SELECT COUNT(*), COALESCE(SUM(amount),0) as total FROM user_investments WHERE status='active'"),
      query("SELECT COUNT(*), COALESCE(SUM(amount),0) as total FROM deposits WHERE status='pending'"),
      query("SELECT COUNT(*), COALESCE(SUM(amount),0) as total FROM withdrawals WHERE status='pending'"),
      query("SELECT COALESCE(SUM(amount),0) as total FROM deposits WHERE status='confirmed'"),
      query("SELECT COALESCE(SUM(amount),0) as total FROM withdrawals WHERE status='approved'"),
      query("SELECT id, first_name, last_name, email, created_at, kyc_status FROM users WHERE is_admin=FALSE ORDER BY created_at DESC LIMIT 5"),
      query("SELECT d.*, u.first_name, u.last_name, u.email FROM deposits d JOIN users u ON d.user_id=u.id ORDER BY d.created_at DESC LIMIT 5"),
    ]);

    res.json({
      success: true,
      stats: {
        total_users: parseInt(usersCount.rows[0].count),
        active_investments: {
          count: parseInt(activeInvestments.rows[0].count),
          total: parseFloat(activeInvestments.rows[0].total),
        },
        pending_deposits: {
          count: parseInt(pendingDeposits.rows[0].count),
          total: parseFloat(pendingDeposits.rows[0].total),
        },
        pending_withdrawals: {
          count: parseInt(pendingWithdrawals.rows[0].count),
          total: parseFloat(pendingWithdrawals.rows[0].total),
        },
        total_deposited: parseFloat(totalDeposited.rows[0].total),
        total_withdrawn: parseFloat(totalWithdrawn.rows[0].total),
      },
      recent_users: recentUsers.rows,
      recent_deposits: recentDeposits.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// USER MANAGEMENT
// ============================================================
router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const result = await query(`
      SELECT u.*, ub.withdrawable_balance, ub.total_deposited, ub.total_earnings
      FROM users u
      LEFT JOIN user_balances ub ON u.id = ub.user_id
      WHERE u.is_admin = FALSE
        AND (u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `, [`%${search}%`, limit, offset]);

    const total = await query(
      "SELECT COUNT(*) FROM users WHERE is_admin=FALSE AND (email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)",
      [`%${search}%`]
    );

    res.json({ success: true, users: result.rows, pagination: { page, limit, total: parseInt(total.rows[0].count) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.*, ub.*
      FROM users u
      LEFT JOIN user_balances ub ON u.id = ub.user_id
      WHERE u.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const investments = await query("SELECT ui.*, ip.name as plan_name FROM user_investments ui JOIN investment_plans ip ON ui.plan_id=ip.id WHERE ui.user_id=$1 ORDER BY created_at DESC", [req.params.id]);
    const deposits = await query("SELECT * FROM deposits WHERE user_id=$1 ORDER BY created_at DESC", [req.params.id]);
    const withdrawals = await query("SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC", [req.params.id]);

    res.json({ success: true, user: result.rows[0], investments: investments.rows, deposits: deposits.rows, withdrawals: withdrawals.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Toggle user active/suspend
router.patch('/users/:id/toggle-status', adminAuth, async (req, res) => {
  try {
    const result = await query('UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active, first_name, email', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Manual credit/debit user balance
router.post('/users/:id/adjust-balance', adminAuth, [
  body('amount').isFloat({ min: 0.01 }),
  body('type').isIn(['credit', 'debit']),
  body('description').trim().notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { amount, type, description } = req.body;
    const userId = req.params.id;

    if (type === 'credit') {
      await query(
        'UPDATE user_balances SET withdrawable_balance = withdrawable_balance + $1 WHERE user_id = $2',
        [amount, userId]
      );
    } else {
      const balResult = await query('SELECT withdrawable_balance FROM user_balances WHERE user_id = $1', [userId]);
      if (parseFloat(balResult.rows[0]?.withdrawable_balance || 0) < parseFloat(amount)) {
        return res.status(400).json({ success: false, message: 'User has insufficient balance to debit' });
      }
      await query(
        'UPDATE user_balances SET withdrawable_balance = withdrawable_balance - $1 WHERE user_id = $2',
        [amount, userId]
      );
    }

    const newBal = await query('SELECT withdrawable_balance FROM user_balances WHERE user_id = $1', [userId]);
    await query(`
      INSERT INTO transactions (user_id, type, amount, description, balance_after)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, type === 'credit' ? 'manual_credit' : 'manual_debit', amount, description, newBal.rows[0].withdrawable_balance]);

    await query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,$4)`,
      [userId, type === 'credit' ? 'Balance Credited' : 'Balance Adjusted',
       `$${parseFloat(amount).toFixed(2)} has been ${type === 'credit' ? 'added to' : 'deducted from'} your account. ${description}`,
       type === 'credit' ? 'success' : 'warning']);

    res.json({ success: true, message: `Balance ${type}ed successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update KYC status
router.patch('/users/:id/kyc', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    await query('UPDATE users SET kyc_status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true, message: `KYC ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// DEPOSIT MANAGEMENT
// ============================================================
router.get('/deposits', adminAuth, async (req, res) => {
  try {
    // Whitelist allowed status values — never interpolate user input into SQL
    const ALLOWED_STATUSES = ['pending', 'confirmed', 'rejected'];
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const params = [limit, offset];
    let whereClause = '';
    if (status !== 'all' && ALLOWED_STATUSES.includes(status)) {
      params.push(status);
      whereClause = `WHERE d.status = $${params.length}`;
    }

    const result = await query(`
      SELECT d.*, u.first_name, u.last_name, u.email, ip.name as plan_name
      FROM deposits d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN investment_plans ip ON d.plan_id = ip.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json({ success: true, deposits: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/deposits/:id/confirm', adminAuth, async (req, res) => {
  try {
    const { admin_note } = req.body;
    const depositResult = await query(
      "SELECT * FROM deposits WHERE id = $1 AND status = 'pending'",
      [req.params.id]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found or already processed' });
    }

    const deposit = depositResult.rows[0];

    // Update deposit status
    await query(
      "UPDATE deposits SET status='confirmed', admin_note=$1, confirmed_at=NOW() WHERE id=$2",
      [admin_note, deposit.id]
    );

    // Update user balance
    await query(`
      UPDATE user_balances
      SET total_deposited = total_deposited + $1,
          active_investment = active_investment + $1
      WHERE user_id = $2
    `, [deposit.amount, deposit.user_id]);

    // Create active investment record
    const plan = await query('SELECT * FROM investment_plans WHERE id = $1', [deposit.plan_id]);
    if (plan.rows.length > 0) {
      const p = plan.rows[0];
      const dailyRate = p.roi_percent / 100;
      const totalProfit = parseFloat(deposit.amount) * dailyRate * p.duration_days;
      const endsAt = new Date(Date.now() + p.duration_days * 86400000);

      await query(`
        INSERT INTO user_investments (user_id, plan_id, amount, roi_percent, roi_period, duration_days, total_expected_profit, ends_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [deposit.user_id, deposit.plan_id, deposit.amount, p.roi_percent, p.roi_period, p.duration_days, totalProfit, endsAt]);
    }

    // Log transaction
    await query(`INSERT INTO transactions (user_id, type, amount, description, reference_id)
      VALUES ($1, 'deposit', $2, $3, $4)`,
      [deposit.user_id, deposit.amount, `Deposit confirmed via ${deposit.currency}`, deposit.id]);

    // Notify user
    await query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,'success')`,
      [deposit.user_id, 'Deposit Confirmed', `Your deposit of $${parseFloat(deposit.amount).toFixed(2)} has been confirmed and your investment is now active.`]);

    const userResult = await query('SELECT first_name, email FROM users WHERE id = $1', [deposit.user_id]);
    const user = userResult.rows[0];
    await sendEmail(user.email, 'deposit_confirmed', {
      first_name: user.first_name,
      amount: parseFloat(deposit.amount).toFixed(2),
    });

    // Handle referral bonus
    const referrerResult = await query('SELECT referred_by FROM users WHERE id = $1', [deposit.user_id]);
    const referrerId = referrerResult.rows[0]?.referred_by;
    if (referrerId) {
      const bonusResult = await query("SELECT value FROM site_settings WHERE key = 'referral_percent'");
      const bonusPercent = parseFloat(bonusResult.rows[0]?.value || 5);
      const bonusAmount = parseFloat(deposit.amount) * bonusPercent / 100;

      await query('UPDATE user_balances SET withdrawable_balance = withdrawable_balance + $1, referral_earnings = referral_earnings + $1 WHERE user_id = $2',
        [bonusAmount, referrerId]);

      await query('INSERT INTO referral_earnings (referrer_id, referred_id, deposit_id, amount, percent) VALUES ($1,$2,$3,$4,$5)',
        [referrerId, deposit.user_id, deposit.id, bonusAmount, bonusPercent]);

      await query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,'success')`,
        [referrerId, 'Referral Bonus!', `You earned $${bonusAmount.toFixed(2)} referral bonus from a deposit.`]);
    }

    res.json({ success: true, message: 'Deposit confirmed successfully' });
  } catch (error) {
    console.error('Confirm deposit error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/deposits/:id/reject', adminAuth, async (req, res) => {
  try {
    const { admin_note } = req.body;
    const result = await query(
      "UPDATE deposits SET status='rejected', admin_note=$1 WHERE id=$2 AND status='pending' RETURNING user_id, amount",
      [admin_note, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deposit not found or already processed' });
    }

    const { user_id, amount } = result.rows[0];
    await query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,'error')`,
      [user_id, 'Deposit Rejected', `Your deposit of $${parseFloat(amount).toFixed(2)} was rejected. Reason: ${admin_note || 'Contact support'}`]);

    res.json({ success: true, message: 'Deposit rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// WITHDRAWAL MANAGEMENT
// ============================================================
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'processing'];
    const status = req.query.status || 'all';

    const params = [];
    let whereClause = '';
    if (status !== 'all' && ALLOWED_STATUSES.includes(status)) {
      params.push(status);
      whereClause = `WHERE w.status = $1`;
    }

    const result = await query(`
      SELECT w.*, u.first_name, u.last_name, u.email
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ${whereClause}
      ORDER BY w.created_at DESC
      LIMIT 50
    `, params);
    res.json({ success: true, withdrawals: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/withdrawals/:id/approve', adminAuth, async (req, res) => {
  try {
    const { admin_note } = req.body;
    const result = await query(
      "UPDATE withdrawals SET status='approved', admin_note=$1, processed_at=NOW() WHERE id=$2 AND status='pending' RETURNING *",
      [admin_note, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found or already processed' });
    }

    const withdrawal = result.rows[0];

    // Update totals
    await query('UPDATE user_balances SET total_withdrawn = total_withdrawn + $1 WHERE user_id = $2',
      [withdrawal.amount, withdrawal.user_id]);

    await query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,'success')`,
      [withdrawal.user_id, 'Withdrawal Approved', `Your withdrawal of $${parseFloat(withdrawal.amount).toFixed(2)} via ${withdrawal.currency} has been approved.`]);

    const userResult = await query('SELECT first_name, email FROM users WHERE id = $1', [withdrawal.user_id]);
    const user = userResult.rows[0];
    await sendEmail(user.email, 'withdrawal_approved', {
      first_name: user.first_name,
      amount: parseFloat(withdrawal.amount).toFixed(2),
      currency: withdrawal.currency,
    });

    res.json({ success: true, message: 'Withdrawal approved' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/withdrawals/:id/reject', adminAuth, async (req, res) => {
  try {
    const { admin_note } = req.body;
    const result = await query(
      "UPDATE withdrawals SET status='rejected', admin_note=$1, processed_at=NOW() WHERE id=$2 AND status='pending' RETURNING *",
      [admin_note, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    const withdrawal = result.rows[0];
    // Refund the held balance
    await query('UPDATE user_balances SET withdrawable_balance = withdrawable_balance + $1 WHERE user_id = $2',
      [withdrawal.amount, withdrawal.user_id]);

    await query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,'error')`,
      [withdrawal.user_id, 'Withdrawal Rejected', `Your withdrawal of $${parseFloat(withdrawal.amount).toFixed(2)} was rejected. ${admin_note || ''}`]);

    const userResult = await query('SELECT first_name, email FROM users WHERE id = $1', [withdrawal.user_id]);
    const user = userResult.rows[0];
    await sendEmail(user.email, 'withdrawal_rejected', {
      first_name: user.first_name,
      amount: parseFloat(withdrawal.amount).toFixed(2),
      reason: admin_note || 'Contact support for details',
    });

    res.json({ success: true, message: 'Withdrawal rejected and balance refunded' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// INVESTMENT PLAN MANAGEMENT
// ============================================================
router.get('/plans', adminAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM investment_plans ORDER BY tier_order ASC');
    res.json({ success: true, plans: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/plans/:id', adminAuth, [
  body('name').trim().notEmpty(),
  body('roi_percent').isFloat({ min: 0 }),
  body('duration_days').isInt({ min: 1 }),
  body('min_amount').isFloat({ min: 1 }),
  body('max_amount').isFloat({ min: 1 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, description, roi_percent, roi_period, duration_days, min_amount, max_amount, color_hex, features, is_active } = req.body;

    const result = await query(`
      UPDATE investment_plans
      SET name=$1, description=$2, roi_percent=$3, roi_period=$4, duration_days=$5,
          min_amount=$6, max_amount=$7, color_hex=$8, features=$9, is_active=$10
      WHERE id=$11
      RETURNING *
    `, [name, description, roi_percent, roi_period || 'daily', duration_days, min_amount, max_amount, color_hex, features, is_active !== false, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, plan: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// SITE SETTINGS MANAGEMENT
// ============================================================
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM site_settings ORDER BY key ASC');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/settings', adminAuth, async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await query(
        'UPDATE site_settings SET value = $1, updated_at = NOW() WHERE key = $2',
        [value, key]
      );
    }
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// EMAIL TEMPLATES MANAGEMENT
// ============================================================
router.get('/email-templates', adminAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM email_templates ORDER BY name ASC');
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/email-templates/:id', adminAuth, async (req, res) => {
  try {
    const { subject, body: templateBody } = req.body;
    const result = await query(
      'UPDATE email_templates SET subject=$1, body=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [subject, templateBody, req.params.id]
    );
    res.json({ success: true, template: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// GET /admin/users/:id/kyc-docs
router.get('/users/:id/kyc-docs', adminAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ success: true, docs: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

// ============================================================
// ADMIN TRANSACTIONS — Platform-wide ledger
// ============================================================
router.get('/transactions', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;
    const type = req.query.type;
    const search = req.query.search;

    let where = [];
    let params = [];
    let idx = 1;

    if (type) { where.push(`t.type = $${idx++}`); params.push(type); }
    if (search) {
      where.push(`(u.email ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx})`);
      params.push('%' + search + '%'); idx++;
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const result = await query(`
      SELECT t.*, u.first_name, u.last_name, u.email
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    const countResult = await query(`
      SELECT COUNT(*) FROM transactions t JOIN users u ON t.user_id = u.id ${whereClause}
    `, params);

    res.json({
      success: true,
      transactions: result.rows,
      pagination: { page, limit, total: parseInt(countResult.rows[0].count) }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
