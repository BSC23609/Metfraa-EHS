// ============================================================================
// Authentication helpers — populates req.user from the session cookie
// ============================================================================

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function attachUser(req, res, next) {
  if (req.session && req.session.user) {
    req.user = {
      ...req.session.user,
      isAdmin: ADMIN_EMAILS.includes((req.session.user.email || '').toLowerCase()),
    };
  } else {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    // For API calls return JSON; for HTML navigations redirect.
    if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Not authenticated', loginUrl: '/login' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin, ADMIN_EMAILS };
