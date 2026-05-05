// ============================================================================
// /api/submissions  +  /api/pdf  routes
//
// "My Submissions" / "All Submissions" feature.
//
// How it works:
//   - For each form, we maintain a _MasterLog.xlsx in OneDrive (already done
//     in lib/excel-log.js). This file is the source of truth for what's been
//     submitted.
//   - GET /api/submissions reads the master logs and returns the rows the
//     current user is allowed to see (only their own — or everyone's if admin).
//   - GET /api/pdf/:formId/:submissionId proxies the PDF from OneDrive to the
//     browser. The user never touches OneDrive directly; the server fetches
//     the file using its app credentials and pipes it to the user.
//
// Caching:
//   - Master logs change infrequently, but a busy admin page could hit OneDrive
//     20 times per refresh. We cache parsed rows for 60 seconds.
//   - Cache is in-memory; a Render restart clears it. That's fine.
// ============================================================================

const express = require('express');
const ExcelJS = require('exceljs');
const onedrive = require('../lib/onedrive');
const { ALL_FORMS, FORMS_BY_ID } = require('../lib/forms-config');

const router = express.Router();

// In-memory cache: { [formId]: { rows: [...], expiresAt: <ms> } }
const CACHE = {};
const CACHE_TTL_MS = 60 * 1000;

function isAdmin(req) {
  return !!req.user?.isAdmin;
}

// ---------------------------------------------------------------------------
// Pull all submission rows for one form from its master log in OneDrive.
// Returns an array of objects shaped for the frontend.
// ---------------------------------------------------------------------------

async function loadFormSubmissions(form) {
  const cached = CACHE[form.id];
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const logPath = `${form.folder}/_MasterLog.xlsx`;
  let buffer;
  try {
    buffer = await onedrive.downloadFile(logPath);
  } catch (err) {
    // No log file yet -> no submissions for this form
    if (err.statusCode === 404 || /404/.test(err.message)) {
      CACHE[form.id] = { rows: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
    }
    console.error(`[submissions] failed to read ${logPath}:`, err.message);
    return [];
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Submissions') || wb.worksheets[0];
  if (!ws) return [];

  // Read header row to find the columns we care about
  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });

  const idxOf = (name) => headers.findIndex(h => h === name);
  const colSubmissionId = idxOf('Submission ID');
  const colSubmittedAt  = idxOf('Submitted At');
  const colName         = idxOf('Submitted By (Name)');
  const colEmail        = idxOf('Submitted By (Email)');
  const colPdfLink      = idxOf('PDF Report (link)');
  const colStatus       = idxOf('Status');
  const colReviewerName = idxOf('Reviewed By (Name)');
  const colReviewedAt   = idxOf('Reviewed At');
  const colRejectReason = idxOf('Reject Reason');

  // Pick a "key identifier" column for display — first matching one wins
  const keyCandidates = ['Equipment No.', 'Project Name', 'Site Name',
                         'Employee / Worker Name', 'Meeting No.', 'Permit No.',
                         'Project Location', 'Location'];
  const keyCol = keyCandidates.map(idxOf).find(i => i > 0) || -1;
  const keyLabel = keyCol > 0 ? headers[keyCol] : null;

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const cellVal = (idx) => {
      if (idx <= 0) return '';
      const c = row.getCell(idx);
      const v = c.value;
      if (v && typeof v === 'object') {
        if ('text' in v) return String(v.text);
        if ('richText' in v) return v.richText.map(r => r.text).join('');
        if ('result' in v) return String(v.result);
      }
      return v === undefined || v === null ? '' : String(v);
    };

    const submissionId = cellVal(colSubmissionId);
    if (!submissionId) return; // skip blank rows

    rows.push({
      formId: form.id,
      formCode: form.code,
      formTitle: form.title,
      formCategory: form.category,
      submissionId,
      submittedAt: cellVal(colSubmittedAt),
      submittedByName: cellVal(colName),
      submittedByEmail: cellVal(colEmail),
      keyLabel,
      keyValue: keyCol > 0 ? cellVal(keyCol) : '',
      pdfLink: cellVal(colPdfLink),
      status: cellVal(colStatus) || 'Approved', // older rows have no status; treat as approved
      reviewerName: cellVal(colReviewerName),
      reviewedAt: cellVal(colReviewedAt),
      rejectReason: cellVal(colRejectReason),
    });
  });

  CACHE[form.id] = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

// ---------------------------------------------------------------------------
// GET /api/submissions
//   Query params: formId (optional), submitter (optional, admin only),
//                 startDate, endDate (YYYY-MM-DD), limit (default 200)
// ---------------------------------------------------------------------------

router.get('/submissions', async (req, res) => {
  try {
    const { formId, submitter, startDate, endDate } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);

    // Decide which forms to query
    const formsToScan = formId
      ? (FORMS_BY_ID[formId] ? [FORMS_BY_ID[formId]] : [])
      : ALL_FORMS;

    // Load in parallel
    const allRows = (await Promise.all(formsToScan.map(loadFormSubmissions))).flat();

    // Filter
    const userEmail = (req.user.email || '').toLowerCase();
    const admin = isAdmin(req);

    let filtered = allRows.filter(r => {
      if (!admin && (r.submittedByEmail || '').toLowerCase() !== userEmail) return false;
      if (admin && submitter && (r.submittedByEmail || '').toLowerCase() !== submitter.toLowerCase()) return false;
      if (startDate && (r.submittedAt || '') < startDate) return false;
      if (endDate && (r.submittedAt || '') > `${endDate} 23:59:59`) return false;
      return true;
    });

    // Sort newest first
    filtered.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

    // Strip OneDrive direct links for non-admins (force them through our proxy)
    if (!admin) filtered = filtered.map(({ pdfLink, ...rest }) => rest);

    // Build a list of unique submitters (for admin filter dropdown)
    let submitters = [];
    if (admin) {
      const seen = new Map();
      for (const r of allRows) {
        const key = (r.submittedByEmail || '').toLowerCase();
        if (key && !seen.has(key)) {
          seen.set(key, { name: r.submittedByName, email: r.submittedByEmail });
        }
      }
      submitters = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    res.json({
      isAdmin: admin,
      total: filtered.length,
      truncated: filtered.length > limit,
      rows: filtered.slice(0, limit),
      submitters,
      forms: ALL_FORMS.map(f => ({ id: f.id, code: f.code, title: f.title, category: f.category })),
    });
  } catch (err) {
    console.error('[GET /api/submissions]', err);
    res.status(500).json({ error: err.message || 'Failed to load submissions' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/pdf/:formId/:submissionId
//   Streams the PDF from OneDrive to the user.
//   Query params:
//     ?inline=1   →  Content-Disposition: inline (display in browser)
//     (default)   →  Content-Disposition: attachment (force download)
//
//   Authorization: regular users can only fetch their own PDFs;
//                  admins can fetch any.
// ---------------------------------------------------------------------------

router.get('/pdf/:formId/:submissionId', async (req, res) => {
  try {
    const { formId, submissionId } = req.params;
    const inline = req.query.inline === '1';
    const form = FORMS_BY_ID[formId];
    if (!form) return res.status(404).send('Unknown form');

    // Find the submission by reading the master log
    const rows = await loadFormSubmissions(form);
    const row = rows.find(r => r.submissionId === submissionId);
    if (!row) return res.status(404).send('Submission not found');

    // Authorization
    if (!isAdmin(req) && (row.submittedByEmail || '').toLowerCase() !== (req.user.email || '').toLowerCase()) {
      return res.status(403).send('Forbidden — you can only view your own submissions');
    }

    // Reconstruct the PDF path. We have `row.pdfLink` for admins, but it's a
    // OneDrive web URL — useless for streaming. We need to find the file by
    // path or by listing the folder. We know the format:
    //   <form.folder>/Reports/YYYY/MM/<formCode>_<keyTag>_<submissionId>.pdf
    // The YYYY/MM comes from submittedAt, but to be safe we'll list the
    // Reports/YYYY/MM/ folder and search by submissionId in the filename.
    const submittedAt = row.submittedAt || '';
    // submittedAt format from excel-log: "2026-04-30 10:30:15"
    const m = submittedAt.match(/^(\d{4})-(\d{2})/);
    if (!m) return res.status(500).send('Could not parse submission date');
    const yyyy = m[1], mm = m[2];

    // Try to find the file by listing the month folder and matching the
    // submission ID — most robust approach (avoids reconstructing the exact
    // filename which may include a project-name slug we'd have to recompute).
    const monthFolder = `${form.folder}/Reports/${yyyy}/${mm}`;
    let downloadUrl = null;
    let filename = `${form.code}_${submissionId}.pdf`;
    let fileSize = null;

    try {
      const items = await onedrive.listFolder(monthFolder);
      const match = items.find(item =>
        item.name && item.name.endsWith('.pdf') && item.name.includes(submissionId)
      );
      if (!match) return res.status(404).send('PDF not found in OneDrive');
      downloadUrl = match['@microsoft.graph.downloadUrl'];
      filename = match.name;
      fileSize = match.size;
    } catch (err) {
      console.error('[pdf list]', err.message);
      return res.status(500).send('Failed to locate PDF in OneDrive');
    }

    if (!downloadUrl) return res.status(404).send('PDF download URL unavailable');

    // Stream the file from OneDrive's pre-signed URL through to the user
    const upstream = await fetch(downloadUrl);
    if (!upstream.ok) return res.status(502).send('Failed to fetch PDF from OneDrive');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`);
    if (fileSize) res.setHeader('Content-Length', String(fileSize));
    // Pipe Web ReadableStream → Node response
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (err) {
    console.error('[GET /api/pdf]', err);
    if (!res.headersSent) res.status(500).send('Failed to fetch PDF');
  }
});

// Cache buster (admin can manually clear cache after editing master logs)
router.post('/submissions/cache-clear', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  for (const k of Object.keys(CACHE)) delete CACHE[k];
  res.json({ ok: true });
});

// Programmatic cache invalidation (called by approvals.js after approve/reject)
function clearCache() {
  for (const k of Object.keys(CACHE)) delete CACHE[k];
}
router.clearCache = clearCache;

module.exports = router;
