/**
 * TransAtlantia Live Chat Widget
 * Include after utils.js on every page
 * Requires: socket.io client from CDN
 */
(function () {
  'use strict';

  // ---- CONFIG ----
  const SOCKET_URL = window.location.origin;
  const TOKEN = localStorage.getItem('platform_token');
  const USER = (() => { try { return JSON.parse(localStorage.getItem('platform_user')); } catch { return null; } })();

  // ---- STATE ----
  let socket = null;
  let sessionId = null;
  let isOpen = false;
  let isConnected = false;
  let typingTimer = null;
  let unreadCount = 0;
  let sessionClosed = false;

  // ---- INJECT HTML ----
  const html = `
    <link rel="stylesheet" href="/css/chat.css">
    <div class="chat-bubble" id="chatBubble">
      <div class="chat-window" id="chatWindow">
        <div class="chat-header">
          <div class="chat-header-avatar">⚡</div>
          <div class="chat-header-info">
            <div class="chat-header-name">TransAtlantia Support</div>
            <div class="chat-header-status"><span class="chat-status-dot"></span>Online • Typically replies in minutes</div>
          </div>
        </div>

        <!-- PRE-CHAT FORM (guest only) -->
        ${USER ? '' : `
        <div class="pre-chat-form" id="preChatForm">
          <p class="pre-chat-intro">👋 Hi there! Before we start, tell us a little about yourself.</p>
          <input type="text" class="chat-input-field" id="chatGuestName" placeholder="Your name *" required>
          <input type="email" class="chat-input-field" id="chatGuestEmail" placeholder="Your email *" required>
          <input type="text" class="chat-input-field" id="chatSubject" placeholder="What do you need help with?">
          <button class="chat-start-btn" id="startChatBtn" onclick="ChatWidget.startChat()">Start Chatting →</button>
        </div>`}

        <!-- MESSAGES AREA -->
        <div class="chat-messages" id="chatMessages" style="${USER ? '' : 'display:none'}"></div>

        <!-- TYPING INDICATOR -->
        <div id="typingIndicator" style="display:none;padding:0 14px 8px">
          <div class="typing-indicator">
            <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
          </div>
        </div>

        <!-- CLOSED BANNER -->
        <div class="chat-closed-banner" id="chatClosedBanner" style="display:none">
          This session has been closed. <a href="#" onclick="ChatWidget.newSession()" style="color:#FF4757;font-weight:600">Start a new chat</a>
        </div>

        <!-- INPUT BAR -->
        <div class="chat-input-bar" id="chatInputBar" style="${USER ? '' : 'display:none'}">
          <textarea class="chat-text-input" id="chatInput" placeholder="Type a message..." rows="1"></textarea>
          <button class="chat-send-btn" id="chatSendBtn" onclick="ChatWidget.sendMessage()">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>

      <button class="chat-open-btn" id="chatOpenBtn" onclick="ChatWidget.toggle()">
        <!-- Chat icon -->
        <svg class="icon-chat" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
        <!-- Close icon -->
        <svg class="icon-close" viewBox="0 0 24 24" style="display:none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        <span class="chat-unread-badge" id="chatBadge" style="display:none">0</span>
      </button>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', html);

    // Auto-start chat for logged-in users
    if (USER) {
      initSocket();
      startSession();
    }

    // Auto-resize textarea
    const input = document.getElementById('chatInput');
    if (input) {
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 90) + 'px';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          ChatWidget.sendMessage();
        }
      });
      input.addEventListener('input', handleTyping);
    }
  });

  // ---- SOCKET INIT ----
  function initSocket() {
    // Load socket.io client dynamically
    if (window.io) {
      connectSocket();
    } else {
      const s = document.createElement('script');
      s.src = '/socket.io/socket.io.js';
      s.onload = connectSocket;
      document.head.appendChild(s);
    }
  }

  function connectSocket() {
    socket = window.io(SOCKET_URL, {
      auth: { token: TOKEN, guest_name: getGuestName() },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      isConnected = true;
      if (sessionId) socket.emit('join_session', { session_id: sessionId });
    });

    socket.on('new_message', (msg) => {
      appendMessage(msg);
      if (!isOpen && msg.sender_type !== 'user') {
        unreadCount++;
        updateBadge();
      }
    });

    socket.on('user_typing', ({ name, is_typing, is_admin }) => {
      if (is_admin) {
        document.getElementById('typingIndicator').style.display = is_typing ? 'block' : 'none';
        scrollToBottom();
      }
    });

    socket.on('agent_joined', ({ name }) => {
      appendSystemMsg(`${name} has joined the chat ✅`);
    });

    socket.on('session_closed', () => {
      sessionClosed = true;
      document.getElementById('chatClosedBanner').style.display = 'block';
      document.getElementById('chatInputBar').style.display = 'none';
    });

    socket.on('disconnect', () => { isConnected = false; });
  }

  // ---- START SESSION ----
  async function startSession() {
    try {
      const body = USER
        ? {}
        : {
            guest_name: document.getElementById('chatGuestName')?.value,
            guest_email: document.getElementById('chatGuestEmail')?.value,
            subject: document.getElementById('chatSubject')?.value,
          };

      const res = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        sessionId = data.session.id;
        sessionClosed = data.session.status === 'closed';

        // Show messages area
        document.getElementById('chatMessages').style.display = 'flex';
        document.getElementById('preChatForm') && (document.getElementById('preChatForm').style.display = 'none');

        if (!sessionClosed) {
          document.getElementById('chatInputBar').style.display = 'flex';
        } else {
          document.getElementById('chatClosedBanner').style.display = 'block';
        }

        // Render history
        data.messages.forEach(appendMessage);
        scrollToBottom();

        // Join socket room
        if (socket && isConnected) {
          socket.emit('join_session', { session_id: sessionId });
        } else {
          initSocket();
        }
      }
    } catch (e) {
      console.error('[CHAT] Session start error:', e);
    }
  }

  // ---- APPEND MESSAGE ----
  function appendMessage(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-msg ${msg.sender_type}`;

    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderLabel = msg.sender_type === 'admin' ? `<div class="chat-msg-meta">Support Agent · ${time}</div>` :
                        msg.sender_type === 'user' ? `<div class="chat-msg-meta">${time}</div>` : '';

    div.innerHTML = `
      <div class="chat-msg-bubble">${escapeHtml(msg.message)}</div>
      ${senderLabel}
    `;
    container.appendChild(div);
    scrollToBottom();

    // Hide typing when message arrives
    if (msg.sender_type === 'admin') {
      document.getElementById('typingIndicator').style.display = 'none';
    }
  }

  function appendSystemMsg(text) {
    appendMessage({ sender_type: 'system', message: text, created_at: new Date() });
  }

  function scrollToBottom() {
    const c = document.getElementById('chatMessages');
    if (c) c.scrollTop = c.scrollHeight;
  }

  function updateBadge() {
    const badge = document.getElementById('chatBadge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.style.display = 'flex';
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    } else {
      badge.style.display = 'none';
    }
  }

  function handleTyping() {
    if (!socket || !sessionId) return;
    socket.emit('typing', { session_id: sessionId, is_typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket.emit('typing', { session_id: sessionId, is_typing: false });
    }, 1500);
  }

  function getGuestName() {
    return document.getElementById('chatGuestName')?.value || 'Guest';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  // ---- PUBLIC API ----
  window.ChatWidget = {
    toggle() {
      isOpen = !isOpen;
      document.getElementById('chatWindow').classList.toggle('open', isOpen);
      document.getElementById('chatOpenBtn').classList.toggle('is-open', isOpen);
      if (isOpen) {
        unreadCount = 0;
        updateBadge();
        scrollToBottom();
        setTimeout(() => document.getElementById('chatInput')?.focus(), 300);
      }
    },

    startChat() {
      const name = document.getElementById('chatGuestName')?.value?.trim();
      const email = document.getElementById('chatGuestEmail')?.value?.trim();
      if (!name) { alert('Please enter your name'); return; }
      if (!email || !email.includes('@')) { alert('Please enter a valid email'); return; }
      const btn = document.getElementById('startChatBtn');
      btn.disabled = true;
      btn.textContent = 'Connecting...';
      startSession();
    },

    sendMessage() {
      const input = document.getElementById('chatInput');
      const message = input?.value?.trim();
      if (!message || !sessionId || sessionClosed) return;

      const senderName = USER ? `${USER.first_name} ${USER.last_name}` : getGuestName();
      const fakeMsg = {
        sender_type: 'user',
        sender_name: senderName,
        message,
        created_at: new Date(),
      };
      appendMessage(fakeMsg);

      if (socket && isConnected) {
        socket.emit('send_message', { session_id: sessionId, message });
      }

      input.value = '';
      input.style.height = 'auto';
      socket?.emit('typing', { session_id: sessionId, is_typing: false });
    },

    newSession() {
      sessionId = null;
      sessionClosed = false;
      document.getElementById('chatMessages').innerHTML = '';
      document.getElementById('chatClosedBanner').style.display = 'none';
      document.getElementById('chatInputBar').style.display = 'flex';

      if (USER) {
        startSession();
      } else {
        document.getElementById('chatMessages').style.display = 'none';
        document.getElementById('chatInputBar').style.display = 'none';
        document.getElementById('preChatForm').style.display = 'flex';
        const btn = document.getElementById('startChatBtn');
        if (btn) { btn.disabled = false; btn.textContent = 'Start Chatting →'; }
      }
    },
  };
})();
