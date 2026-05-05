// ============================================================================
// Authentication helpers — populates req.user from the session cookie
// ============================================================================

const { cleanEnv } = require('./clean-env');
const { APPROVER_EMAILS } = require('./forms-config');

const ADMIN_EMAILS = cleanEnv(process.env.ADMIN_EMAILS)
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const APPROVER_EMAILS_LOWER = APPROVER_EMAILS.map(e => e.toLowerCase());

function isApproverEmail(email) {
  const e = (email || '').toLowerCase();
  // Approvers can approve, AND admins also have approval power
  return APPROVER_EMAILS_LOWER.includes(e) || ADMIN_EMAILS.includes(e);
}

function attachUser(req, res, next) {
  if (req.session && req.session.user) {
    const email = (req.session.user.email || '').toLowerCase();
    req.user = {
      ...req.session.user,
      isAdmin: ADMIN_EMAILS.includes(email),
      isApprover: isApproverEmail(email),
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

function requireApprover(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.isApprover) return res.status(403).json({ error: 'Approver access required' });
  next();
}

module.exports = {
  attachUser,
  requireAuth,
  requireAdmin,
  requireApprover,
  ADMIN_EMAILS,
  APPROVER_EMAILS_LOWER,
  isApproverEmail,
};
