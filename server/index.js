// ============================================================================
// METFRAA EHS — Express Server Entry Point
// ============================================================================
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const adminRoutes = require('./routes/admin');
const { ALL_FORMS, INSPECTORS } = require('./lib/forms-config');
const { requireAuth, attachUser } = require('./lib/auth-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Trust proxy (Render runs behind a load balancer; needed for secure cookies)
app.set('trust proxy', 1);

// --- Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Sessions (signed cookies, no DB required)
app.use(cookieSession({
  name: 'metfraa_ehs_session',
  keys: [process.env.SESSION_SECRET || 'dev-only-please-set-SESSION_SECRET'],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
}));

// --- Make user info available to all requests
app.use(attachUser);

// --- Static files (logo, CSS, client JS)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Public routes (no auth needed)
app.use('/auth', authRoutes);

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
  console.log(`[Metfraa EHS] App URL: ${process.env.APP_BASE_URL || `http://localhost:${PORT}`}`);
});
