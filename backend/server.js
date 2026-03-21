const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
// Only load .env in development — in production (Fly.io/Render) secrets are injected
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const { maintenanceCheck } = require('./middleware/maintenance');

// Startup environment check — verify critical secrets are loaded
const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL', 'NODE_ENV'];
const UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(__dirname, '../uploads');
// Ensure upload dirs exist
require('fs').mkdirSync(path.join(UPLOAD_PATH, 'proofs'), { recursive: true });
require('fs').mkdirSync(path.join(UPLOAD_PATH, 'kyc'),    { recursive: true });
requiredEnvVars.forEach(key => {
  if (!process.env[key]) {
    console.error(`[STARTUP] ❌ MISSING ENV VAR: ${key}`);
  } else {
    console.log(`[STARTUP] ✅ ${key} is set (${process.env[key].length} chars)`);
  }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      const allowed = [
        process.env.SITE_URL,
        process.env.FRONTEND_URL,
        process.env.RENDER_EXTERNAL_URL,
        'http://localhost:5000',
        'http://localhost:3000',
      ].filter(Boolean);
      if (!origin || allowed.includes(origin)) return callback(null, true);
      callback(new Error('Socket CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Required for Render — trust the proxy headers
  allowEIO3: true,
  transports: ['websocket', 'polling'],
});
const PORT = process.env.PORT || 10000;

// Trust Render's proxy (required for rate limiting, HTTPS redirect, and real IP detection)
app.set('trust proxy', 1);

// ============================================================
// SECURITY HEADERS — Helmet (fixes XSS, clickjacking, sniffing)
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "translate.google.com",
        "translate.googleapis.com",
        "translate.googleapis.com",
        "cdnjs.cloudflare.com",
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "fonts.gstatic.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:", "https:", "http:"],
      frameSrc: ["'self'", "translate.google.com"],
      objectSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for Google Translate iframe
  xFrameOptions: { action: 'deny' },            // clickjacking protection
  xContentTypeOptions: true,                    // no MIME sniffing
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000,       // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// ============================================================
// CORS — Strict origin, not wildcard
// ============================================================
// Support multiple allowed origins — backend URL, frontend URL, localhost
// RENDER_EXTERNAL_URL is automatically set by Render for the backend service
// FRONTEND_URL is the separate static site URL (set manually in env vars)
const allowedOrigins = [
  process.env.SITE_URL,
  process.env.FRONTEND_URL,
  process.env.RENDER_EXTERNAL_URL,
  // Hardcode Render frontend URL as fallback
  'https://transatlantia-trades-frontend.onrender.com',
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:10000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// HTTPS REDIRECT — in production behind Nginx/proxy
// ============================================================
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ============================================================
// RATE LIMITING
// ============================================================
// Global limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Strict limiter for auth endpoints (login, register, forgot-password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again in 15 minutes.' },
});

// Withdrawal limiter — max 5 per hour
const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  message: { success: false, message: 'Too many withdrawal requests. Please wait before trying again.' },
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);   // FIX: was missing
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/withdrawals', withdrawalLimiter);       // FIX: was missing

// ============================================================
// STATIC FILES — with security headers on uploads
// ============================================================
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve uploads with forced download header (prevents browser execution of HTML/SVG)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache');
  next();
}, express.static(
  process.env.UPLOAD_PATH || path.join(__dirname, '../uploads')
));

// ============================================================
// MAINTENANCE MODE
// ============================================================
app.use(maintenanceCheck);

// ============================================================
// ROUTES
// ============================================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/deposits', require('./routes/deposits'));
app.use('/api/withdrawals', require('./routes/withdrawals'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/chat', require('./routes/chat'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 for unknown HTML pages
app.get('*', (req, res) => {
  if (req.path.endsWith('.html')) {
    return res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============================================================
// GLOBAL ERROR HANDLER — never leak stack traces
// ============================================================
app.use((err, req, res, next) => {
  // Log full error server-side
  console.error('[ERROR]', err.message, err.stack);
  // Only send generic message to client
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ============================================================
// START
// ============================================================
const { setupChatSocket } = require('./chatSocket');
setupChatSocket(io);

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  console.log(`🌐 ${process.env.SITE_URL || `http://localhost:${PORT}`}\n`);
  const { startProfitCron } = require('./utils/profitCron');
  startProfitCron();
});

module.exports = app;
