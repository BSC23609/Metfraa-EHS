// ============================================================================
// Excel master log builder
//
// For each form-type, we maintain a single _MasterLog.xlsx file in OneDrive.
// On every approval/rejection we download the file (if it exists), append a
// new row, and re-upload it.
//
// Columns added for the approval workflow:
//   Status (Approved / Rejected)
//   Reviewed By (Name)
//   Reviewed By (Email)
//   Reviewed At
//   Edits Made (audit trail of approver edits, "field: 'old' → 'new'")
//   Reject Reason (only populated for rejected submissions)
// ============================================================================

const ExcelJS = require('exceljs');
const onedrive = require('./onedrive');

// Brand colors (hex without #, ARGB format with FF prefix for full opacity)
const BRAND_BLUE_ARGB = 'FF005B96';
const STATUS_APPROVED_ARGB = 'FF1F8B4C';
const STATUS_REJECTED_ARGB = 'FFC0392B';
const HEADER_TEXT_ARGB = 'FFFFFFFF';

async function appendToMasterLog(form, submission, fileLinks, approval) {
  const logPath = `${form.folder}/_MasterLog.xlsx`;
  const wb = new ExcelJS.Workbook();
  let ws;

  // Try to load the existing log
  let existingBuffer = null;
  try {
    existingBuffer = await onedrive.downloadFile(logPath);
  } catch (err) {
    existingBuffer = null;
  }

  if (existingBuffer) {
    await wb.xlsx.load(existingBuffer);
    ws = wb.getWorksheet('Submissions') || wb.addWorksheet('Submissions');
    // Backfill missing approval columns if loaded from an older log
    ensureApprovalColumns(ws, form);
  } else {
    ws = wb.addWorksheet('Submissions');
    buildHeaderRow(ws, form);
  }

  // Build the data row
  const newRow = ws.addRow(buildDataRow(form, submission, fileLinks, approval));

  // Color-code status cell (find the column dynamically)
  const headers = (ws.getRow(1).values || []).map(v => String(v ?? '').trim());
  const statusCol = headers.findIndex(h => h === 'Status'); // 1-based; -1 if not found
  if (statusCol > 0) {
    const cell = newRow.getCell(statusCol);
    const isApproved = approval && approval.status === 'Approved';
    cell.font = { bold: true, color: { argb: HEADER_TEXT_ARGB } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isApproved ? STATUS_APPROVED_ARGB : STATUS_REJECTED_ARGB },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Auto-size columns (rough)
  ws.columns.forEach(col => {
    let maxLen = 12;
    col.eachCell({ includeEmpty: false }, cell => {
      const v = String(cell.value ?? '');
      if (v.length > maxLen) maxLen = Math.min(v.length, 60);
    });
    col.width = maxLen + 2;
  });

  // Re-upload
  const out = await wb.xlsx.writeBuffer();
  await onedrive.uploadFile(
    logPath,
    Buffer.from(out),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function buildHeaderRow(ws, form) {
  const headers = ['Submission ID', 'Submitted At', 'Submitted By (Name)', 'Submitted By (Email)'];
  for (const f of form.fields) {
    if (f.type === 'photo') {
      headers.push(`${f.label} (link)`);
    } else {
      headers.push(f.label);
    }
  }
  if (form.checklist) {
    form.checklist.forEach((item, i) => {
      headers.push(`#${i + 1} ${item} — Result`);
      headers.push(`#${i + 1} Remarks`);
      headers.push(`#${i + 1} Photo (link)`);
    });
  }
  headers.push('PDF Report (link)');
  // Approval workflow columns
  headers.push('Status');
  headers.push('Reviewed By (Name)');
  headers.push('Reviewed By (Email)');
  headers.push('Reviewed At');
  headers.push('Edits Made');
  headers.push('Reject Reason');

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, color: { argb: HEADER_TEXT_ARGB }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: BRAND_BLUE_ARGB },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  headerRow.height = 32;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// Backfill approval columns into a master log that was created BEFORE the
// approval workflow existed. We only add headers; existing rows stay blank.
function ensureApprovalColumns(ws, form) {
  const headers = (ws.getRow(1).values || []).map(v => String(v ?? '').trim());
  const required = ['Status', 'Reviewed By (Name)', 'Reviewed By (Email)',
                    'Reviewed At', 'Edits Made', 'Reject Reason'];
  let nextCol = headers.length; // headers from getRow.values is 1-indexed (index 0 is empty)
  let added = false;
  for (const h of required) {
    if (!headers.includes(h)) {
      const cell = ws.getCell(1, nextCol);
      cell.value = h;
      cell.font = { bold: true, color: { argb: HEADER_TEXT_ARGB }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_BLUE_ARGB } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      headers.push(h);
      nextCol++;
      added = true;
    }
  }
  if (added) {
    ws.getRow(1).height = 32;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

function buildDataRow(form, submission, fileLinks, approval) {
  const row = [
    submission.submissionId,
    new Date(submission.submittedAt).toISOString().replace('T', ' ').slice(0, 19),
    submission.user.name,
    submission.user.email,
  ];
  for (const f of form.fields) {
    if (f.type === 'photo') {
      const links = (fileLinks.fields[f.key] || []).join(' | ');
      row.push(links);
    } else {
      row.push(submission.fields[f.key] ?? '');
    }
  }
  if (form.checklist) {
    form.checklist.forEach((_, i) => {
      const item = submission.checklist[i] || {};
      row.push(item.result || '');
      row.push(item.remarks || '');
      row.push((fileLinks.checklist[i] || []).join(' | '));
    });
  }
  row.push(fileLinks.pdfReport || '');
  // Approval workflow columns
  if (approval) {
    row.push(approval.status || '');
    row.push(approval.reviewerName || '');
    row.push(approval.reviewerEmail || '');
    row.push(new Date(approval.reviewedAt || Date.now()).toISOString().replace('T', ' ').slice(0, 19));
    row.push(formatEdits(approval.edits));
    row.push(approval.rejectReason || '');
  } else {
    row.push('', '', '', '', '', '');
  }
  return row;
}

// Format the edits diff into a single human-readable cell value.
// `edits` is an object like:
//   { "fields.project_name": ["Old Project", "New Project"],
//     "checklist.3.result": ["NO", "YES"] }
function formatEdits(edits) {
  if (!edits || Object.keys(edits).length === 0) return '';
  const parts = [];
  for (const [key, [oldVal, newVal]] of Object.entries(edits)) {
    parts.push(`${key}: "${truncate(oldVal)}" → "${truncate(newVal)}"`);
  }
  return parts.join('; ');
}

function truncate(v, n = 60) {
  const s = String(v ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

module.exports = { appendToMasterLog };
