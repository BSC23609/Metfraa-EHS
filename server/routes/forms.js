// ============================================================================
// Form submission route — saves as PENDING for approval workflow
// ============================================================================

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const { FORMS_BY_ID } = require('../lib/forms-config');
const pendingStore = require('../lib/pending-store');

const router = express.Router();

// In-memory storage for uploads (we never persist them locally)
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
    // Enforced IST ID Generation
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
      // ENFORCED IST STRING FOR DASHBOARD & MASTER LOG
      submittedAt: getIstString(now), 
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
// Helpers: Bulletproof IST Converters (No external dependencies)
// ----------------------------------------------------------------------------

function getIstParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  if (map.hour === '24') map.hour = '00'; // Handle midnight edge case
  return map;
}

function getIstString(date) {
  const p = getIstParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function generateSubmissionId(form, date) {
  const p = getIstParts(date);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${form.code}-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}-${rand}`;
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