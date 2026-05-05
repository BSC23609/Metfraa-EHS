# v4 — Approval Workflow

This update adds an approval flow: user submissions go to a "pending" state,
and Varadharaj or Nirmal Kumar (or admins) must approve them before the PDF
is generated and the master log is updated.

## Behaviour change

### Before (v3)
```
User submits → PDF generated immediately → master log row added → done
```

### After (v4)
```
User submits → PENDING (in OneDrive _Pending/ folder)
            ↓
Varadharaj/Nirmal sees badge "N pending" on dashboard
            ↓
Opens /approvals → reviews submission → optionally edits any field
            ↓
[Approve]                        OR        [Reject + reason]
   ↓                                              ↓
PDF generated, master log row,         Master log row added
photos moved from _Pending/             with Status=Rejected,
to Reports/, badge clears               photos discarded
```

## Who can approve?

- **Varadharaj** (`varadharaj@metfraa.com`)
- **Nirmal Kumar** (`nirmal@metfraa.com`)
- **Anyone in `ADMIN_EMAILS`** (currently: `info@metfraa.com`,
  `bharatsteel.23609@gmail.com`, `arasu@metfraa.com`)

First approver to click Approve/Reject wins. The other approver, if they open
the same submission, sees a "Already handled" message.

## "Approved By" field removed from forms

This update **removes** the "Approved By" / "Reviewed By" radio button from
every form (was on TBT, IND, INC, HSE, PR, AWM). Users no longer have to pick
who approved — the actual reviewer's identity is captured automatically when
they click Approve.

The master log still has a column for the reviewer (now called "Reviewed By"
+ email + timestamp), and the PDF shows a green APPROVED badge plus a
"Reviewed by: ... at: ..." section at the bottom.

## What gets stored where in OneDrive

```
Metfraa-EHS/
├── _Pending/                          ← NEW: pending submissions live here
│   ├── toolbox/
│   │   ├── TBT-20260504-...json       ← submission data
│   │   └── TBT-20260504-.../photos/
│   │       ├── tbt_photo_1.jpg
│   │       └── attendance_sheet_1.jpg
│   ├── induction/
│   └── ...
│
├── 01-Toolbox-Talks/                  ← still here, populated on APPROVAL
│   ├── _MasterLog.xlsx                ← now has Status / Reviewer columns
│   └── Reports/2026/05/
│       └── TBT_..._....pdf            ← only for APPROVED submissions
└── ...
```

## Master log columns (added at the end)

These 6 new columns are appended to every form's `_MasterLog.xlsx`:

| Column | Example |
|---|---|
| Status | `Approved` (green) or `Rejected` (red) |
| Reviewed By (Name) | `Varadharaj` |
| Reviewed By (Email) | `varadharaj@metfraa.com` |
| Reviewed At | `2026-05-04 12:34:56` |
| Edits Made | `Topics Covered: "old text" → "new text"; #3 Result: "NO" → "YES"` |
| Reject Reason | (only filled for rejected submissions) |

Existing master logs from v3 will get these columns appended on first new
write. Rows from before this update will show empty status (treated as
"Approved" by the UI for display purposes).

## What users see after submitting

- Toast: "✓ Submitted for approval — Awaiting review by Varadharaj or Nirmal Kumar"
- Their `/submissions` page shows the new submission with status pill:
  - 🟡 **PENDING** — not yet reviewed
  - 🟢 **APPROVED** — PDF available, View/Download buttons work
  - 🔴 **REJECTED** — shows reject reason inline, no PDF available

## What approvers see

- Dashboard header: orange "Approvals N" button with count badge
- Dashboard body: yellow strip "⏳ N submissions waiting for your approval"
- `/approvals` page: list of all pending, click any row to open
- Review page: every field rendered editably, photos shown, big green
  "Approve" + outlined red "Reject" buttons at the bottom

## New files

```
server/lib/pending-store.js               NEW (manages _Pending/ folder)
server/routes/approvals.js                NEW (approval API)
public/approvals.html                     NEW (pending list page)
public/approval-review.html               NEW (review page)
public/css/approval-review.css            NEW
public/js/approvals.js                    NEW
public/js/approval-review.js              NEW
```

## Modified files

```
server/index.js                           wires new routes, adds /approvals pages
server/lib/forms-config.js                removes 6 approver fields, adds APPROVER_EMAILS
server/lib/auth-middleware.js             adds isApprover flag and requireApprover
server/lib/onedrive.js                    adds deletePath(), moveFile()
server/lib/excel-log.js                   adds approval columns
server/lib/pdf-report.js                  adds APPROVED badge + reviewer block
server/routes/forms.js                    saves as PENDING (no PDF generation)
server/routes/submissions.js              exposes status/reviewer/reject reason
public/dashboard.html                     adds Approvals button + status strip
public/js/dashboard.js                    fetches and shows pending count
public/js/form.js                         updates success toast for approval flow
public/js/submissions.js                  shows status pills, hides PDF for rejected
public/css/app.css                        adds badge + strip + status pill styles
```

## How to apply

1. Replace your repo with the v4 zip (back up `.git` first if you want history)
2. Push to GitHub → Render auto-deploys
3. NO env var changes needed
4. NO Azure changes needed
5. Wait for deploy → submit a test form → log in as Varadharaj or Nirmal → approve

## Migration notes — what happens to existing data

- **Already-approved submissions in your master log**: unchanged. They appear
  in `/submissions` as "Approved" (treated by default since they have no Status
  column). PDFs work as before.
- **Photos already in `Reports/.../Photos/`**: unchanged.
- **First new submission after this deploy**: lands in `_Pending/` instead of
  going straight to `Reports/`.

## Edge cases handled

- Two approvers click "Approve" simultaneously: first wins, second gets
  HTTP 409 "Already handled by another reviewer"
- Approver navigates away mid-edit: nothing saved, can re-open later
- Pending submission's photos can't be edited (only viewed); approvers should
  reject if photos are bad
- Rejected submission stays in master log forever (audit trail) but is never
  turned into a PDF
- Old master logs without the new columns get them auto-added on next write
