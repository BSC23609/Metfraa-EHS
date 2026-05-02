// ============================================================================
// PDF report generator
//
// Produces a branded PDF for a single submission. Uses PDFKit (no headless
// browser needed -> works fine on Render's free tier).
// ============================================================================
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Brand colors
const COLOR_BLACK = '#000000';
const COLOR_BLUE = '#005B96';
const COLOR_GREY = '#6B6B6B';
const COLOR_LIGHT_GREY = '#E5E5E5';
const COLOR_RED = '#C0392B';
const COLOR_GREEN = '#27AE60';

const LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');

// Returns: Buffer of the rendered PDF
async function generatePdfReport(form, submission, photoBuffers) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true, // required for switchToPage() to work for footer rendering
        info: {
          Title: `${form.title} — ${submission.submissionId}`,
          Author: 'Metfraa Steel Buildings Pvt. Ltd.',
          Subject: form.title,
          Creator: 'Metfraa EHS App',
        },
      });

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, form);
      drawSubmissionMeta(doc, submission);
      drawFields(doc, form, submission, photoBuffers);
      if (form.checklist) {
        drawChecklist(doc, form, submission, photoBuffers);
      }
      drawFooter(doc, submission);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawHeader(doc, form) {
  // Top brand bar
  doc.rect(0, 0, doc.page.width, 8).fill(COLOR_BLUE);

  // Logo
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 50, 25, { height: 45 });
  }

  // Title (right side)
  doc.fillColor(COLOR_BLACK)
     .font('Helvetica-Bold')
     .fontSize(16)
     .text(form.title.toUpperCase(), 0, 35, {
       width: doc.page.width - 50, align: 'right', lineBreak: false,
     });
  doc.fillColor(COLOR_GREY)
     .font('Helvetica')
     .fontSize(9)
     .text(`Form Code: ${form.code}`, 0, 56, {
       width: doc.page.width - 50, align: 'right', lineBreak: false,
     });

  // Separator line
  doc.moveTo(50, 85).lineTo(doc.page.width - 50, 85).strokeColor(COLOR_BLUE).lineWidth(1).stroke();

  doc.y = 100;
}

function drawSubmissionMeta(doc, submission) {
  doc.fillColor(COLOR_BLACK).font('Helvetica-Bold').fontSize(9);
  const startY = doc.y;
  const colWidth = (doc.page.width - 100) / 2;

  // Submission ID + submitted-at + user
  const left = [
    ['Submission ID', submission.submissionId],
    ['Submitted At', new Date(submission.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
  ];
  const right = [
    ['Submitted By', submission.user.name],
    ['Email', submission.user.email],
  ];

  drawMetaColumn(doc, 50, startY, colWidth, left);
  drawMetaColumn(doc, 50 + colWidth, startY, colWidth, right);
  doc.y = startY + left.length * 16 + 8;
}

function drawMetaColumn(doc, x, y, width, rows) {
  rows.forEach((r, i) => {
    const rowY = y + i * 16;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_GREY)
       .text(r[0].toUpperCase(), x, rowY, { width: width, lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_BLACK)
       .text(r[1] || '—', x, rowY + 8, { width: width, lineBreak: false });
  });
}

function drawSectionHeader(doc, label) {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 22).fill(COLOR_BLACK);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
     .text(label.toUpperCase(), 60, y + 6, { lineBreak: false });
  doc.y = y + 28;
}

function drawFields(doc, form, submission, photoBuffers) {
  drawSectionHeader(doc, 'Form Details');

  for (const f of form.fields) {
    if (f.type === 'photo') {
      drawPhotoField(doc, f, photoBuffers.fields[f.key] || []);
    } else {
      drawTextField(doc, f, submission.fields[f.key]);
    }
  }
}

function drawTextField(doc, field, value) {
  ensureSpace(doc, 35);
  const x = 50;
  const width = doc.page.width - 100;
  const startY = doc.y;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_GREY)
     .text(field.label.toUpperCase(), x, startY, { width, lineBreak: false });

  const displayValue = (value === undefined || value === null || value === '') ? '—' : String(value);
  doc.font('Helvetica').fontSize(11).fillColor(COLOR_BLACK)
     .text(displayValue, x, startY + 12, { width });

  // Underline below the value
  const underlineY = doc.y + 2;
  doc.moveTo(x, underlineY).lineTo(x + width, underlineY).strokeColor(COLOR_LIGHT_GREY).lineWidth(0.5).stroke();
  doc.y = underlineY + 8;
}

function drawPhotoField(doc, field, buffers) {
  if (!buffers || buffers.length === 0) {
    drawTextField(doc, field, '— no photo —');
    return;
  }
  ensureSpace(doc, 180);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_GREY)
     .text(field.label.toUpperCase(), 50, doc.y);
  doc.y += 4;

  const photoH = 140;
  const photoW = 180;
  let x = 50;
  for (const buf of buffers) {
    if (x + photoW > doc.page.width - 50) {
      doc.y += photoH + 12;
      x = 50;
      ensureSpace(doc, photoH + 20);
    }
    try {
      doc.image(buf, x, doc.y, { fit: [photoW, photoH], align: 'left' });
      doc.rect(x, doc.y, photoW, photoH).strokeColor(COLOR_LIGHT_GREY).lineWidth(0.5).stroke();
    } catch (err) {
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_RED)
         .text('[image render failed]', x, doc.y, { width: photoW });
    }
    x += photoW + 10;
  }
  doc.y += photoH + 14;
}

function drawChecklist(doc, form, submission, photoBuffers) {
  drawSectionHeader(doc, 'Inspection Checklist');

  const x0 = 50;
  const tableWidth = doc.page.width - 100;
  const colNo = 28;
  const colResult = 60;
  const colRemarks = 130;
  const colPhoto = 90;
  const colParam = tableWidth - colNo - colResult - colRemarks - colPhoto;
  const bottomBoundary = () => doc.page.height - 60; // reserve room for footer

  const drawTableHeader = () => {
    const y = doc.y;
    doc.rect(x0, y, tableWidth, 20).fill(COLOR_BLUE);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('#', x0 + 4, y + 6, { width: colNo, lineBreak: false });
    doc.text('Parameter', x0 + colNo + 4, y + 6, { width: colParam, lineBreak: false });
    doc.text('Result', x0 + colNo + colParam + 4, y + 6, { width: colResult, lineBreak: false });
    doc.text('Remarks', x0 + colNo + colParam + colResult + 4, y + 6, { width: colRemarks, lineBreak: false });
    doc.text('Photo', x0 + colNo + colParam + colResult + colRemarks + 4, y + 6, { width: colPhoto, lineBreak: false });
    doc.y = y + 22;
  };

  // Make sure table header fits on current page
  if (doc.y + 30 > bottomBoundary()) {
    doc.addPage();
  }
  drawTableHeader();

  form.checklist.forEach((param, i) => {
    const item = submission.checklist[i] || {};
    const photo = (photoBuffers.checklist[i] || [])[0];
    const remarks = item.remarks || '';
    const result = item.result || '';

    // Estimate row height (use heightOfString with options to be accurate)
    const paramHeight = doc.font('Helvetica').fontSize(9).heightOfString(param, { width: colParam - 8 });
    const remarksHeight = doc.heightOfString(remarks || '—', { width: colRemarks - 8 });
    const photoHeight = photo ? 70 : 12;
    const rowHeight = Math.max(paramHeight, remarksHeight, photoHeight, 24) + 8;

    // Page-break: if this row won't fit, add a new page and redraw the header
    if (doc.y + rowHeight + 4 > bottomBoundary()) {
      doc.addPage();
      drawTableHeader();
    }

    const rowY = doc.y;

    // Row background (zebra)
    if (i % 2 === 0) {
      doc.rect(x0, rowY, tableWidth, rowHeight).fill('#F5F8FB');
    }

    // Use lineBreak: false on all cells to prevent PDFKit from auto-paginating
    doc.fillColor(COLOR_BLACK).font('Helvetica').fontSize(9);
    doc.text(String(i + 1), x0 + 4, rowY + 4, { width: colNo - 4, lineBreak: false });

    // Parameter — allow wrapping but constrain height
    doc.text(param, x0 + colNo + 4, rowY + 4, { width: colParam - 8, height: rowHeight - 8, ellipsis: false });

    // Result badge
    const isYes = result.toUpperCase() === 'YES';
    const isNo = result.toUpperCase() === 'NO';
    if (isYes || isNo) {
      doc.fillColor(isYes ? COLOR_GREEN : COLOR_RED)
         .font('Helvetica-Bold').fontSize(9)
         .text(result.toUpperCase(), x0 + colNo + colParam + 4, rowY + 4, { width: colResult - 8, lineBreak: false });
    } else {
      doc.fillColor(COLOR_GREY).font('Helvetica').fontSize(9)
         .text(result || '—', x0 + colNo + colParam + 4, rowY + 4, { width: colResult - 8, lineBreak: false });
    }

    doc.fillColor(COLOR_BLACK).font('Helvetica').fontSize(9)
       .text(remarks || '—', x0 + colNo + colParam + colResult + 4, rowY + 4,
             { width: colRemarks - 8, height: rowHeight - 8 });

    if (photo) {
      try {
        doc.image(photo, x0 + colNo + colParam + colResult + colRemarks + 4, rowY + 4, {
          fit: [colPhoto - 8, rowHeight - 8],
        });
      } catch (err) {
        doc.fillColor(COLOR_RED).fontSize(8)
           .text('[img err]', x0 + colNo + colParam + colResult + colRemarks + 4, rowY + 4, { lineBreak: false });
      }
    } else {
      doc.fillColor(COLOR_GREY).fontSize(9)
         .text('—', x0 + colNo + colParam + colResult + colRemarks + 4, rowY + 4, { lineBreak: false });
    }

    // Row border
    doc.moveTo(x0, rowY + rowHeight).lineTo(x0 + tableWidth, rowY + rowHeight)
       .strokeColor(COLOR_LIGHT_GREY).lineWidth(0.5).stroke();

    // Manually advance cursor — this is critical
    doc.y = rowY + rowHeight;
  });
}

function drawFooter(doc, submission) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);

    // Temporarily expand the page's bottom margin so text near the edge
    // doesn't trigger PDFKit's auto-pagination
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // Bottom brand bar
    doc.rect(0, doc.page.height - 25, doc.page.width, 25).fill(COLOR_BLACK);
    doc.rect(0, doc.page.height - 25, doc.page.width, 3).fill(COLOR_BLUE);

    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8)
       .text('METFRAA STEEL BUILDINGS PVT. LTD.  |  Steeling the Future', 50, doc.page.height - 16,
         { width: doc.page.width - 100, align: 'left', lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, 50, doc.page.height - 16,
       { width: doc.page.width - 100, align: 'right', lineBreak: false });

    // Restore margin
    doc.page.margins.bottom = originalBottom;
  }
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

module.exports = { generatePdfReport };
