// ============================================================================
// Sign-In OAuth routes (Google + Microsoft)
//
// Uses lib/clean-env to handle messy env-var values from Render (markdown
// brackets, quotes, whitespace, zero-width chars). When something goes wrong
// we render an HTML error page that quotes the EXACT cleaned value back so
// you can see what the server is actually using — no more guessing.
// ============================================================================

const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { cleanEnv, cleanUrlBase, requireValidUrl } = require('../lib/clean-env');

const router = express.Router();

// ----------------------------------------------------------------------------
// Config helpers
// ----------------------------------------------------------------------------

function getAppBaseUrl() {
  // Try APP_BASE_URL first; fall back to localhost in dev
  let base = cleanUrlBase(process.env.APP_BASE_URL);
  if (!base) {
    const port = cleanEnv(process.env.PORT) || '3000';
    base = `http://localhost:${port}`;
  }
  return base;
}

function getGoogleRedirectUri() {
  return `${getAppBaseUrl()}/auth/google/callback`;
}

function getMsRedirectUri() {
  return `${getAppBaseUrl()}/auth/microsoft/callback`;
}

function getOAuthClient() {
  return new OAuth2Client(
    cleanEnv(process.env.GOOGLE_CLIENT_ID),
    cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
    getGoogleRedirectUri(),
  );
}

// ----------------------------------------------------------------------------
// HTML error helper — shows the user EXACTLY what's wrong, including the
// cleaned env-var values so deployment issues are debuggable in the browser.
// ----------------------------------------------------------------------------

function renderConfigError(res, title, details) {
  const debugInfo = {
    APP_BASE_URL_raw: process.env.APP_BASE_URL || '(unset)',
    APP_BASE_URL_cleaned: cleanUrlBase(process.env.APP_BASE_URL),
    GOOGLE_CLIENT_ID_set: !!cleanEnv(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET_set: !!cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
    AZURE_TENANT_ID_set: !!cleanEnv(process.env.AZURE_TENANT_ID),
    AZURE_CLIENT_ID_set: !!cleanEnv(process.env.AZURE_CLIENT_ID),
    AZURE_CLIENT_SECRET_set: !!cleanEnv(process.env.AZURE_CLIENT_SECRET),
    google_redirect_uri: (() => { try { return getGoogleRedirectUri(); } catch (e) { return `ERROR: ${e.message}`; } })(),
    ms_redirect_uri: (() => { try { return getMsRedirectUri(); } catch (e) { return `ERROR: ${e.message}`; } })(),
  };
  const debugHtml = Object.entries(debugInfo)
    .map(([k, v]) => `<tr><td><code>${k}</code></td><td><code>${escapeHtml(JSON.stringify(v))}</code></td></tr>`)
    .join('');
  res.status(500).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Auth config error</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 880px; margin: 40px auto; padding: 20px; color: #222; }
  h1 { color: #C0392B; border-bottom: 3px solid #C0392B; padding-bottom: 8px; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 8px 12px; border-bottom: 1px solid #ddd; vertical-align: top; }
  td:first-child { font-weight: 600; color: #005B96; white-space: nowrap; }
  code { word-break: break-all; }
  .back { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #005B96; color: #fff; text-decoration: none; border-radius: 6px; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(details)}</p>
<h3>What the server sees</h3>
<table>${debugHtml}</table>
<a class="back" href="/login">← Back to login</a>
</body></html>`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ============================================================================
// GOOGLE
// ============================================================================

router.get('/google', (req, res) => {
  try {
    const base = requireValidUrl(getAppBaseUrl(), 'APP_BASE_URL');
    const clientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');

    const client = getOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
    });
    res.redirect(url);
  } catch (err) {
    console.error('[Google /auth/google] config error:', err);
    renderConfigError(res, 'Google sign-in misconfigured', err.message);
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, error: oauthError } = req.query;
    if (oauthError) {
      console.error('[Google callback] OAuth error from Google:', oauthError);
      return res.redirect('/login?error=' + encodeURIComponent(oauthError));
    }
    if (!code) return res.redirect('/login?error=no_code');

    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: cleanEnv(process.env.GOOGLE_CLIENT_ID),
    });
    const payload = ticket.getPayload();

    req.session.user = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      verified: payload.email_verified,
      provider: 'google',
      loginAt: Date.now(),
    };
    res.redirect('/');
  } catch (err) {
    console.error('[Google callback] error:', err);
    res.redirect('/login?error=oauth_failed');
  }
});

// ============================================================================
// MICROSOFT
// ============================================================================

router.get('/microsoft', (req, res) => {
  try {
    const tenant = cleanEnv(process.env.AZURE_TENANT_ID);
    const clientId = cleanEnv(process.env.AZURE_CLIENT_ID);
    if (!tenant) throw new Error('AZURE_TENANT_ID is not set');
    if (!clientId) throw new Error('AZURE_CLIENT_ID is not set');

    // Validate APP_BASE_URL up front so we get a clear message if it's bad
    requireValidUrl(getAppBaseUrl(), 'APP_BASE_URL');

    const redirectUri = getMsRedirectUri();
    const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('prompt', 'select_account');

    res.redirect(url.toString());
  } catch (err) {
    console.error('[Microsoft /auth/microsoft] config error:', err);
    renderConfigError(res, 'Microsoft sign-in misconfigured', err.message);
  }
});

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, error: oauthError, error_description } = req.query;
    if (oauthError) {
      console.error('[MS callback] OAuth error:', oauthError, error_description);
      return res.redirect('/login?error=' + encodeURIComponent(oauthError));
    }
    if (!code) return res.redirect('/login?error=no_code');

    const tenant = cleanEnv(process.env.AZURE_TENANT_ID);
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: cleanEnv(process.env.AZURE_CLIENT_ID),
      client_secret: cleanEnv(process.env.AZURE_CLIENT_SECRET),
      code,
      redirect_uri: getMsRedirectUri(),
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token fetch failed');

    // Decode the ID token (no signature verification — fine for sign-in only)
    const idToken = tokenData.id_token;
    const payloadBase64Url = idToken.split('.')[1];
    const payloadJson = Buffer.from(
      payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf-8');
    const payload = JSON.parse(payloadJson);

    req.session.user = {
      sub: payload.oid || payload.sub,
      email: payload.preferred_username || payload.email,
      name: payload.name,
      picture: null,
      verified: true,
      provider: 'microsoft',
      loginAt: Date.now(),
    };
    res.redirect('/');
  } catch (err) {
    console.error('[Microsoft callback] error:', err);
    res.redirect('/login?error=oauth_failed');
  }
});

// ============================================================================
// LOGOUT
// ============================================================================

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
