// ============================================================================
// Excel master log builder
//
// For each form-type, we maintain a single _MasterLog.xlsx file in OneDrive.
// On every submission we download the file (if it exists), append a new row,
// and re-upload it. For checklist forms each checklist item becomes its own
// column (Item N — Result; Item N — Remarks).
// ============================================================================

const ExcelJS = require('exceljs');
const onedrive = require('./onedrive');

// Brand colors (hex without #, ARGB format with FF prefix for full opacity)
const BRAND_BLUE_ARGB = 'FF005B96';
const BRAND_BLACK_ARGB = 'FF000000';
const HEADER_TEXT_ARGB = 'FFFFFFFF';

async function appendToMasterLog(form, submission, fileLinks) {
  const logPath = `${form.folder}/_MasterLog.xlsx`;
  const wb = new ExcelJS.Workbook();
  let ws;

  // Try to load the existing log
  let existingBuffer = null;
  try {
    existingBuffer = await onedrive.downloadFile(logPath);
  } catch (err) {
    // file doesn't exist yet, that's fine
    existingBuffer = null;
  }

  if (existingBuffer) {
    await wb.xlsx.load(existingBuffer);
    ws = wb.getWorksheet('Submissions') || wb.addWorksheet('Submissions');
  } else {
    ws = wb.addWorksheet('Submissions');
    buildHeaderRow(ws, form);
  }

  // Build the data row
  const row = buildDataRow(form, submission, fileLinks);
  ws.addRow(row);

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

function buildDataRow(form, submission, fileLinks) {
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
  return row;
}

module.exports = { appendToMasterLog };
