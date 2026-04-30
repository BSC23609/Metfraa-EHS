// ============================================================================
// Google Sign-In OAuth routes
// Flow:
//   /auth/google  -> redirects user to Google's consent screen
//   /auth/google/callback  -> Google redirects back here with a code
//                             we exchange the code for tokens, fetch profile,
//                             store identity in the session cookie
//   /auth/logout  -> clears the session
// ============================================================================
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

function getRedirectUri() {
  const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/auth/google/callback`;
}

function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
}

// Step 1 — kick off the Google OAuth flow
router.get('/google', (req, res) => {
  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

// Step 2 — Google calls us back with ?code=...
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

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
