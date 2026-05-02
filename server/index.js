// ============================================================================
// METFRAA EHS — Express Server Entry Point
// ============================================================================
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieSession = require('cookie-session');

const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const adminRoutes = require('./routes/admin');
const debugRoutes = require('./routes/debug');
const { ALL_FORMS, INSPECTORS } = require('./lib/forms-config');
const { requireAuth, attachUser } = require('./lib/auth-middleware');
const { cleanEnv, cleanUrlBase } = require('./lib/clean-env');

const app = express();
const PORT = cleanEnv(process.env.PORT) || 3000;

// --- Boot-time diagnostic logging (helps debug Render env issues from logs)
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const LOGO_PATH = path.join(PUBLIC_DIR, 'img', 'logo.png');
console.log('--- Metfraa EHS boot ---');
console.log('  cwd            :', process.cwd());
console.log('  __dirname      :', __dirname);
console.log('  public dir     :', PUBLIC_DIR, fs.existsSync(PUBLIC_DIR) ? '✓ exists' : '✗ MISSING');
console.log('  logo file      :', LOGO_PATH, fs.existsSync(LOGO_PATH) ? `✓ exists (${fs.statSync(LOGO_PATH).size} bytes)` : '✗ MISSING');
console.log('  APP_BASE_URL   :', JSON.stringify(process.env.APP_BASE_URL || '(unset)'));
console.log('  cleaned base   :', JSON.stringify(cleanUrlBase(process.env.APP_BASE_URL)));
if (process.env.APP_BASE_URL && process.env.APP_BASE_URL !== cleanUrlBase(process.env.APP_BASE_URL)) {
  console.warn('  ⚠️  APP_BASE_URL was modified by cleanEnv — your Render env value contains junk (markdown, quotes, etc.)');
}
console.log('-----------------------');

// --- Trust proxy (Render runs behind a load balancer; needed for secure cookies)
app.set('trust proxy', 1);

// --- Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Sessions (signed cookies, no DB required)
app.use(cookieSession({
  name: 'metfraa_ehs_session',
  keys: [cleanEnv(process.env.SESSION_SECRET) || 'dev-only-please-set-SESSION_SECRET'],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'lax',
  secure: cleanEnv(process.env.NODE_ENV) === 'production',
  httpOnly: true,
}));

// --- Make user info available to all requests
app.use(attachUser);

// --- Static files (logo, CSS, client JS) — must be BEFORE any auth middleware
//     Cache-Control set short so logo updates are picked up quickly while debugging.
app.use(express.static(PUBLIC_DIR, {
  maxAge: cleanEnv(process.env.NODE_ENV) === 'production' ? '1h' : 0,
  fallthrough: true,
}));

// --- Public routes (no auth needed)
app.use('/auth', authRoutes);
app.use('/debug', debugRoutes);  // diagnostics — public so you can debug auth issues

// --- Health check (Render uses this)
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Login page
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// --- Everything below requires login
app.use(requireAuth);

// --- API: list of forms (for the dashboard tiles)
app.get('/api/forms', (req, res) => {
  res.json(ALL_FORMS.map(f => ({
    id: f.id,
    code: f.code,
    title: f.title,
    category: f.category,
    icon: f.icon,
  })));
});

// --- API: single form definition (frontend uses this to render the form)
app.get('/api/forms/:id', (req, res) => {
  const form = ALL_FORMS.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
});

// --- API: who am I + dropdown lists
app.get('/api/me', (req, res) => {
  res.json({
    name: req.user.name,
    email: req.user.email,
    picture: req.user.picture,
    isAdmin: req.user.isAdmin,
    inspectors: INSPECTORS,
  });
});

// --- Form submission routes
app.use('/api/submit', formRoutes);

// --- Admin routes
app.use('/admin', adminRoutes);

// --- Dashboard (the main app shell)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// --- Form filling page (single-page renderer for any form)
app.get('/form/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'form.html'));
});

// --- 404
app.use((req, res) => {
  res.status(404).send('Not found');
});

// --- Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[Metfraa EHS] Listening on port ${PORT}`);
  console.log(`[Metfraa EHS] App URL: ${cleanUrlBase(process.env.APP_BASE_URL) || `http://localhost:${PORT}`}`);
  console.log(`[Metfraa EHS] Debug endpoint: ${cleanUrlBase(process.env.APP_BASE_URL) || `http://localhost:${PORT}`}/debug/env`);
});
