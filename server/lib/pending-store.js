// ============================================================================
// Pending Submissions Store
//
// When a user submits a form, the data + photos are saved as a "pending"
// submission in OneDrive. An approver later reviews, optionally edits,
// and either approves (→ generates PDF + appends to master log) or
// rejects (→ records the rejection in the master log).
//
// OneDrive layout for pending submissions:
//   Metfraa-EHS/
//     _Pending/
//       <formId>/
//         <submissionId>.json   ← pending data (fields + checklist + meta)
//         <submissionId>/
//           photos/             ← uploaded photos (kept here until approved)
//             field-key_1.jpg
//             checklist-3_1.jpg
//             ...
//
// On approval:
//   - JSON file is deleted
//   - Photos move to: <form.folder>/Reports/YYYY/MM/Photos/<submissionId>/
//   - PDF generated and uploaded to: <form.folder>/Reports/YYYY/MM/<filename>.pdf
//   - Row appended to: <form.folder>/_MasterLog.xlsx (Status: Approved)
//
// On rejection:
//   - JSON file is deleted (we don't keep rejected drafts)
//   - Photos folder is deleted
//   - Row appended to master log (Status: Rejected, with reason)
// ============================================================================

const onedrive = require('./onedrive');

const PENDING_ROOT = '_Pending';

function pendingJsonPath(formId, submissionId) {
  return `${PENDING_ROOT}/${formId}/${submissionId}.json`;
}

function pendingPhotosFolder(formId, submissionId) {
  return `${PENDING_ROOT}/${formId}/${submissionId}/photos`;
}

// Save a pending submission (JSON metadata only — photos are uploaded separately)
async function savePending(formId, submissionId, data) {
  const path = pendingJsonPath(formId, submissionId);
  const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  return onedrive.uploadFile(path, buffer, 'application/json');
}

// Save a single photo for a pending submission
// `key` is e.g. "tbt_photo" (form field) or "checklist:3" (checklist item)
// `index` is 1-based for multi-photo fields
async function savePendingPhoto(formId, submissionId, key, index, buffer) {
  const safeKey = key.replace(/[^a-zA-Z0-9_:-]/g, '_').replace(':', '-');
  const filename = `${safeKey}_${index}.jpg`;
  const path = `${pendingPhotosFolder(formId, submissionId)}/${filename}`;
  const result = await onedrive.uploadFile(path, buffer, 'image/jpeg');
  return { path, filename, webUrl: result.webUrl };
}

// Load one pending submission's JSON
async function loadPending(formId, submissionId) {
  const path = pendingJsonPath(formId, submissionId);
  try {
    const buffer = await onedrive.downloadFile(path);
    return JSON.parse(buffer.toString('utf-8'));
  } catch (err) {
    if (err.statusCode === 404 || /404/.test(err.message)) return null;
    throw err;
  }
}

// List all pending submissions for ALL forms
// Returns: array of { formId, submissionId, data, jsonPath }
async function listAllPending() {
  const formFolder = `${PENDING_ROOT}`;
  let formFolders;
  try {
    formFolders = await onedrive.listFolder(formFolder);
  } catch (err) {
    if (err.statusCode === 404) return [];
    throw err;
  }

  const all = [];
  for (const folder of formFolders) {
    if (!folder.folder) continue;
    const formId = folder.name;
    let items;
    try {
      items = await onedrive.listFolder(`${PENDING_ROOT}/${formId}`);
    } catch (err) {
      console.error(`[listAllPending] failed to list ${formId}:`, err.message);
      continue;
    }

    for (const item of items) {
      if (!item.file || !item.name?.endsWith('.json')) continue;
      const submissionId = item.name.replace(/\.json$/, '');
      try {
        const data = await loadPending(formId, submissionId);
        if (data) all.push({ formId, submissionId, data });
      } catch (err) {
        console.error(`[listAllPending] failed to load ${formId}/${submissionId}:`, err.message);
      }
    }
  }
  return all;
}

// List photos in a pending submission's photos folder
// Returns: array of { name, downloadUrl, key, index }
async function listPendingPhotos(formId, submissionId) {
  try {
    const items = await onedrive.listFolder(pendingPhotosFolder(formId, submissionId));
    return items
      .filter(i => i.file && /\.(jpg|jpeg|png)$/i.test(i.name))
      .map(i => {
        // Parse "<key>_<index>.jpg" → { key, index }
        const m = i.name.match(/^(.+)_(\d+)\.(jpg|jpeg|png)$/i);
        return {
          name: i.name,
          downloadUrl: i['@microsoft.graph.downloadUrl'],
          key: m ? m[1].replace(/-/g, ':') : i.name,
          index: m ? parseInt(m[2], 10) : 1,
        };
      });
  } catch (err) {
    if (err.statusCode === 404) return [];
    throw err;
  }
}

// Delete a pending submission entirely (JSON + photos folder)
// Used after approval (photos moved elsewhere) or rejection (photos discarded)
async function deletePending(formId, submissionId) {
  // Delete JSON file
  const jsonPath = pendingJsonPath(formId, submissionId);
  try {
    await onedrive.deletePath(jsonPath);
  } catch (err) {
    if (err.statusCode !== 404) console.error(`[deletePending] JSON delete failed: ${err.message}`);
  }
  // Delete photos folder
  const photoFolder = `${PENDING_ROOT}/${formId}/${submissionId}`;
  try {
    await onedrive.deletePath(photoFolder);
  } catch (err) {
    if (err.statusCode !== 404) console.error(`[deletePending] photos delete failed: ${err.message}`);
  }
}

module.exports = {
  PENDING_ROOT,
  pendingJsonPath,
  pendingPhotosFolder,
  savePending,
  savePendingPhoto,
  loadPending,
  listAllPending,
  listPendingPhotos,
  deletePending,
};
