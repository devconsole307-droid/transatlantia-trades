const jwt = require('jsonwebtoken');
const { query } = require('./utils/db');

// Validate that a string looks like a UUID before hitting the DB
const isValidUUID = (str) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const setupChatSocket = (io) => {
  // Middleware: authenticate socket connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await query(
          'SELECT id, first_name, last_name, email, is_admin FROM users WHERE id = $1',
          [decoded.userId]
        );
        if (result.rows.length > 0) {
          socket.user = result.rows[0];
        }
      } catch (e) { /* guest — no user attached */ }
    }
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const isAdmin = user?.is_admin;

    // Simple in-memory rate limiter: max 20 messages per minute per socket
    let msgCount = 0;
    let msgWindow = Date.now();
    const MSG_LIMIT = 20;
    const MSG_WINDOW_MS = 60 * 1000;

    const isRateLimited = () => {
      const now = Date.now();
      if (now - msgWindow > MSG_WINDOW_MS) {
        msgCount = 0;
        msgWindow = now;
      }
      msgCount++;
      return msgCount > MSG_LIMIT;
    };

    // Admin joins the shared admin room for broadcast notifications
    if (isAdmin) {
      socket.join('admins');
      console.log(`[CHAT] Admin connected: ${user.first_name}`);
    } else {
      console.log(`[CHAT] User connected: ${user ? user.first_name : 'Guest'}`);
    }

    // ---- JOIN SESSION ROOM ----
    socket.on('join_session', async ({ session_id }) => {
      // Guard: ignore the dummy '__admin__' marker and any non-UUID values
      if (!session_id || !isValidUUID(session_id)) return;

      socket.join(`session_${session_id}`);

      // Mark session active and notify the user when a real admin opens it
      if (isAdmin) {
        try {
          await query(
            "UPDATE chat_sessions SET status = 'active', assigned_admin_id = $1 WHERE id = $2 AND status = 'open'",
            [user.id, session_id]
          );
          socket.to(`session_${session_id}`).emit('agent_joined', {
            name: `${user.first_name} ${user.last_name}`
          });
        } catch (err) {
          console.error('[CHAT] join_session DB error:', err.message);
        }
      }
    });

    // ---- SEND MESSAGE ----
    socket.on('send_message', async ({ session_id, message }) => {
      if (!message?.trim() || !session_id || !isValidUUID(session_id)) return;
      if (isRateLimited()) {
        socket.emit('error', { message: 'You are sending messages too quickly. Please slow down.' });
        return;
      }

      try {
        const senderType = isAdmin ? 'admin' : 'user';
        const senderName = user
          ? `${user.first_name} ${user.last_name}`
          : (socket.handshake.auth?.guest_name || 'Guest');
        const senderId = user?.id || null;

        // Save to DB
        const result = await query(
          `INSERT INTO chat_messages (session_id, sender_type, sender_id, sender_name, message)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [session_id, senderType, senderId, senderName, message.trim()]
        );

        // Update session last_message_at
        await query(
          'UPDATE chat_sessions SET last_message_at = NOW() WHERE id = $1',
          [session_id]
        );

        const msg = result.rows[0];

        // Broadcast to everyone in this session room
        io.to(`session_${session_id}`).emit('new_message', msg);

        // If a user sent it, ping all admins with a session update
        if (!isAdmin) {
          const session = await query(
            'SELECT guest_name FROM chat_sessions WHERE id = $1',
            [session_id]
          );
          io.to('admins').emit('session_update', {
            session_id,
            last_message: message.trim(),
            last_message_at: new Date(),
            unread: true,
            guest_name: session.rows[0]?.guest_name || senderName,
          });
        }
      } catch (error) {
        console.error('[CHAT] Send message error:', error.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ---- TYPING INDICATOR ----
    socket.on('typing', ({ session_id, is_typing }) => {
      if (!session_id || !isValidUUID(session_id)) return;
      const name = user
        ? user.first_name
        : (socket.handshake.auth?.guest_name || 'Guest');
      socket.to(`session_${session_id}`).emit('user_typing', {
        name,
        is_typing,
        is_admin: !!isAdmin,
      });
    });

    // ---- CLOSE SESSION (admin only) ----
    socket.on('close_session', async ({ session_id }) => {
      if (!isAdmin || !session_id || !isValidUUID(session_id)) return;
      try {
        await query(
          "UPDATE chat_sessions SET status = 'closed' WHERE id = $1",
          [session_id]
        );
        const result = await query(
          `INSERT INTO chat_messages (session_id, sender_type, sender_name, message)
           VALUES ($1, 'system', 'TransAtlantia Support', 'This chat session has been closed. Thank you for contacting us! 😊') RETURNING *`,
          [session_id]
        );
        io.to(`session_${session_id}`).emit('new_message', result.rows[0]);
        io.to(`session_${session_id}`).emit('session_closed');
      } catch (error) {
        console.error('[CHAT] Close session error:', error.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[CHAT] Disconnected: ${user ? user.first_name : 'Guest'}`);
    });
  });

  console.log('[CHAT] Socket.io chat system initialized');
};

module.exports = { setupChatSocket };
