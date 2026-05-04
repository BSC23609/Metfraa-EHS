// ============================================================================
// Submissions page — fetches the user's submissions (or all, for admins),
// renders the table, handles filters, and shows PDF preview in a modal.
// ============================================================================

const FORM_ICONS = {
  toolbox: '🛠️', induction: '👷', 'ehs-audit': '🔍', incident: '⚠️', 'hse-meeting': '👥',
  'portable-grinding-machine': '⚙️', 'gas-welding-set': '🔥', 'aerial-boomlift': '🏗️',
  'air-compressor': '💨', 'arc-welding-machine': '⚡', 'cutting-machine': '✂️',
  'first-aid-box': '🏥', generator: '🔋', ladder: '🪜', 'mdb-panel': '🔌',
  'mobile-scaffolding': '🪟', 'scaffolding-cuplock': '🏗️', truck: '🚚',
  'labour-camp': '🏠', 'mobile-crane': '🏗️',
};

let me = null;
let lastResponse = null;

(async function init() {
  // Pull current user info first
  try {
    me = await fetch('/api/me').then(r => {
      if (!r.ok) throw new Error('Not authenticated');
      return r.json();
    });
  } catch {
    location.href = '/login';
    return;
  }

  document.getElementById('user-pill').innerHTML = `
    <div class="app-header__user">
      ${me.picture ? `<img src="${me.picture}" alt="">` : ''}
      <div>
        <div class="app-header__user-name">${escapeHtml(me.name)}</div>
        <div class="app-header__user-email">${escapeHtml(me.email)}</div>
      </div>
    </div>
  `;

  // Set up event listeners
  document.getElementById('apply-filters').addEventListener('click', loadSubmissions);
  document.getElementById('clear-filters').addEventListener('click', () => {
    document.getElementById('filter-form').value = '';
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';
    if (document.getElementById('filter-submitter')) {
      document.getElementById('filter-submitter').value = '';
    }
    loadSubmissions();
  });
  document.getElementById('refresh-btn').addEventListener('click', () => loadSubmissions(true));

  // PDF modal close handlers
  document.getElementById('pdf-modal-close').addEventListener('click', closePdfModal);
  document.getElementById('pdf-close-btn').addEventListener('click', closePdfModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePdfModal();
  });

  await loadSubmissions();
})();

async function loadSubmissions(forceFresh = false) {
  const list = document.getElementById('submissions-list');
  list.innerHTML = '<div class="loading">Loading submissions…</div>';

  const params = new URLSearchParams();
  const formId = document.getElementById('filter-form').value;
  const startDate = document.getElementById('filter-start').value;
  const endDate = document.getElementById('filter-end').value;
  const submitterEl = document.getElementById('filter-submitter');
  const submitter = submitterEl ? submitterEl.value : '';

  if (formId) params.set('formId', formId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (submitter) params.set('submitter', submitter);

  if (forceFresh) {
    // Tell server to drop its cache
    try { await fetch('/api/submissions/cache-clear', { method: 'POST' }); } catch {}
  }

  try {
    const data = await fetch(`/api/submissions?${params.toString()}`).then(r => {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    });
    lastResponse = data;
    renderResults(data);
  } catch (err) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-state__icon">⚠️</span>
      <div class="empty-state__title">Failed to load submissions</div>
      <div class="empty-state__hint">${escapeHtml(err.message)}</div>
    </div>`;
  }
}

function renderResults(data) {
  // Update page heading based on admin status
  const isAdmin = !!data.isAdmin;
  document.getElementById('page-title').textContent = isAdmin ? 'All Submissions' : 'My Submissions';
  document.getElementById('page-subtitle').textContent = isAdmin
    ? 'Submissions from all users. Filter by form type, date or submitter.'
    : 'Forms you have submitted. Click any row to view the report.';

  // Populate the form-type filter dropdown
  const formSel = document.getElementById('filter-form');
  if (formSel.options.length <= 1 && data.forms?.length) {
    for (const f of data.forms) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.title} (${f.code})`;
      formSel.appendChild(opt);
    }
  }

  // Show submitter filter only for admins
  const submWrap = document.getElementById('filter-submitter-wrap');
  if (isAdmin) {
    submWrap.style.display = '';
    const submSel = document.getElementById('filter-submitter');
    const currentVal = submSel.value;
    submSel.innerHTML = '<option value="">All users</option>' +
      data.submitters.map(s => `<option value="${escapeAttr(s.email)}">${escapeHtml(s.name)} — ${escapeHtml(s.email)}</option>`).join('');
    submSel.value = currentVal;
  }

  // Render table
  const list = document.getElementById('submissions-list');
  if (!data.rows.length) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-state__icon">📭</span>
      <div class="empty-state__title">No submissions yet</div>
      <div class="empty-state__hint">${isAdmin ? 'No submissions match the current filters.' : "You haven't submitted any forms yet."}</div>
      <a href="/" class="btn-submit">Submit your first form →</a>
    </div>`;
    return;
  }

  const countText = data.truncated
    ? `Showing first ${data.rows.length} of ${data.total}+ submissions`
    : `${data.total} submission${data.total === 1 ? '' : 's'}`;

  const tableHtml = `
    <div class="results-count">${countText}</div>
    <div class="subs-table-wrap">
      <table class="subs-table">
        <thead>
          <tr>
            <th>Form</th>
            <th>Identifier</th>
            ${isAdmin ? '<th>Submitted By</th>' : ''}
            <th>Submitted At</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows.map(r => rowHtml(r, isAdmin)).join('')}
        </tbody>
      </table>
    </div>
  `;
  list.innerHTML = tableHtml;

  // Wire up View buttons
  list.querySelectorAll('[data-view-pdf]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { formId, submissionId } = btn.dataset;
      const row = data.rows.find(r => r.formId === formId && r.submissionId === submissionId);
      if (row) openPdfModal(row);
    });
  });
}

function rowHtml(r, isAdmin) {
  const icon = FORM_ICONS[r.formId] || '📄';
  return `
    <tr>
      <td>
        <div class="cell-form">
          <span class="cell-form__icon">${icon}</span>
          <div>
            <div>${escapeHtml(r.formTitle)}</div>
            <div style="margin-top:3px;"><span class="cell-form__code">${escapeHtml(r.formCode)}</span></div>
          </div>
        </div>
      </td>
      <td class="cell-key">
        ${r.keyLabel ? `<div class="cell-key__label">${escapeHtml(r.keyLabel)}</div>` : ''}
        <div>${escapeHtml(r.keyValue || '—')}</div>
        <div style="font-size:10px;color:#999;margin-top:2px;">${escapeHtml(r.submissionId)}</div>
      </td>
      ${isAdmin ? `<td class="cell-submitter">
        <div class="cell-submitter__name">${escapeHtml(r.submittedByName || '—')}</div>
        <div class="cell-submitter__email">${escapeHtml(r.submittedByEmail || '')}</div>
      </td>` : ''}
      <td class="cell-date">${escapeHtml(formatDate(r.submittedAt))}</td>
      <td>
        <div class="cell-actions">
          <button type="button" class="btn-action btn-action--primary"
                  data-view-pdf data-form-id="${escapeAttr(r.formId)}" data-submission-id="${escapeAttr(r.submissionId)}">
            👁 View
          </button>
          <a class="btn-action" download
             href="/api/pdf/${encodeURIComponent(r.formId)}/${encodeURIComponent(r.submissionId)}">
            ⬇
          </a>
        </div>
      </td>
    </tr>
  `;
}

function openPdfModal(row) {
  document.getElementById('pdf-modal-code').textContent = row.formCode;
  document.getElementById('pdf-modal-title').textContent = row.formTitle;
  document.getElementById('pdf-modal-meta').textContent =
    `${row.submittedByName || ''} · ${formatDate(row.submittedAt)} · ID: ${row.submissionId}`;

  const inlineUrl = `/api/pdf/${encodeURIComponent(row.formId)}/${encodeURIComponent(row.submissionId)}?inline=1`;
  const downloadUrl = `/api/pdf/${encodeURIComponent(row.formId)}/${encodeURIComponent(row.submissionId)}`;

  document.getElementById('pdf-iframe').src = inlineUrl;
  document.getElementById('pdf-download').href = downloadUrl;

  document.getElementById('pdf-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePdfModal() {
  document.getElementById('pdf-modal').style.display = 'none';
  document.getElementById('pdf-iframe').src = 'about:blank';
  document.body.style.overflow = '';
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function formatDate(s) {
  if (!s) return '—';
  // Accept "2026-04-30 10:30:15" or "2026-04-30T10:30:15"
  const parsed = new Date(s.replace(' ', 'T'));
  if (isNaN(parsed)) return s;
  return parsed.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}
