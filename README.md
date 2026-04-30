# Metfraa EHS — Forms Web App

Web application for **Metfraa Steel Buildings Pvt. Ltd.** that lets site engineers fill out 20 EHS forms (Toolbox Talks, Inductions, EHS Audits, Incident Reports, HSE Meetings, and 15 equipment-inspection checklists). Every submission is automatically saved to your company OneDrive as a branded PDF report **and** appended to a per-form Excel master log.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [What you need to set up (one-time)](#2-what-you-need-to-set-up-one-time)
3. [Step 1 — Azure App Registration (OneDrive access)](#3-step-1--azure-app-registration-onedrive-access)
4. [Step 2 — Google OAuth client (Sign-In)](#4-step-2--google-oauth-client-sign-in)
5. [Step 3 — Push code to GitHub](#5-step-3--push-code-to-github)
6. [Step 4 — Deploy to Render](#6-step-4--deploy-to-render)
7. [Step 5 — Custom domain `ehs.metfraa.com`](#7-step-5--custom-domain-ehsmetfraacom)
8. [How OneDrive is organized](#8-how-onedrive-is-organized)
9. [How to add / change forms](#9-how-to-add--change-forms)
10. [Local development](#10-local-development)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture overview

```
┌─────────────┐         ┌────────────────────┐         ┌─────────────────────┐
│   Browser   │  HTTPS  │  Node.js (Render)  │  Graph  │  OneDrive (yours)   │
│  Engineer   │────────▶│  Express server    │────────▶│  Metfraa-EHS/...    │
│             │         │  PDF + Excel gen   │         │  PDFs + MasterLogs  │
└─────────────┘         └────────────────────┘         └─────────────────────┘
       │                          │
       │  Sign-in with Google     │  Validates Google ID token
       └──────────────────────────┘
```

- **Frontend:** Plain HTML/CSS/JS — no build step. The 20 forms are rendered dynamically from `server/lib/forms-config.js`.
- **Backend:** Node.js + Express on Render.
- **Auth:** Google Sign-In (any Gmail user can log in; their email is captured for the audit trail).
- **Storage:** Microsoft Graph API → your OneDrive. Both PDFs and Excel logs.

---

## 2. What you need to set up (one-time)

| What | Where | Cost |
|---|---|---|
| Azure App Registration | portal.azure.com | Free |
| Google OAuth client | console.cloud.google.com | Free |
| GitHub repo | github.com | Free |
| Render web service | render.com | $7/month (Starter) recommended; Free tier sleeps after 15 min idle |
| Custom subdomain `ehs.metfraa.com` | Your DNS provider | Free (depends on your registrar) |

Total monthly cost: **~$7** (or free if you can tolerate the cold-start delay on the free tier).

---

## 3. Step 1 — Azure App Registration (OneDrive access)

This gives your app a "service identity" that can read/write to a specific OneDrive on your behalf.

### 3.1 Create the App Registration

1. Go to **https://portal.azure.com** → search for **"App registrations"** → **"+ New registration"**
2. Fill in:
   - **Name:** `Metfraa EHS App`
   - **Supported account types:** *Accounts in this organizational directory only* (single tenant) — recommended.
     If you're using a personal Microsoft account, pick *Personal Microsoft accounts only*.
   - **Redirect URI:** Leave blank for now (we use app-only auth, no user redirect needed)
3. Click **Register**
4. You'll land on the app's overview page. **Copy these 2 values** — you'll need them later:
   - **Application (client) ID** → save as `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → save as `AZURE_TENANT_ID`

### 3.2 Create a client secret

1. In the left sidebar of your app, click **"Certificates & secrets"**
2. Click **"+ New client secret"**
3. Description: `Metfraa EHS Render`, expiry: **24 months** (you'll need to rotate it before then)
4. Click **Add**
5. **IMMEDIATELY copy the "Value" column** (NOT the "Secret ID"). You will not be able to see it again.
   - Save as `AZURE_CLIENT_SECRET`

### 3.3 Grant API permissions

1. Click **"API permissions"** in the left sidebar
2. Click **"+ Add a permission"** → **"Microsoft Graph"** → **"Application permissions"** (NOT delegated)
3. Search and check **`Files.ReadWrite.All`** → click **Add permissions**
4. Back on the API permissions page, click **"Grant admin consent for [your tenant]"** (the button at the top)
5. The status should turn green ✅

### 3.4 Identify the OneDrive account

The app stores files in **one** OneDrive — pick the Microsoft account you want all submissions to land in. This is typically your company admin account.

- Find its **User Principal Name** (e.g., `admin@metfraa.com`) — this is what most people call "the email"
- Save as `ONEDRIVE_USER_ID`

> If you don't have a Microsoft 365 account yet, you'll need at least one (Business Basic plan ~₹136/user/month) to get OneDrive for Business. Personal OneDrive does **not** work with the application-permission model used here.

---

## 4. Step 2 — Google OAuth client (Sign-In)

This lets engineers sign in with their Gmail account.

1. Go to **https://console.cloud.google.com** → top bar → **Select project** → **NEW PROJECT**
2. Name it `Metfraa EHS` → Create
3. Once created, in the left menu go to **APIs & Services** → **OAuth consent screen**
   - User Type: **External** → Create
   - Fill in: App name `Metfraa EHS`, user support email (your email), developer contact (your email) → Save
   - On the **Scopes** page just click **Save and Continue**
   - On **Test users**: while in "Testing" mode you'd have to manually add every user; instead click **PUBLISH APP** → confirm. (Anyone with a Google account will be able to sign in. You can verify your app later for production polish, but it's not required for it to function.)
4. Now go to **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `Metfraa EHS Web`
   - **Authorized JavaScript origins:**
     - `https://ehs.metfraa.com`
     - `http://localhost:3000` (for local dev)
   - **Authorized redirect URIs:**
     - `https://ehs.metfraa.com/auth/google/callback`
     - `http://localhost:3000/auth/google/callback`
   - Click **Create**
5. A dialog shows your **Client ID** and **Client Secret**. Save both:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

---

## 5. Step 3 — Push code to GitHub

```bash
cd metfraa-ehs
git init
git add .
git commit -m "Initial commit: Metfraa EHS app"
git branch -M main
# Create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/metfraa-ehs.git
git push -u origin main
```

**IMPORTANT:** make sure `.env` is in `.gitignore` (it is). Never commit your secrets.

---

## 6. Step 4 — Deploy to Render

### Option A — Blueprint (one click; uses `render.yaml`)

1. Go to https://render.com → log in with GitHub
2. **New +** → **Blueprint**
3. Connect your `metfraa-ehs` repo
4. Render reads `render.yaml` and proposes a service. Click **Apply**
5. The first deploy will succeed but the app won't actually work until you fill in environment variables (next step)

### Option B — Manual

1. **New +** → **Web Service**
2. Connect repo → set:
   - Runtime: **Node**
   - Build command: `npm ci`
   - Start command: `npm start`
   - Plan: **Starter** ($7/mo, stays warm) or **Free** (sleeps after 15 min)
3. Create

### Set the environment variables

In your Render service → **Environment** tab → **Add Environment Variable**:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `SESSION_SECRET` | Run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the output |
| `APP_BASE_URL` | `https://ehs.metfraa.com` (or your Render URL while testing) |
| `GOOGLE_CLIENT_ID` | from step 4 |
| `GOOGLE_CLIENT_SECRET` | from step 4 |
| `AZURE_TENANT_ID` | from step 3.1 |
| `AZURE_CLIENT_ID` | from step 3.1 |
| `AZURE_CLIENT_SECRET` | from step 3.2 |
| `ONEDRIVE_USER_ID` | from step 3.4 (e.g., `admin@metfraa.com`) |
| `ONEDRIVE_ROOT_FOLDER` | `Metfraa-EHS` |
| `ADMIN_EMAILS` | comma-separated list, e.g. `varadharaj@gmail.com,nirmal@gmail.com` |

After setting all variables, click **Manual Deploy → Deploy latest commit**.

---

## 7. Step 5 — Custom domain `ehs.metfraa.com`

1. In Render → your service → **Settings** → **Custom Domains** → **Add Custom Domain**
2. Enter `ehs.metfraa.com` → Render shows you a target like `metfraa-ehs.onrender.com` and asks for a CNAME record
3. Go to your domain registrar (where `metfraa.com` is registered) → DNS settings
4. Add a record:
   - Type: `CNAME`
   - Name / Host: `ehs`
   - Value / Target: `<the value Render gave you>`
   - TTL: default (300–3600s)
5. Wait 5–30 minutes for DNS to propagate. Render automatically provisions a free SSL certificate.
6. **Update environment variables**:
   - `APP_BASE_URL` → `https://ehs.metfraa.com`
   - **In Google Cloud Console** → Credentials → your OAuth client → Authorized redirect URIs: confirm `https://ehs.metfraa.com/auth/google/callback` is listed

---

## 8. How OneDrive is organized

After your first submission, your OneDrive will look like this:

```
Metfraa-EHS/                                    ← root folder (auto-created)
├── 01-Toolbox-Talks/
│   ├── _MasterLog.xlsx                         ← every TBT submission appended
│   └── Reports/2026/04/
│       ├── TBT_ProjectAlpha_TBT-20260430-103015-1234.pdf
│       └── Photos/TBT-20260430-103015-1234/
│           ├── tbt_photo_1.jpg
│           └── attendance_sheet_1.jpg
├── 02-Induction/
├── 03-EHS-Audit/
├── 04-Incident-Reports/
├── 05-HSE-Meetings/
└── 06-Equipment-Inspections/
    ├── Portable-Grinding-Machine/
    ├── Gas-Welding-Set/
    ├── Aerial-Boomlift/
    ├── Air-Compressor/
    ├── Arc-Welding-Machine/
    ├── Cutting-Machine/
    ├── First-Aid-Box/
    ├── Generator/
    ├── Ladder/
    ├── Main-Distribution-Board/
    ├── Mobile-Scaffolding/
    ├── Scaffolding-Cuplock/
    ├── Truck/
    ├── Labour-Camp/
    └── Mobile-Crane/
```

**Each form folder** contains:
- One `_MasterLog.xlsx` with **one row per submission** (auto-appended)
- A `Reports/` subfolder with PDFs grouped by year/month
- A `Reports/YYYY/MM/Photos/<submission-id>/` folder with the original photos

The Excel log includes columns for every form field, every checklist item's result and remarks, plus links back to the photos and the PDF report — perfect for filtering/auditing.

---

## 9. How to add / change forms

All form definitions live in **one file**: `server/lib/forms-config.js`.

- To add a new equipment-inspection form, copy one of the `makeEquipmentForm({...})` blocks and edit
- To add a brand-new form (with custom fields), copy the `TOOLBOX` definition and edit
- To change checklist items, edit the `checklist: [...]` array
- To add inspectors to the dropdown, edit the `INSPECTORS` array
- To change approver names, edit the `APPROVERS` array

After editing, push to GitHub → Render will auto-deploy.

---

## 10. Local development

```bash
npm install
cp .env.example .env
# fill in .env with your credentials (Google, Azure, etc.)
npm run dev
# Open http://localhost:3000
```

For local dev, you need to add `http://localhost:3000` and `http://localhost:3000/auth/google/callback` to the Google OAuth client's authorized origins/redirect URIs. (Already noted in step 4.)

---

## 11. Troubleshooting

### "Sign-in failed" after clicking Google button
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct in Render
- Confirm the redirect URI in Google Cloud Console **exactly** matches `https://ehs.metfraa.com/auth/google/callback` (no trailing slash, https not http)
- Make sure your OAuth consent screen is **Published** (not in Testing mode), unless you've added the user as a test user

### Submission fails with "Failed to acquire token" / 401 errors from Microsoft Graph
- Verify in Azure Portal that **admin consent** has been granted for `Files.ReadWrite.All` (green checkmark in the API Permissions page)
- Confirm `AZURE_CLIENT_SECRET` matches the **Value** column from when you created the secret (not the Secret ID)
- Make sure `AZURE_TENANT_ID` is your tenant ID, not "common"

### "User not found" error
- `ONEDRIVE_USER_ID` must be a **valid user in your Microsoft 365 tenant** with a OneDrive license
- For multi-tenant setups, the user must be in the same tenant as your App Registration

### Photos not appearing in PDF
- Server uses `sharp` to compress images. On Render, sharp's prebuilt binaries should auto-install
- If you see compression warnings in logs, check that the build succeeded fully

### App is slow to wake up
- You're on Render's Free tier. Upgrade to **Starter** ($7/mo) for always-on hosting

### Want to test before going live?
- Use the temporary Render URL (`metfraa-ehs.onrender.com`) instead of the custom domain
- Add it as an authorized origin/redirect URI in Google Cloud Console temporarily

---

## License

Proprietary — Metfraa Steel Buildings Pvt. Ltd.
