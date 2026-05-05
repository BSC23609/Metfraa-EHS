// ============================================================================
// Form submission route — saves as PENDING for approval workflow
// ============================================================================

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const { FORMS_BY_ID } = require('../lib/forms-config');
const pendingStore = require('../lib/pending-store');
// We must import the IST date enforcer here!
const { toIstString } = require('../lib/datetime'); 

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 60 }, 
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

    const now = new Date();
    const submissionId = generateSubmissionId(form, now);

    const photosByKey = {};
    for (const file of (req.files || [])) {
      const m = file.fieldname.match(/^photo:(.+)$/);
      if (!m) continue;
      const key = m[1];
      const compressed = await compressImage(file.buffer);
      (photosByKey[key] = photosByKey[key] || []).push(compressed);
    }

    const photoIndex = { fields: {}, checklist: {} };
    for (const [key, buffers] of Object.entries(photosByKey)) {
      for (let i = 0; i < buffers.length; i++) {
        const saved = await pendingStore.savePendingPhoto(form.id, submissionId, key, i + 1, buffers[i]);
        const entry = { filename: saved.filename, webUrl: saved.webUrl };
        if (key.startsWith('checklist:')) {
          const idx = parseInt(key.split(':')[1], 10);
          (photoIndex.checklist[idx] = photoIndex.checklist[idx] || []).push(entry);
        } else {
          (photoIndex.fields[key] = photoIndex.fields[key] || []).push(entry);
        }
      }
    }

    // Build the pending submission JSON
    const submission = {
      submissionId,
      formId: form.id,
      formCode: form.code,
      formTitle: form.title,
      // FIX: This forces the clean IST format immediately upon draft creation
      submittedAt: toIstString(now), 
      user: {
        name: req.user.name,
        email: req.user.email,
      },
      fields: data.fields || {},
      checklist: data.checklist || [],
      photos: photoIndex,
      status: 'pending',
    };

    await pendingStore.savePending(form.id, submissionId, submission);

    res.json({
      ok: true,
      submissionId,
      status: 'pending',
      message: `${form.title} submitted for approval. Awaiting Varadharaj or Nirmal Kumar.`,
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

async function compressImage(buffer) {
  try {
    return await sharp(buffer)
      .rotate() 
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.warn('[compressImage] sharp failed, returning original buffer:', err.message);
    return buffer;
  }
}

module.exports = router;