const { query } = require('../utils/db');

// Middleware: check if site is in maintenance mode
// Admins always pass through. Everyone else sees 503.
const maintenanceCheck = async (req, res, next) => {
  try {
    // Skip for API auth routes (login/register) and health check
    const allowedPaths = ['/api/auth/login', '/api/auth/register', '/api/health'];
    if (allowedPaths.some(p => req.path.startsWith(p))) return next();

    // Check cache first (refresh every 60s)
    const now = Date.now();
    if (maintenanceCheck._cache && (now - maintenanceCheck._cacheTime) < 60000) {
      if (maintenanceCheck._cache === 'true') {
        return handleMaintenance(req, res);
      }
      return next();
    }

    const result = await query("SELECT value FROM site_settings WHERE key = 'maintenance_mode'");
    const mode = result.rows[0]?.value || 'false';
    maintenanceCheck._cache = mode;
    maintenanceCheck._cacheTime = now;

    if (mode === 'true') return handleMaintenance(req, res);
    next();
  } catch (err) {
    // If DB check fails, let traffic through
    next();
  }
};

function handleMaintenance(req, res) {
  // API requests get JSON
  if (req.path.startsWith('/api/')) {
    return res.status(503).json({
      success: false,
      message: 'Platform is currently under maintenance. Please try again shortly.'
    });
  }
  // Page requests get maintenance HTML
  res.status(503).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Under Maintenance — TransAtlantia Trades</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#070B14;color:#E8EDF5;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
    .icon{font-size:4rem;margin-bottom:24px}
    h1{font-size:2rem;font-weight:800;margin-bottom:12px}
    p{color:#7A8BA8;line-height:1.7;max-width:400px;margin:0 auto 24px}
    .badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:100px;background:rgba(0,148,255,.1);border:1px solid rgba(0,148,255,.2);color:#0094FF;font-size:14px;font-weight:600}
    .dot{width:8px;height:8px;background:#0094FF;border-radius:50%;animation:blink 1.5s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
  </style>
</head>
<body>
  <div>
    <div class="icon">⚡</div>
    <h1>Under Maintenance</h1>
    <p>TransAtlantia Trades is currently undergoing scheduled maintenance to improve your experience. We'll be back shortly.</p>
    <div class="badge"><span class="dot"></span>We'll be back soon</div>
  </div>
</body>
</html>`);
}

module.exports = { maintenanceCheck };
