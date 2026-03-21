const express = require('express');
const router = express.Router();
const { query } = require('../utils/db');
const { auth, adminAuth } = require('../middleware/auth');

// ============================================================
// USER — Start or resume a chat session
// ============================================================
router.post('/session', async (req, res) => {
  try {
    const { guest_name, guest_email, subject } = req.body;

    // Authenticated users use their account
    let userId = null;
    let displayName = guest_name || 'Guest';
    let displayEmail = guest_email || null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const userResult = await query('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [decoded.userId]);
        if (userResult.rows.length > 0) {
          const u = userResult.rows[0];
          userId = u.id;
          displayName = `${u.first_name} ${u.last_name}`;
          displayEmail = u.email;
        }
      } catch (e) { /* no auth, guest mode */ }
    }

    // Check for existing open session
    let session;
    if (userId) {
      const existing = await query(
        "SELECT * FROM chat_sessions WHERE user_id = $1 AND status IN ('open','active') ORDER BY created_at DESC LIMIT 1",
        [userId]
      );
      if (existing.rows.length > 0) {
        session = existing.rows[0];
      }
    }

    if (!session) {
      const result = await query(
        'INSERT INTO chat_sessions (user_id, guest_name, guest_email, subject) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, displayName, displayEmail, subject || 'Support Request']
      );
      session = result.rows[0];

      // System welcome message
      await query(
        "INSERT INTO chat_messages (session_id, sender_type, sender_name, message) VALUES ($1, 'system', 'TransAtlantia Support', $2)",
        [session.id, `Hello ${displayName}! 👋 Welcome to TransAtlantia support. An agent will be with you shortly. In the meantime, feel free to describe your issue.`]
      );
    }

    // Get messages
    const messages = await query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [session.id]
    );

    res.json({ success: true, session, messages: messages.rows });
  } catch (error) {
    console.error('Chat session error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// USER — Get session messages
// ============================================================
router.get('/session/:id/messages', async (req, res) => {
  try {
    const messages = await query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ success: true, messages: messages.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// ADMIN — Get all chat sessions
// ============================================================
router.get('/admin/sessions', adminAuth, async (req, res) => {
  try {
    const ALLOWED_STATUSES = ['open', 'active', 'closed', 'archived'];
    const status = req.query.status || 'open';

    const params = [];
    let whereClause = '';
    if (status !== 'all' && ALLOWED_STATUSES.includes(status)) {
      params.push(status);
      whereClause = `WHERE cs.status = $1`;
    }

    const result = await query(`
      SELECT cs.*,
        (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id AND cm.is_read = FALSE AND cm.sender_type = 'user') as unread_count,
        (SELECT message FROM chat_messages cm WHERE cm.session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_sessions cs
      ${whereClause}
      ORDER BY cs.last_message_at DESC
      LIMIT 100
    `, params);

    res.json({ success: true, sessions: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// ADMIN — Get single session with messages
// ============================================================
router.get('/admin/sessions/:id', adminAuth, async (req, res) => {
  try {
    const session = await query('SELECT * FROM chat_sessions WHERE id = $1', [req.params.id]);
    if (session.rows.length === 0) return res.status(404).json({ success: false, message: 'Session not found' });

    const messages = await query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    // Mark user messages as read
    await query(
      "UPDATE chat_messages SET is_read = TRUE WHERE session_id = $1 AND sender_type = 'user'",
      [req.params.id]
    );

    res.json({ success: true, session: session.rows[0], messages: messages.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// ADMIN — Update session status
// ============================================================
router.patch('/admin/sessions/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    await query('UPDATE chat_sessions SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================================
// ADMIN — Get unread count (for badge)
// ============================================================
router.get('/admin/unread', adminAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as count FROM chat_messages
      WHERE sender_type = 'user' AND is_read = FALSE
    `);
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
