# Metfraa EHS — Complete Project (v3, May 2026)

This is the **complete project** with all features built so far:
- 21 forms (5 general EHS records + 1 Permit Record + 15 equipment inspections)
- Google + Microsoft sign-in (any account, anywhere)
- Auto-PDF generation, brand-styled
- OneDrive storage of PDFs + auto-appended Excel master logs
- "My Submissions" page (your own forms)
- Admin "All Submissions" page (everyone's forms — for `info@`, `varadharaj@`, `nirmal@`, `arasu@` at `metfraa.com`)
- Inline PDF preview, download buttons, filters by form/date/submitter
- `/debug/env` and `/debug/onedrive` diagnostic endpoints

---

## 🚨 Read this FIRST

If you've already deployed and are hitting an error, the fix is almost never
in the code — it's in your Render or Azure config. Hit `/debug/env` and
`/debug/onedrive` first; they'll tell you exactly what's wrong.

---

## 1. Files in this project (29 files total)

```
metfraa-ehs/
├── README.md                         (this file)
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── render.yaml
│
├── server/
│   ├── index.js                      Express entry point
│   ├── lib/
│   │   ├── forms-config.js           21 form definitions (single source of truth)
│   │   ├── auth-middleware.js        Google + Microsoft session + admin check
│   │   ├── clean-env.js              Sanitizes env vars (markdown, quotes, etc.)
│   │   ├── onedrive.js               Microsoft Graph wrapper
│   │   ├── pdf-report.js             Brand-styled PDF generator
│   │   └── excel-log.js              Master log appender
│   └── routes/
│       ├── auth.js                   /auth/google, /auth/microsoft, /auth/logout
│       ├── forms.js                  /api/submit/:formId
│       ├── submissions.js            /api/submissions, /api/pdf/:id/:sub
│       ├── admin.js                  /admin
│       └── debug.js                  /debug/env, /debug/onedrive, /debug/logo
│
└── public/
    ├── login.html                    Google + Microsoft sign-in
    ├── dashboard.html                Form tile grid
    ├── form.html                     Form filling page (any form)
    ├── submissions.html              "My Submissions" / "All Submissions"
    ├── admin.html                    Admin info page
    ├── img/logo.png                  Metfraa logo
    ├── css/
    │   ├── app.css                   Main brand stylesheet
    │   └── submissions.css           Submissions-page-specific styles
    └── js/
        ├── dashboard.js              Tile renderer
        ├── form.js                   Dynamic form renderer
        └── submissions.js            Submissions list, filters, PDF modal
```

---

## 2. The 21 forms

| # | Code | Name | Folder |
|---|---|---|---|
| 1 | TBT | Toolbox Talk | 01-Toolbox-Talks |
| 2 | IND | Induction | 02-Induction |
| 3 | AUD | EHS Audit | 03-EHS-Audit |
| 4 | INC | Incident / Accident Report | 04-Incident-Reports |
| 5 | HSE | HSE Meeting | 05-HSE-Meetings |
| 6 | PR | Permit Record | 07-Permit-Records |
| 7 | PGM | Portable Grinding Machine | 06-Equipment-Inspections/Portable-Grinding-Machine |
| 8 | GWS | Gas Welding Set | 06-Equipment-Inspections/Gas-Welding-Set |
| 9 | ABL | Aerial Boomlift | 06-Equipment-Inspections/Aerial-Boomlift |
| 10 | AC | Air Compressor | 06-Equipment-Inspections/Air-Compressor |
| 11 | AWM | Arc Welding Machine | 06-Equipment-Inspections/Arc-Welding-Machine |
| 12 | CM | Cutting Machine | 06-Equipment-Inspections/Cutting-Machine |
| 13 | FAB | First Aid Box | 06-Equipment-Inspections/First-Aid-Box |
| 14 | GEN | Generator | 06-Equipment-Inspections/Generator |
| 15 | LAD | Ladder | 06-Equipment-Inspections/Ladder |
| 16 | MDB | Main Distribution Board | 06-Equipment-Inspections/Main-Distribution-Board |
| 17 | MSF | Mobile Scaffolding | 06-Equipment-Inspections/Mobile-Scaffolding |
| 18 | SCL | Scaffolding (Cuplock) | 06-Equipment-Inspections/Scaffolding-Cuplock |
| 19 | TRK | Truck | 06-Equipment-Inspections/Truck |
| 20 | LC | Labour Camp | 06-Equipment-Inspections/Labour-Camp |
| 21 | MC | Mobile Crane | 06-Equipment-Inspections/Mobile-Crane |

Edit `server/lib/forms-config.js` to add/edit forms or change the inspector list.

---

## 3. Required Render environment variables

Set these in Render dashboard → your service → **Environment**.

**TYPE the values, don't paste from a chat or doc** — copy-paste sometimes
includes hidden markdown or whitespace that breaks parsing. (The app's
`cleanEnv()` recovers from most of this, but it's better to start clean.)

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `SESSION_SECRET` | A 64+ character random hex string. Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `APP_BASE_URL` | `https://ehs.metfraa.com` |
| `GOOGLE_CLIENT_ID` | (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | (from Google Cloud Console) |
| `AZURE_TENANT_ID` | `f4f5c484-2983-4c4c-aba3-7c9a0e1fddbc` |
| `AZURE_CLIENT_ID` | `727adde8-84da-4418-b81b-e79e72097609` |
| `AZURE_CLIENT_SECRET` | (from Azure App Registration → Certificates & secrets) |
| `ONEDRIVE_USER_ID` | `info@metfraa.com` |
| `ONEDRIVE_ROOT_FOLDER` | `Metfraa-EHS` |
| `ADMIN_EMAILS` | `info@metfraa.com,varadharaj@metfraa.com,nirmal@metfraa.com,arasu@metfraa.com` |

**After saving any change to env vars**, click **Manual Deploy → Deploy latest
commit** to force a redeploy. Env changes do NOT auto-apply to a running
process — the deploy reads them at startup.

---

## 4. Required Azure App Registration setup

### Permissions (the most common cause of submission failures)

In Azure portal → App registrations → Metfraa EHS App → **API permissions**:

You need **BOTH** of these as **Application permissions** (not Delegated):

| Permission | Why |
|---|---|
| `Files.ReadWrite.All` | Upload PDFs and read/write the master logs |
| `User.Read.All` | Look up the OneDrive owner by email |

After adding both, click **Grant admin consent for [your tenant]**. Both
should show ✅ green. Without `User.Read.All`, you get
`Authorization_RequestDenied` ("Insufficient privileges").

### Authentication settings

In **Authentication**:
- **Supported account types**: Any Entra ID Tenant + Personal Microsoft accounts (multi-tenant)
- **Redirect URIs** (Web platform): `https://ehs.metfraa.com/auth/microsoft/callback`
- **ID tokens** (used for implicit and hybrid flows): ✅ checked

### Manifest

Search the manifest for these values and confirm they match:
```json
"signInAudience": "AzureADandPersonalMicrosoftAccount",
"requestedAccessTokenVersion": 2,
```

---

## 5. Required Google Cloud setup

In https://console.cloud.google.com → APIs & Services:

- **OAuth consent screen**: User type = External, Publishing status = **In production** (not Testing)
- **Credentials → OAuth client**:
  - Authorized JavaScript origins: `https://ehs.metfraa.com`
  - Authorized redirect URIs: `https://ehs.metfraa.com/auth/google/callback`

---

## 6. Required Microsoft 365 setup

This is the part most people miss.

The app uploads ALL submissions (regardless of which user signed in) to a
**single central OneDrive** owned by `info@metfraa.com`. For this to work:

1. `info@metfraa.com` must be a **real M365 user** in your tenant — not
   just an email alias / forwarder
2. That user must have a **license that includes OneDrive**
   (M365 Business Basic, ~₹136/month, is the cheapest option that works)
3. That user must have **logged in to onedrive.com at least once** so their
   OneDrive gets provisioned (sometimes provisioning is delayed otherwise)

**To verify everything is working**: hit `https://ehs.metfraa.com/debug/onedrive`
while signed in. You should see ✅ at every step:

```json
{
  "checks": {
    "env_vars":           { "pass": true },
    "token_acquisition":  { "pass": true },
    "user_lookup":        { "pass": true,  "displayName": "...", "userPrincipalName": "info@metfraa.com" },
    "drive_access":       { "pass": true },
    "permissions":        { "pass": true }
  },
  "summary": "✅ OneDrive is fully reachable. Form submissions should succeed."
}
```

---

## 7. How to deploy from scratch

```bash
# In your local repo
git init
git add .
git commit -m "Initial commit: Metfraa EHS"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/metfraa-ehs.git
git push -u origin main
```

In Render:
1. **New +** → **Blueprint** → connect your GitHub repo
2. Render reads `render.yaml` and proposes a service → **Apply**
3. Open the new service → **Environment** tab → fill all 12 env vars from section 3
4. **Manual Deploy → Deploy latest commit**
5. Wait for "Deploy live" in the Events tab
6. Visit `https://your-render-url.onrender.com/debug/env` → confirm setup is good
7. Visit `/debug/onedrive` → confirm OneDrive is reachable
8. Submit a test form → check the OneDrive folder gets created

DNS:
- Add CNAME record `ehs` → the target Render gives you
- Wait for SSL provisioning (~30 minutes)

---

## 8. How to apply this update if you already have the project deployed

```bash
# 1. In your local repo (back up first!)
mv metfraa-ehs metfraa-ehs.backup

# 2. Extract this zip
unzip metfraa-ehs-v3-complete.zip
mv metfraa-ehs-v3-complete metfraa-ehs

# 3. Restore your .git folder so you keep history
cp -r metfraa-ehs.backup/.git metfraa-ehs/

# 4. Commit and push
cd metfraa-ehs
git add -A
git status   # review what's changing
git commit -m "v3: Permit Record + submissions feature + diagnostic improvements"
git push
```

Render auto-deploys. Then:
1. Update `ONEDRIVE_USER_ID` in Render to `info@metfraa.com`
2. Update `ADMIN_EMAILS` in Render to `info@metfraa.com,varadharaj@metfraa.com,nirmal@metfraa.com,arasu@metfraa.com`
3. Add `User.Read.All` permission in Azure (see section 4)
4. **Manual Deploy → Deploy latest commit**
5. Verify `/debug/onedrive` shows all green

---

## 9. Troubleshooting reference

### "User not found" or "Insufficient privileges" when submitting
→ Run `/debug/onedrive` and follow the diagnosis. Most common causes:
- `ONEDRIVE_USER_ID` not actually saved in Render (env change without redeploy)
- `User.Read.All` not granted in Azure
- `info@metfraa.com` doesn't have an M365 OneDrive license

### Logo not showing
→ Hit `/debug/logo` directly. If 404, the file isn't on Render's disk —
check `git ls-files public/img/logo.png` in your local repo.

### Sign-in redirects to error page
→ Hit `/debug/env`. Check `derived_redirect_uris` matches what's registered
in Google Cloud Console / Azure portal exactly.

### Submissions page shows nothing
→ Submissions only appear after at least one form succeeds. First make sure
submission works (no OneDrive errors), then check `/api/submissions` directly
to see the raw data.

---

## 10. Cost summary

- Render Starter web service: **~$7/month** (or free tier with cold-start delay)
- M365 Business Basic for `info@metfraa.com`: **~₹136/month** (~$1.65)
- Azure App Registration: free
- Google Cloud OAuth: free
- Custom domain: free (you already own metfraa.com)

**Total: ~$9/month**
