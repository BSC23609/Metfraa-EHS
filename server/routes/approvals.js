// ============================================================================
// Approvals API
//
// Endpoints (all require approver/admin role):
//   GET  /api/approvals                — count + list of all pending submissions
//   GET  /api/approvals/:formId/:subId — full data of one pending submission
//   GET  /api/approvals/:formId/:subId/photo/:filename
//                                       — proxy a pending photo for inline display
//   POST /api/approvals/:formId/:subId/approve
//        body: { fields, checklist }    — optional edits
//   POST /api/approvals/:formId/:subId/reject
//        body: { reason }
//
// Concurrency: first approver wins. The pending JSON file is the lock —
// once it's deleted (during approve/reject), the second approver gets a
// 409 Conflict ("already handled").
// ============================================================================

const express = require('express');
const onedrive = require('../lib/onedrive');
const pendingStore = require('../lib/pending-store');
const { FORMS_BY_ID } = require('../lib/forms-config');
const { generatePdfReport } = require('../lib/pdf-report');
const { appendToMasterLog } = require('../lib/excel-log');
const { requireApprover } = require('../lib/auth-middleware');

const router = express.Router();

// All approval endpoints require approver/admin
router.use(requireApprover);

// ----------------------------------------------------------------------------
// GET /api/approvals — list ALL pending submissions
// ----------------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const all = await pendingStore.listAllPending();
    // Sort newest first by submittedAt
    all.sort((a, b) => (b.data.submittedAt || '').localeCompare(a.data.submittedAt || ''));
    // Build a lightweight summary for each (don't dump full field data in list view)
    const rows = all.map(p => {
      const form = FORMS_BY_ID[p.formId];
      const fields = p.data.fields || {};
      // Pick a "key identifier" — first matching key wins
      const keyValue =
        fields.equipment_no ||
        fields.project_name ||
        fields.site_name ||
        fields.employee_name ||
        fields.meeting_no ||
        fields.permit_no ||
        '';
      return {
        formId: p.formId,
        formCode: form?.code || p.formId,
        formTitle: form?.title || p.formId,
        submissionId: p.submissionId,
        submittedAt: p.data.submittedAt,
        submittedByName: p.data.user?.name || '',
        submittedByEmail: p.data.user?.email || '',
        keyValue,
      };
    });
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('[GET /api/approvals]', err);
    res.status(500).json({ error: err.message || 'Failed to load pending submissions' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/approvals/:formId/:subId — full pending submission
// ----------------------------------------------------------------------------

router.get('/:formId/:subId', async (req, res) => {
  try {
    const { formId, subId } = req.params;
    const form = FORMS_BY_ID[formId];
    if (!form) return res.status(404).json({ error: 'Unknown form' });

    const data = await pendingStore.loadPending(formId, subId);
    if (!data) return res.status(404).json({ error: 'Pending submission not found (may have been already handled)' });

    // Add form definition so the frontend can render fields/checklist correctly
    res.json({
      form: {
        id: form.id,
        code: form.code,
        title: form.title,
        category: form.category,
        fields: form.fields,
        checklist: form.checklist || null,
      },
      submission: data,
    });
  } catch (err) {
    console.error('[GET /api/approvals/:formId/:subId]', err);
    res.status(500).json({ error: err.message || 'Failed to load submission' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/approvals/:formId/:subId/photo/:filename — proxy a pending photo
// ----------------------------------------------------------------------------

router.get('/:formId/:subId/photo/:filename', async (req, res) => {
  try {
    const { formId, subId, filename } = req.params;
    const photoPath = `${pendingStore.pendingPhotosFolder(formId, subId)}/${filename}`;
    const downloadUrl = await onedrive.getDownloadUrl(photoPath);
    if (!downloadUrl) return res.status(404).send('Photo not found');

    const upstream = await fetch(downloadUrl);
    if (!upstream.ok) return res.status(502).send('Failed to fetch photo');

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('[GET pending photo]', err);
    if (!res.headersSent) res.status(500).send('Failed to fetch photo');
  }
});

// ----------------------------------------------------------------------------
// POST /api/approvals/:formId/:subId/approve
//   body: { fields, checklist }
// ----------------------------------------------------------------------------

router.post('/:formId/:subId/approve', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { formId, subId } = req.params;
    const form = FORMS_BY_ID[formId];
    if (!form) return res.status(404).json({ error: 'Unknown form' });

    // Load original pending data (this is also our lock check — first to load+process wins)
    const original = await pendingStore.loadPending(formId, subId);
    if (!original) {
      return res.status(409).json({ error: 'Already handled by another reviewer' });
    }

    // Build the final submission with edits applied
    const editedFields = req.body.fields || original.fields || {};
    const editedChecklist = req.body.checklist || original.checklist || [];

    // Compute diff for the audit log
    const edits = computeEdits(form, original, { fields: editedFields, checklist: editedChecklist });

    const finalSubmission = {
      submissionId: original.submissionId,
      submittedAt: original.submittedAt,
      user: original.user,
      fields: editedFields,
      checklist: editedChecklist,
    };
    const approval = {
      status: 'Approved',
      reviewerName: req.user.name,
      reviewerEmail: req.user.email,
      reviewedAt: new Date().toISOString(),
      edits,
    };

    // Download all the pending photos so we can: (a) embed them in the PDF,
    // and (b) re-upload to the final Reports/ location
    const { photoBuffers, photoMoves } = await loadPendingPhotos(formId, subId, original);

    // Generate the PDF
    const pdfBuffer = await generatePdfReport(form, finalSubmission, photoBuffers, approval);

    // Upload PDF + photos to final destinations
    // original.submittedAt is the IST string "YYYY-MM-DD HH:MM:SS" — parse the
    // year/month directly from the string to avoid timezone reinterpretation.
    const submittedAtMatch = String(original.submittedAt || '').match(/^(\d{4})-(\d{2})/);
    const yyyy = submittedAtMatch ? submittedAtMatch[1] : String(new Date().getFullYear());
    const mm = submittedAtMatch ? submittedAtMatch[2] : String(new Date().getMonth() + 1).padStart(2, '0');
    const finalPhotoFolder = `${form.folder}/Reports/${yyyy}/${mm}/Photos/${subId}`;

    const photoLinks = { fields: {}, checklist: {} };
    for (const move of photoMoves) {
      // Move photo from _Pending → Reports
      const newPath = `${finalPhotoFolder}/${move.filename}`;
      let webUrl = '';
      try {
        await onedrive.moveFile(move.srcPath, finalPhotoFolder, move.filename);
        const info = await onedrive.getFileInfo(newPath);
        webUrl = info?.webUrl || '';
      } catch (err) {
        console.error(`[approve] failed to move photo ${move.srcPath}: ${err.message}`);
      }
      if (move.kind === 'checklist') {
        (photoLinks.checklist[move.idx] = photoLinks.checklist[move.idx] || []).push(webUrl);
      } else {
        (photoLinks.fields[move.key] = photoLinks.fields[move.key] || []).push(webUrl);
      }
    }

    // Upload PDF
    const pdfFileName = buildPdfFileName(form, { ...finalSubmission, fields: editedFields });
    const pdfRelPath = `${form.folder}/Reports/${yyyy}/${mm}/${pdfFileName}`;
    const pdfUploaded = await onedrive.uploadFile(pdfRelPath, pdfBuffer, 'application/pdf');

    // Append to master log
    await appendToMasterLog(form, finalSubmission, {
      fields: photoLinks.fields,
      checklist: photoLinks.checklist,
      pdfReport: pdfUploaded.webUrl || '',
    }, approval);

    // Delete the pending submission (JSON + any leftover photos folder)
    await pendingStore.deletePending(formId, subId);

    // Bust the submissions cache so the new approved row shows up immediately
    try {
      const submissionsRouter = require('./submissions');
      if (submissionsRouter.clearCache) submissionsRouter.clearCache();
    } catch {}

    res.json({
      ok: true,
      submissionId: subId,
      status: 'Approved',
      pdfUrl: pdfUploaded.webUrl,
      editsCount: Object.keys(edits).length,
    });
  } catch (err) {
    console.error('[POST approve]', err);
    res.status(500).json({ error: err.message || 'Approval failed' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/approvals/:formId/:subId/reject
//   body: { reason }
// ----------------------------------------------------------------------------

router.post('/:formId/:subId/reject', express.json(), async (req, res) => {
  try {
    const { formId, subId } = req.params;
    const form = FORMS_BY_ID[formId];
    if (!form) return res.status(404).json({ error: 'Unknown form' });

    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });

    const original = await pendingStore.loadPending(formId, subId);
    if (!original) {
      return res.status(409).json({ error: 'Already handled by another reviewer' });
    }

    const finalSubmission = {
      submissionId: original.submissionId,
      submittedAt: original.submittedAt,
      user: original.user,
      fields: original.fields,
      checklist: original.checklist,
    };
    const approval = {
      status: 'Rejected',
      reviewerName: req.user.name,
      reviewerEmail: req.user.email,
      reviewedAt: new Date().toISOString(),
      edits: {},
      rejectReason: reason,
    };

    // Append rejection row to master log (no PDF, no photo links)
    await appendToMasterLog(form, finalSubmission, {
      fields: {},
      checklist: {},
      pdfReport: '',
    }, approval);

    // Delete the pending submission entirely (drop photos too)
    await pendingStore.deletePending(formId, subId);

    try {
      const submissionsRouter = require('./submissions');
      if (submissionsRouter.clearCache) submissionsRouter.clearCache();
    } catch {}

    res.json({
      ok: true,
      submissionId: subId,
      status: 'Rejected',
      reason,
    });
  } catch (err) {
    console.error('[POST reject]', err);
    res.status(500).json({ error: err.message || 'Rejection failed' });
  }
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function buildPdfFileName(form, submission) {
  const f = submission.fields || {};
  const tag = (
    f.equipment_no ||
    f.project_name ||
    f.site_name ||
    f.employee_name ||
    f.meeting_no ||
    f.permit_no ||
    'submission'
  ).toString().replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
  return `${form.code}_${tag}_${submission.submissionId}.pdf`;
}

// Compute a diff between original pending data and edited data
function computeEdits(form, original, edited) {
  const edits = {};
  const origFields = original.fields || {};
  const newFields = edited.fields || {};
  for (const f of form.fields) {
    if (f.type === 'photo') continue; // photos can't be edited (yet)
    const o = String(origFields[f.key] ?? '');
    const n = String(newFields[f.key] ?? '');
    if (o !== n) edits[f.label] = [o, n];
  }
  if (form.checklist) {
    const origCl = original.checklist || [];
    const newCl = edited.checklist || [];
    form.checklist.forEach((item, i) => {
      const o = origCl[i] || {};
      const n = newCl[i] || {};
      if (String(o.result || '') !== String(n.result || '')) {
        edits[`#${i + 1} Result`] = [o.result || '', n.result || ''];
      }
      if (String(o.remarks || '') !== String(n.remarks || '')) {
        edits[`#${i + 1} Remarks`] = [o.remarks || '', n.remarks || ''];
      }
    });
  }
  return edits;
}

// Download all the pending photos for a submission, return Buffer map for PDF
// embedding AND the list of source paths so we can move them after approval.
async function loadPendingPhotos(formId, subId, original) {
  const photoBuffers = { fields: {}, checklist: {} };
  const photoMoves = [];

  const photos = original.photos || { fields: {}, checklist: {} };
  // Field photos
  for (const [key, list] of Object.entries(photos.fields || {})) {
    for (const entry of list) {
      const srcPath = `${pendingStore.pendingPhotosFolder(formId, subId)}/${entry.filename}`;
      try {
        const buf = await onedrive.downloadFile(srcPath);
        (photoBuffers.fields[key] = photoBuffers.fields[key] || []).push(buf);
        photoMoves.push({ kind: 'field', key, srcPath, filename: entry.filename });
      } catch (err) {
        console.warn(`[loadPendingPhotos] field photo ${entry.filename} not found`);
      }
    }
  }
  // Checklist photos
  for (const [idx, list] of Object.entries(photos.checklist || {})) {
    for (const entry of list) {
      const srcPath = `${pendingStore.pendingPhotosFolder(formId, subId)}/${entry.filename}`;
      try {
        const buf = await onedrive.downloadFile(srcPath);
        (photoBuffers.checklist[idx] = photoBuffers.checklist[idx] || []).push(buf);
        photoMoves.push({ kind: 'checklist', idx: parseInt(idx, 10), srcPath, filename: entry.filename });
      } catch (err) {
        console.warn(`[loadPendingPhotos] checklist photo ${entry.filename} not found`);
      }
    }
  }
  return { photoBuffers, photoMoves };
}

module.exports = router;
