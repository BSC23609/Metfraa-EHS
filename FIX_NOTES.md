# 🔧 Fix: Auth & Logo Issues — May 2026

This update fixes three issues you reported:
- **Google sign-in 400 (invalid_request)**
- **Microsoft sign-in `{"error": "Invalid URL"}`**
- **Broken logo on login page**

All three had a single root cause: **your `APP_BASE_URL` environment variable in Render contains markdown-link junk** (e.g., `[https://ehs.metfraa.com](https://ehs.metfraa.com)`) instead of just the URL. Your previous `cleanEnv()` function only stripped quotes — it didn't handle markdown.

## What's new

### 1. New file: `server/lib/clean-env.js`
A bulletproof env-cleaning helper that strips:
- Markdown link syntax `[label](url)` → `url`
- Mangled markdown like `https://x.com](https://x.com`
- Quotes (single, double, smart-quotes, backticks)
- Whitespace (incl. newlines, tabs)
- Zero-width / invisible characters that copy-paste sometimes inserts

### 2. New file: `server/routes/debug.js` — public diagnostic endpoints
- **`/debug/env`** — Returns JSON showing every env var (raw vs cleaned), what redirect URIs the server is generating, and whether the logo file exists on disk. **Public** so you can debug auth issues without being able to log in.
- **`/debug/logo`** — Bypasses static middleware and serves the logo directly. If you get a 404, the file isn't on disk — meaning it wasn't committed to git.

### 3. Rewritten: `server/routes/auth.js`
- All env-var reads now go through `cleanEnv()` / `cleanUrlBase()` / `requireValidUrl()`
- Microsoft route now validates `APP_BASE_URL` up front and shows a **detailed HTML error page** (instead of `{"error": "Invalid URL"}`) listing what the server actually saw
- Same error page on Google route if config is bad
- Captures OAuth `error` query param from callbacks for better error messages

### 4. Updated: `server/index.js`
- Boot-time logging shows `APP_BASE_URL` raw value vs cleaned value, with a `⚠️` warning if they differ — check your Render logs after deploying
- Static middleware logs the public dir and logo presence at boot
- Wires in the new `/debug` route

### 5. Updated: `server/lib/auth-middleware.js` and `server/lib/onedrive.js`
- Use `cleanEnv()` for `ADMIN_EMAILS` and Azure credentials

### 6. Updated: `public/login.html`
- **Microsoft sign-in button** added (you said you'd added this on the front-end already — here's the matching backend wiring)
- **Logo fallback**: if `/img/logo.png` ever fails to load, falls back to inline SVG text saying "METFRAA STEEL BUILDINGS PVT. LTD." so the page still looks branded
- **"Trouble signing in?"** link at bottom that opens `/debug/env`
- Better error messages from query string (`?error=no_code` shows "No authorization code received", etc.)

---

## What you need to do now

### Step 1: Deploy these files

Push the updated files to GitHub. Render will auto-deploy.

### Step 2: Visit `/debug/env` immediately after deploy

Open `https://ehs.metfraa.com/debug/env` in your browser. You'll see something like:

```json
{
  "env": {
    "APP_BASE_URL": {
      "raw": "[https://ehs.metfraa.com](https://ehs.metfraa.com)",
      "cleaned": "https://ehs.metfraa.com"
    },
    ...
  },
  "derived_redirect_uris": {
    "google": "https://ehs.metfraa.com/auth/google/callback",
    "microsoft": "https://ehs.metfraa.com/auth/microsoft/callback"
  },
  "filesystem": {
    "logo_exists": true,
    "logo_size_bytes": 17233
  },
  "issues": [...]
}
```

This tells you EXACTLY what your server sees. Compare:
- `derived_redirect_uris.google` should match the redirect URI in **Google Cloud Console** (character for character)
- `derived_redirect_uris.microsoft` should match the redirect URI in **Azure Portal** (character for character)
- `filesystem.logo_exists` should be `true`

### Step 3: Fix `APP_BASE_URL` in Render (recommended even though cleaning works)

1. Go to Render dashboard → your service → **Environment**
2. Find `APP_BASE_URL`
3. **Delete the value entirely**
4. Type (don't paste!) the value: `https://ehs.metfraa.com`
5. Click Save → Render will redeploy

### Step 4: If logo still missing after deploy — check git

Most likely cause: `public/img/logo.png` was never committed. Run:

```bash
git status public/img/logo.png
git log --all --oneline -- public/img/logo.png
```

If the file is untracked or not in any commit:

```bash
git add -f public/img/logo.png
git commit -m "Add Metfraa logo"
git push
```

The `-f` is in case `.gitignore` is somehow excluding it (binary files sometimes get caught up in patterns).

### Step 5: Check Google Cloud Console redirect URI

Open https://console.cloud.google.com → APIs & Services → Credentials → your OAuth client → **Authorized redirect URIs**.

The URI must be **exactly**:
```
https://ehs.metfraa.com/auth/google/callback
```

No trailing slash. No `www.`. Match the case exactly.

### Step 6: Check Azure App Registration redirect URI

Open https://portal.azure.com → App registrations → Metfraa EHS App → **Authentication** → **Web** platform redirect URIs.

The URI must be **exactly**:
```
https://ehs.metfraa.com/auth/microsoft/callback
```

Also confirm:
- ✅ "ID tokens (used for implicit and hybrid flows)" is checked
- The platform is **Web** (not Single-page application or Mobile)

---

## How to verify the fix worked

1. Visit `https://ehs.metfraa.com/debug/env` — `issues` array should be empty (or only contain the harmless "your env still has markdown but cleaning is working" warning)
2. Visit `https://ehs.metfraa.com/login` — logo should appear
3. Click **Sign in with Google** — should land on Google's account picker (not the 400 error)
4. Click **Sign in with Microsoft** — should land on Microsoft's account picker (not the JSON error)

---

## Files in this update

```
server/
├── index.js                  ← UPDATED: boot logging, cleanEnv usage, /debug wired
├── lib/
│   ├── clean-env.js          ← NEW: bulletproof env sanitizer
│   ├── auth-middleware.js    ← UPDATED: uses cleanEnv for ADMIN_EMAILS
│   └── onedrive.js           ← UPDATED: uses cleanEnv for Azure creds
└── routes/
    ├── auth.js               ← REWRITTEN: clean env + debug error pages
    └── debug.js              ← NEW: /debug/env and /debug/logo endpoints

public/
└── login.html                ← UPDATED: Microsoft button, logo fallback, debug link
```

All other files are unchanged from your existing deployment.
