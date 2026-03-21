const express = require('express');
const router = express.Router();
const { query } = require('../utils/db');
const { auth } = require('../middleware/auth');

// GET /api/plans - Get all active plans
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM investment_plans WHERE is_active = TRUE ORDER BY tier_order ASC'
    );
    res.json({ success: true, plans: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/plans/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM investment_plans WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    res.json({ success: true, plan: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
