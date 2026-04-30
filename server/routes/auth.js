// ============================================================================
// Sign-In OAuth routes (Google & Microsoft)
// ============================================================================
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

// --- GOOGLE CONFIG ---
function getGoogleRedirectUri() {
  const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/auth/google/callback`;
}

function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleRedirectUri(),
  );
}

// --- MICROSOFT CONFIG ---
function getMsRedirectUri() {
  const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/auth/microsoft/callback`;
}

// ============================================================================
// GOOGLE ROUTES
// ============================================================================
router.get('/google', (req, res) => {
  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/login?error=no_code');

    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    req.session.user = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      verified: payload.email_verified,
      loginAt: Date.now(),
    };

    res.redirect('/');
  } catch (err) {
    console.error('[Google callback]', err);
    res.redirect('/login?error=oauth_failed');
  }
});

// ============================================================================
// MICROSOFT ROUTES
// ============================================================================
router.get('/microsoft', (req, res) => {
  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const redirectUri = getMsRedirectUri();

  const url = new URL(`[https://login.microsoftonline.com/$](https://login.microsoftonline.com/$){tenant}/oauth2/v2.0/authorize`);
  url.searchParams.append('client_id', clientId);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('redirect_uri', redirectUri);
  url.searchParams.append('response_mode', 'query');
  url.searchParams.append('scope', 'openid profile email');
  url.searchParams.append('prompt', 'select_account');

  res.redirect(url.toString());
});

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/login?error=no_code');

    const tenant = process.env.AZURE_TENANT_ID;
    const tokenUrl = `[https://login.microsoftonline.com/$](https://login.microsoftonline.com/$){tenant}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      code,
      redirect_uri: getMsRedirectUri(),
      grant_type: 'authorization_code'
    });

    // Exchange code for token
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token fetch failed');

    // Decode the Microsoft JWT ID token
    const idToken = tokenData.id_token;
    const payloadBase64Url = idToken.split('.')[1];
    const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    // Save identity to session
    req.session.user = {
      sub: payload.oid || payload.sub,
      email: payload.preferred_username || payload.email,
      name: payload.name,
      picture: null, // Microsoft doesn't provide a picture URL in the default token
      verified: true,
      loginAt: Date.now(),
    };

    res.redirect('/');
  } catch (err) {
    console.error('[Microsoft callback]', err);
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