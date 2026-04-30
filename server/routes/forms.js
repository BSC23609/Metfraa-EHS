// ============================================================================
// Form submission route
//
// POST /api/submit/:formId
//   Multipart form data:
//     - "data" : JSON blob of all form values + checklist results
//     - photo files: field name = "photo:<fieldKey>" or "photo:checklist:<i>"
//
// What happens on submission:
//   1) Validate form ID and structure
//   2) Compress / normalize uploaded photos (sharp)
//   3) Upload each photo to OneDrive at form folder/Reports/YYYY/MM/Photos/
//   4) Build the PDF report -> upload to Reports/YYYY/MM/
//   5) Append a row to _MasterLog.xlsx
//   6) Return success + links
// ============================================================================

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

const { FORMS_BY_ID } = require('../lib/forms-config');
const onedrive = require('../lib/onedrive');
const { generatePdfReport } = require('../lib/pdf-report');
const { appendToMasterLog } = require('../lib/excel-log');

const router = express.Router();

// In-memory storage for uploads (we never persist them locally)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 60 }, // 25 MB per file, up to 60 files
});

router.post('/:formId', upload.any(), async (req, res, next) => {
  try {
    const form = FORMS_BY_ID[req.params.formId];
    if (!form) return res.status(404).json({ error: 'Unknown form' });

    let data;
    try {
      data = JSON.parse(req.body.data || '{}');
    } catch (err) {
      return res.status(400).json({ error: 'Invalid form data JSON' });
    }

    // Build the submission object
    const now = new Date();
    const submissionId = generateSubmissionId(form, now);
    const submission = {
      submissionId,
      submittedAt: now.toISOString(),
      user: {
        name: req.user.name,
        email: req.user.email,
      },
      fields: data.fields || {},
      checklist: data.checklist || [],
    };

    // Group uploaded photos by their target slot
    const photosByKey = {}; // { "<fieldKey>" : [Buffer], "checklist:<i>" : [Buffer] }
    for (const file of (req.files || [])) {
      // file.fieldname is "photo:project_name" or "photo:checklist:3"
      const m = file.fieldname.match(/^photo:(.+)$/);
      if (!m) continue;
      const key = m[1];
      const compressed = await compressImage(file.buffer);
      (photosByKey[key] = photosByKey[key] || []).push({
        buffer: compressed,
        originalName: file.originalname || 'photo.jpg',
      });
    }

    // Upload photos to OneDrive
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const photoFolder = `${form.folder}/Reports/${yyyy}/${mm}/Photos/${submissionId}`;

    const photoBuffers = { fields: {}, checklist: {} };
    const photoLinks = { fields: {}, checklist: {} };

    for (const [key, files] of Object.entries(photosByKey)) {
      for (let i = 0; i < files.length; i++) {
        const safeName = `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}_${i + 1}.jpg`;
        const relPath = `${photoFolder}/${safeName}`;
        const uploaded = await onedrive.uploadFile(relPath, files[i].buffer, 'image/jpeg');

        const link = uploaded.webUrl || '';
        if (key.startsWith('checklist:')) {
          const idx = parseInt(key.split(':')[1], 10);
          (photoBuffers.checklist[idx] = photoBuffers.checklist[idx] || []).push(files[i].buffer);
          (photoLinks.checklist[idx] = photoLinks.checklist[idx] || []).push(link);
        } else {
          (photoBuffers.fields[key] = photoBuffers.fields[key] || []).push(files[i].buffer);
          (photoLinks.fields[key] = photoLinks.fields[key] || []).push(link);
        }
      }
    }

    // Generate PDF
    const pdfBuffer = await generatePdfReport(form, submission, photoBuffers);
    const pdfFileName = buildPdfFileName(form, submission);
    const pdfRelPath = `${form.folder}/Reports/${yyyy}/${mm}/${pdfFileName}`;
    const pdfUploaded = await onedrive.uploadFile(pdfRelPath, pdfBuffer, 'application/pdf');

    // Append to Excel master log
    await appendToMasterLog(form, submission, {
      fields: photoLinks.fields,
      checklist: photoLinks.checklist,
      pdfReport: pdfUploaded.webUrl || '',
    });

    res.json({
      ok: true,
      submissionId,
      pdfUrl: pdfUploaded.webUrl,
      photos: { fields: photoLinks.fields, checklist: photoLinks.checklist },
      message: `${form.title} submitted. Saved to OneDrive: ${pdfRelPath}`,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function generateSubmissionId(form, date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${form.code}-${yyyy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
}

function buildPdfFileName(form, submission) {
  // Try to include a meaningful identifier (project name / equipment no.) if present
  const f = submission.fields || {};
  const tag = (
    f.equipment_no ||
    f.project_name ||
    f.site_name ||
    f.employee_name ||
    f.meeting_no ||
    'submission'
  )
    .toString()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 30);
  return `${form.code}_${tag}_${submission.submissionId}.pdf`;
}

async function compressImage(buffer) {
  try {
    return await sharp(buffer)
      .rotate() // honor EXIF orientation
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.warn('[compressImage] sharp failed, returning original buffer:', err.message);
    return buffer;
  }
}

module.exports = router;
