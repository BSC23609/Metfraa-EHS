// ============================================================================
// Admin routes — restricted to ADMIN_EMAILS
// ============================================================================
const express = require('express');
const path = require('path');
const { requireAdmin } = require('../lib/auth-middleware');

const router = express.Router();

router.use(requireAdmin);

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'admin.html'));
});

router.get('/api/info', (req, res) => {
  res.json({
    user: { name: req.user.name, email: req.user.email },
    adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean),
    onedriveRoot: process.env.ONEDRIVE_ROOT_FOLDER || 'Metfraa-EHS',
    onedriveUser: process.env.ONEDRIVE_USER_ID,
  });
});

module.exports = router;
