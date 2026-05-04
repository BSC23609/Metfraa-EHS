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

// OneDrive connectivity test — runs the actual Graph API calls and reports
// exactly what works and what fails. Use this to diagnose "User not found"
// or other upload errors.
router.get('/onedrive', async (req, res) => {
  const result = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  const tenantId = cleanEnv(process.env.AZURE_TENANT_ID);
  const clientId = cleanEnv(process.env.AZURE_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.AZURE_CLIENT_SECRET);
  const onedriveUserId = cleanEnv(process.env.ONEDRIVE_USER_ID);

  result.checks.env_vars = {
    tenantId_set: !!tenantId,
    clientId_set: !!clientId,
    clientSecret_set: !!clientSecret,
    onedriveUserId: onedriveUserId || '(unset)',
    pass: !!(tenantId && clientId && clientSecret && onedriveUserId),
  };

  if (!result.checks.env_vars.pass) {
    result.summary = '❌ One or more required env vars are missing';
    return res.json(result);
  }

  // Step 1: Get a Graph access token
  let accessToken = null;
  try {
    const { ConfidentialClientApplication } = require('@azure/msal-node');
    const msal = new ConfidentialClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientSecret,
      },
    });
    const tokenResult = await msal.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });
    accessToken = tokenResult.accessToken;
    result.checks.token_acquisition = {
      pass: true,
      token_length: accessToken.length,
      expires_on: tokenResult.expiresOn,
    };
  } catch (err) {
    result.checks.token_acquisition = { pass: false, error: err.message };
    result.summary = '❌ Failed to acquire app token from Microsoft. Check AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.';
    return res.json(result);
  }

  // Step 2: Try to look up the user by UPN/email
  try {
    const userResp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(onedriveUserId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userResp.ok) {
      const userJson = await userResp.json();
      result.checks.user_lookup = {
        pass: true,
        id: userJson.id,
        displayName: userJson.displayName,
        userPrincipalName: userJson.userPrincipalName,
        mail: userJson.mail,
        accountEnabled: userJson.accountEnabled,
      };
    } else {
      const errBody = await userResp.text();
      let diagnosis;
      let summary;
      if (userResp.status === 404) {
        diagnosis = `The user "${onedriveUserId}" does NOT exist in your Azure AD tenant. This means: either (a) the email is just an alias/forwarder at your domain registrar but not a real M365 user, OR (b) the tenant ID is wrong. Buy at least one M365 Business Basic license and create this user, or change ONEDRIVE_USER_ID to a different account that exists.`;
        summary = `❌ "User not found" — ${onedriveUserId} is not a valid M365 user in your tenant.`;
      } else if (userResp.status === 403) {
        diagnosis = `Your Azure App Registration is missing the User.Read.All permission, so it can't look up users by email. Fix: Azure portal → App registrations → your app → API permissions → Add "User.Read.All" (Application permissions, NOT Delegated) → Grant admin consent. Note: form submissions may still fail until this is fixed because resolving the user is part of the upload flow.`;
        summary = `❌ Insufficient privileges — your app needs the User.Read.All permission added in Azure.`;
      } else {
        diagnosis = `Unexpected HTTP ${userResp.status} from Microsoft Graph during user lookup.`;
        summary = `❌ User lookup failed with HTTP ${userResp.status}`;
      }
      result.checks.user_lookup = {
        pass: false,
        status: userResp.status,
        error: errBody.slice(0, 500),
        diagnosis,
      };
      result.summary = summary;
      return res.json(result);
    }
  } catch (err) {
    result.checks.user_lookup = { pass: false, error: err.message };
    result.summary = '❌ User lookup failed';
    return res.json(result);
  }

  // Step 3: Try to access the user's OneDrive
  try {
    const driveResp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(onedriveUserId)}/drive`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (driveResp.ok) {
      const driveJson = await driveResp.json();
      result.checks.drive_access = {
        pass: true,
        driveId: driveJson.id,
        driveType: driveJson.driveType,
        owner: driveJson.owner?.user?.displayName || driveJson.owner?.user?.email,
        webUrl: driveJson.webUrl,
        quota_used_bytes: driveJson.quota?.used,
        quota_total_bytes: driveJson.quota?.total,
      };
    } else {
      const errBody = await driveResp.text();
      result.checks.drive_access = {
        pass: false,
        status: driveResp.status,
        error: errBody.slice(0, 500),
        diagnosis: 'User exists but has no OneDrive provisioned. They may need an M365 license that includes OneDrive (Business Basic, Business Standard, etc.). Note: a one-time visit to OneDrive.com by that user often triggers provisioning.',
      };
      result.summary = '❌ OneDrive not accessible for this user';
      return res.json(result);
    }
  } catch (err) {
    result.checks.drive_access = { pass: false, error: err.message };
    result.summary = '❌ Drive access failed';
    return res.json(result);
  }

  // Step 4: Try to read the root folder (proves Files.ReadWrite.All works)
  try {
    const rootResp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(onedriveUserId)}/drive/root/children?$top=5`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (rootResp.ok) {
      const rootJson = await rootResp.json();
      result.checks.permissions = {
        pass: true,
        sample_root_items: (rootJson.value || []).slice(0, 5).map(i => i.name),
      };
    } else {
      const errBody = await rootResp.text();
      result.checks.permissions = {
        pass: false,
        status: rootResp.status,
        error: errBody.slice(0, 500),
        diagnosis: 'App permissions issue. Make sure Files.ReadWrite.All is granted at Azure portal → App registrations → API permissions → admin consent.',
      };
      result.summary = '❌ App permissions not granted';
      return res.json(result);
    }
  } catch (err) {
    result.checks.permissions = { pass: false, error: err.message };
  }

  result.summary = '✅ OneDrive is fully reachable. Form submissions should succeed.';
  res.json(result);
});

module.exports = router;
