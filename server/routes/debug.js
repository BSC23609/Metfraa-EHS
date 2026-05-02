// ============================================================================
// /debug routes — diagnostic endpoints to troubleshoot deployment issues.
//
// These are PUBLIC (no auth) on purpose: when auth is broken, you can't log
// in to see what's wrong. They never expose secret VALUES — only whether
// each var is set, the cleaned form of URL-type vars, and file-system
// presence checks.
// ============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { cleanEnv, cleanUrlBase } = require('../lib/clean-env');

const router = express.Router();

router.get('/env', (req, res) => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const logoPath = path.join(publicDir, 'img', 'logo.png');

  // List what's actually present in /public so we know if files were committed
  let publicListing = [];
  try {
    publicListing = fs.readdirSync(publicDir, { withFileTypes: true })
      .map(e => e.isDirectory() ? `${e.name}/` : e.name);
  } catch (err) {
    publicListing = [`ERROR reading: ${err.message}`];
  }
  let imgListing = [];
  try {
    imgListing = fs.readdirSync(path.join(publicDir, 'img'));
  } catch (err) {
    imgListing = [`ERROR reading: ${err.message}`];
  }

  const data = {
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: cleanEnv(process.env.NODE_ENV) || '(unset)',
      PORT: cleanEnv(process.env.PORT) || '(unset)',
      APP_BASE_URL: {
        raw: process.env.APP_BASE_URL || '(unset)',
        raw_length: (process.env.APP_BASE_URL || '').length,
        cleaned: cleanUrlBase(process.env.APP_BASE_URL),
        cleaned_length: cleanUrlBase(process.env.APP_BASE_URL).length,
      },
      SESSION_SECRET_set: !!cleanEnv(process.env.SESSION_SECRET),
      SESSION_SECRET_length: (cleanEnv(process.env.SESSION_SECRET) || '').length,
      GOOGLE_CLIENT_ID_set: !!cleanEnv(process.env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_ID_suffix: (cleanEnv(process.env.GOOGLE_CLIENT_ID) || '').slice(-30),
      GOOGLE_CLIENT_SECRET_set: !!cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
      AZURE_TENANT_ID_set: !!cleanEnv(process.env.AZURE_TENANT_ID),
      AZURE_TENANT_ID_value: cleanEnv(process.env.AZURE_TENANT_ID),
      AZURE_CLIENT_ID_set: !!cleanEnv(process.env.AZURE_CLIENT_ID),
      AZURE_CLIENT_ID_value: cleanEnv(process.env.AZURE_CLIENT_ID),
      AZURE_CLIENT_SECRET_set: !!cleanEnv(process.env.AZURE_CLIENT_SECRET),
      ONEDRIVE_USER_ID: cleanEnv(process.env.ONEDRIVE_USER_ID) || '(unset)',
      ONEDRIVE_ROOT_FOLDER: cleanEnv(process.env.ONEDRIVE_ROOT_FOLDER) || '(unset)',
      ADMIN_EMAILS: cleanEnv(process.env.ADMIN_EMAILS) || '(unset)',
    },
    derived_redirect_uris: {
      google: `${cleanUrlBase(process.env.APP_BASE_URL) || 'http://localhost:3000'}/auth/google/callback`,
      microsoft: `${cleanUrlBase(process.env.APP_BASE_URL) || 'http://localhost:3000'}/auth/microsoft/callback`,
    },
    filesystem: {
      cwd: process.cwd(),
      public_dir: publicDir,
      public_exists: fs.existsSync(publicDir),
      public_listing: publicListing,
      img_listing: imgListing,
      logo_path: logoPath,
      logo_exists: fs.existsSync(logoPath),
      logo_size_bytes: fs.existsSync(logoPath) ? fs.statSync(logoPath).size : null,
    },
    runtime: {
      node_version: process.version,
      platform: process.platform,
      uptime_seconds: Math.floor(process.uptime()),
    },
  };

  // Check the things most likely to be wrong and surface a clear verdict
  const issues = [];
  if (!data.env.APP_BASE_URL.cleaned) {
    issues.push('APP_BASE_URL is empty after cleaning. Set it in Render to: https://ehs.metfraa.com');
  } else if (data.env.APP_BASE_URL.raw !== data.env.APP_BASE_URL.cleaned) {
    issues.push(`APP_BASE_URL was cleaned from "${data.env.APP_BASE_URL.raw}" to "${data.env.APP_BASE_URL.cleaned}". The cleaning is working, but you should fix it in Render too.`);
  }
  if (!data.filesystem.logo_exists) {
    issues.push(`Logo file missing at ${logoPath}. Make sure public/img/logo.png is committed to git.`);
  }
  if (!data.env.GOOGLE_CLIENT_ID_set) issues.push('GOOGLE_CLIENT_ID is not set');
  if (!data.env.GOOGLE_CLIENT_SECRET_set) issues.push('GOOGLE_CLIENT_SECRET is not set');
  if (!data.env.AZURE_TENANT_ID_set) issues.push('AZURE_TENANT_ID is not set');
  if (!data.env.AZURE_CLIENT_ID_set) issues.push('AZURE_CLIENT_ID is not set');
  if (!data.env.AZURE_CLIENT_SECRET_set) issues.push('AZURE_CLIENT_SECRET is not set');
  data.issues = issues;
  data.status = issues.length === 0 ? '✅ Looks good' : `⚠️ ${issues.length} issue(s) found`;

  res.type('application/json').send(JSON.stringify(data, null, 2));
});

// Direct logo test — bypasses static middleware to confirm file is on disk
router.get('/logo', (req, res) => {
  const logoPath = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');
  if (!fs.existsSync(logoPath)) {
    return res.status(404).type('text/plain').send(
      `Logo NOT FOUND on disk at: ${logoPath}\n\n` +
      `This means public/img/logo.png was not committed to git or not deployed to Render.\n` +
      `Run: git status public/img/logo.png\n` +
      `If untracked, run: git add -f public/img/logo.png && git commit && git push`
    );
  }
  res.type('image/png').sendFile(logoPath);
});

module.exports = router;
