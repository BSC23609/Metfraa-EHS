// ============================================================================
// Admin Dashboard API
//
// Single endpoint: GET /api/admin/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
// Aggregates submission data across all forms within a date range and returns:
//   - totalCount, pendingCount, approvedCount, rejectedCount
//   - dailyActivity: array of { date, total, approved, rejected, pending }
//   - byCategory: { general: { total, approved, rejected, pending }, equipment: {...} }
//   - byForm: array of { id, code, title, category, total, approved, rejected, pending }
//
// Uses the same caching mechanism as /api/submissions for fast repeat loads.
// ============================================================================

const express = require('express');
const ExcelJS = require('exceljs');
const onedrive = require('../lib/onedrive');
const pendingStore = require('../lib/pending-store');
const { ALL_FORMS } = require('../lib/forms-config');
const { requireAdmin } = require('../lib/auth-middleware');

const router = express.Router();
router.use(requireAdmin);

// In-memory cache: { [formId]: { rows: [...], expiresAt: <ms> } }
const CACHE = {};
const CACHE_TTL_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Read all submissions for one form from its master log
// ---------------------------------------------------------------------------

async function loadFormRows(form) {
  const cached = CACHE[form.id];
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const logPath = `${form.folder}/_MasterLog.xlsx`;
  let buffer;
  try {
    buffer = await onedrive.downloadFile(logPath);
  } catch (err) {
    if (err.statusCode === 404 || /404/.test(err.message)) {
      CACHE[form.id] = { rows: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
    }
    console.error(`[admin-dashboard] failed to read ${logPath}:`, err.message);
    return [];
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Submissions') || wb.worksheets[0];
  if (!ws) return [];

  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });

  const idxOf = (name) => headers.findIndex(h => h === name);
  const colSubmittedAt = idxOf('Submitted At');
  const colStatus = idxOf('Status');

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
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
    const submittedAt = cellVal(colSubmittedAt);
    if (!submittedAt) return;
    rows.push({
      formId: form.id,
      submittedAt,
      // Treat empty status as Approved (legacy rows from before the workflow)
      status: (cellVal(colStatus) || 'Approved').toLowerCase(),
    });
  });

  CACHE[form.id] = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard
// ---------------------------------------------------------------------------

router.get('/dashboard', async (req, res) => {
  try {
    let { startDate, endDate } = req.query;

    // Default: last 30 days if not provided
    if (!endDate) {
      const today = new Date();
      endDate = formatYmd(today);
    }
    if (!startDate) {
      const start = new Date(`${endDate}T00:00:00`);
      start.setDate(start.getDate() - 29);
      startDate = formatYmd(start);
    }

    // Validate format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD' });
    }

    // Load master logs + pending submissions in parallel
    const [allMasterRows, pendingRaw] = await Promise.all([
      Promise.all(ALL_FORMS.map(loadFormRows)).then(arrs => arrs.flat()),
      pendingStore.listAllPending().catch(err => {
        console.warn('[admin-dashboard] pending list failed:', err.message);
        return [];
      }),
    ]);

    // Convert pending into the same shape
    const pendingRows = pendingRaw.map(p => ({
      formId: p.formId,
      submittedAt: normalizeDate(p.data.submittedAt),
      status: 'pending',
    }));

    // Filter by date range (use just YYYY-MM-DD prefix)
    const inRange = (dateStr) => {
      const d = String(dateStr || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    };
    const allRows = [...allMasterRows, ...pendingRows].filter(r => inRange(r.submittedAt));

    // ----- Top KPIs -----
    const total = allRows.length;
    const approved = allRows.filter(r => r.status === 'approved').length;
    const rejected = allRows.filter(r => r.status === 'rejected').length;
    const pending = allRows.filter(r => r.status === 'pending').length;

    // Today / this week (relative to today, regardless of selected range)
    const todayStr = formatYmd(new Date());
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = formatYmd(sevenDaysAgo);
    const all = [...allMasterRows, ...pendingRows];
    const todayCount = all.filter(r => String(r.submittedAt || '').slice(0, 10) === todayStr).length;
    const last7Count = all.filter(r => {
      const d = String(r.submittedAt || '').slice(0, 10);
      return d >= sevenDaysAgoStr && d <= todayStr;
    }).length;
    const totalPending = all.filter(r => r.status === 'pending').length;

    // ----- Daily activity within range -----
    const dayBuckets = {};
    for (const r of allRows) {
      const d = String(r.submittedAt || '').slice(0, 10);
      if (!d) continue;
      if (!dayBuckets[d]) dayBuckets[d] = { date: d, total: 0, approved: 0, rejected: 0, pending: 0 };
      dayBuckets[d].total += 1;
      dayBuckets[d][r.status] = (dayBuckets[d][r.status] || 0) + 1;
    }
    // Fill in missing dates with zeros so the chart has a continuous x-axis
    const dailyActivity = enumerateDays(startDate, endDate).map(d => dayBuckets[d] || { date: d, total: 0, approved: 0, rejected: 0, pending: 0 });

    // ----- By category -----
    const formMap = Object.fromEntries(ALL_FORMS.map(f => [f.id, f]));
    const byCategory = {
      general:   { total: 0, approved: 0, rejected: 0, pending: 0, label: 'General EHS Records' },
      equipment: { total: 0, approved: 0, rejected: 0, pending: 0, label: 'Equipment Inspections' },
    };
    for (const r of allRows) {
      const f = formMap[r.formId];
      if (!f) continue;
      const cat = byCategory[f.category];
      if (!cat) continue;
      cat.total += 1;
      cat[r.status] = (cat[r.status] || 0) + 1;
    }

    // ----- By form -----
    const byForm = ALL_FORMS.map(f => {
      const formRows = allRows.filter(r => r.formId === f.id);
      return {
        id: f.id,
        code: f.code,
        title: f.title,
        category: f.category,
        total: formRows.length,
        approved: formRows.filter(r => r.status === 'approved').length,
        rejected: formRows.filter(r => r.status === 'rejected').length,
        pending: formRows.filter(r => r.status === 'pending').length,
      };
    });

    res.json({
      range: { startDate, endDate, days: enumerateDays(startDate, endDate).length },
      kpi: {
        today: todayCount,
        last7Days: last7Count,
        totalInRange: total,
        pendingNow: totalPending,
      },
      breakdown: {
        total,
        approved,
        rejected,
        pending,
      },
      dailyActivity,
      byCategory,
      byForm,
    });
  } catch (err) {
    console.error('[GET /api/admin/dashboard]', err);
    res.status(500).json({ error: err.message || 'Failed to load dashboard' });
  }
});

// Cache-busting endpoint
router.post('/dashboard/cache-clear', (req, res) => {
  for (const k of Object.keys(CACHE)) delete CACHE[k];
  res.json({ ok: true });
});

// Programmatic cache invalidation (called by approvals.js after approve/reject)
function clearCache() {
  for (const k of Object.keys(CACHE)) delete CACHE[k];
}
router.clearCache = clearCache;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatYmd(date) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + istOffsetMs);
  return ist.toISOString().slice(0, 10);
}

// Normalize an ISO date or IST string to "YYYY-MM-DD HH:MM:SS"
function normalizeDate(value) {
  if (!value) return '';
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2} /.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try {
      return new Date(str).toLocaleString('sv-SE', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      });
    } catch { return str; }
  }
  return str;
}

function enumerateDays(start, end) {
  const result = [];
  const d = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (d <= endDate) {
    result.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return result;
}

module.exports = router;
