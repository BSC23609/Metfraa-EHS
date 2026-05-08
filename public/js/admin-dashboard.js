// ============================================================================
// Admin Dashboard — fetches stats and renders KPI tiles, daily activity chart,
// category breakdown (with drill-down to forms), status breakdown.
// ============================================================================

const FORM_ICONS = {
  toolbox: '🛠️', induction: '👷', 'ehs-audit': '🔍', incident: '⚠️', 'hse-meeting': '👥',
  'permit-record': '📋',
  'portable-grinding-machine': '⚙️', 'gas-welding-set': '🔥', 'aerial-boomlift': '🏗️',
  'air-compressor': '💨', 'arc-welding-machine': '⚡', 'cutting-machine': '✂️',
  'first-aid-box': '🏥', generator: '🔋', ladder: '🪜', 'mdb-panel': '🔌',
  'mobile-scaffolding': '🪟', 'scaffolding-cuplock': '🏗️', truck: '🚚',
  'labour-camp': '🏠', 'mobile-crane': '🏗️',
};

let lastData = null;
let expandedCategory = null;

(async function init() {
  let me;
  try {
    me = await fetch('/api/me').then(r => {
      if (!r.ok) throw new Error('Not authenticated');
      return r.json();
    });
  } catch {
    location.href = '/login';
    return;
  }

  if (!me.isAdmin) {
    document.querySelector('main').innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">🔒</span>
        <div class="empty-state__title">Admin only</div>
        <div class="empty-state__hint">This dashboard is restricted to admin users.</div>
        <a href="/" class="btn-submit">Back to dashboard</a>
      </div>`;
    return;
  }

  document.getElementById('user-pill').innerHTML = `
    <div class="app-header__user">
      ${me.picture ? `<img src="${me.picture}" alt="">` : ''}
      <div>
        <div class="app-header__user-name">${escapeHtml(me.name)}</div>
        <div class="app-header__user-email">${escapeHtml(me.email)}</div>
      </div>
    </div>`;

  // Default range: last 30 days
  const today = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(today.getDate() - 29);
  document.getElementById('filter-start').value = formatYmd(thirtyAgo);
  document.getElementById('filter-end').value = formatYmd(today);

  document.getElementById('apply-range').addEventListener('click', () => loadDashboard());
  document.getElementById('refresh-btn').addEventListener('click', () => loadDashboard(true));

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days, 10);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - (days - 1));
      document.getElementById('filter-start').value = formatYmd(start);
      document.getElementById('filter-end').value = formatYmd(end);
      // Visual active state
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
      btn.classList.add('preset-btn--active');
      loadDashboard();
    });
  });

  await loadDashboard();
})();

async function loadDashboard(forceFresh = false) {
  const mount = document.getElementById('dashboard-mount');
  mount.innerHTML = '<div class="loading">Loading dashboard…</div>';

  const startDate = document.getElementById('filter-start').value;
  const endDate = document.getElementById('filter-end').value;
  if (!startDate || !endDate) {
    mount.innerHTML = '<div class="empty-state"><div class="empty-state__title">Pick a date range</div></div>';
    return;
  }
  if (startDate > endDate) {
    mount.innerHTML = '<div class="empty-state"><div class="empty-state__title">Invalid range</div><div class="empty-state__hint">Start date must be before end date.</div></div>';
    return;
  }

  if (forceFresh) {
    try { await fetch('/api/admin/dashboard/cache-clear', { method: 'POST' }); } catch {}
  }

  try {
    const data = await fetch(`/api/admin/dashboard?startDate=${startDate}&endDate=${endDate}`).then(r => {
      if (!r.ok) return r.json().then(j => Promise.reject(new Error(j.error || `HTTP ${r.status}`)));
      return r.json();
    });
    lastData = data;
    render(data);
  } catch (err) {
    mount.innerHTML = `<div class="empty-state">
      <span class="empty-state__icon">⚠️</span>
      <div class="empty-state__title">Failed to load</div>
      <div class="empty-state__hint">${escapeHtml(err.message)}</div>
    </div>`;
  }
}

function render(data) {
  document.getElementById('range-subtitle').textContent =
    `${formatDateLong(data.range.startDate)} → ${formatDateLong(data.range.endDate)}  ·  ${data.range.days} day${data.range.days === 1 ? '' : 's'}`;

  document.getElementById('dashboard-mount').innerHTML = `
    ${kpiTilesHtml(data)}
    ${dailyChartHtml(data)}
    ${statusBreakdownHtml(data)}
    ${categoryBreakdownHtml(data)}
  `;

  // Wire up category expand/collapse
  document.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.dataset.cat;
      expandedCategory = expandedCategory === cat ? null : cat;
      render(lastData);
    });
  });
}

// ----------------------------------------------------------------------------
// KPI tiles (top section)
// ----------------------------------------------------------------------------

function kpiTilesHtml(data) {
  const k = data.kpi;
  return `
    <div class="kpi-grid">
      <div class="kpi-tile kpi-tile--blue">
        <div class="kpi-tile__num">${k.today}</div>
        <div class="kpi-tile__label">Today</div>
      </div>
      <div class="kpi-tile kpi-tile--blue">
        <div class="kpi-tile__num">${k.last7Days}</div>
        <div class="kpi-tile__label">Last 7 days</div>
      </div>
      <div class="kpi-tile kpi-tile--blue">
        <div class="kpi-tile__num">${k.totalInRange}</div>
        <div class="kpi-tile__label">In selected range</div>
      </div>
      <div class="kpi-tile ${k.pendingNow > 0 ? 'kpi-tile--orange' : 'kpi-tile--grey'}">
        <div class="kpi-tile__num">${k.pendingNow}</div>
        <div class="kpi-tile__label">Pending now</div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// Daily activity chart — pure SVG, stacked bars (approved + rejected + pending)
// ----------------------------------------------------------------------------

function dailyChartHtml(data) {
  const days = data.dailyActivity;
  if (!days.length) return '';

  const maxVal = Math.max(1, ...days.map(d => d.total));
  // Round max up to a nice number for y-axis
  const ySteps = niceMax(maxVal);

  const chartH = 220;
  const chartPaddingTop = 12;
  const chartPaddingBottom = 38;
  const plotH = chartH - chartPaddingTop - chartPaddingBottom;

  // Determine bar width from number of days (responsive width via SVG viewBox)
  const barGap = 4;
  const totalBarsArea = 100; // percentage units in viewBox width minus left axis
  const leftAxisW = 8; // leave space for y-axis labels (in viewBox %)
  const barAreaPct = 100 - leftAxisW;
  const barW = (barAreaPct / days.length) - barGap / 100 * 0;

  // Generate bar SVG
  const bars = days.map((d, i) => {
    const x = leftAxisW + (barAreaPct / days.length) * i + 0.6;
    const w = (barAreaPct / days.length) - 1.2;
    const approvedH = (d.approved / ySteps) * plotH;
    const rejectedH = (d.rejected / ySteps) * plotH;
    const pendingH = (d.pending / ySteps) * plotH;

    let yCursor = chartPaddingTop + plotH;
    const segments = [];
    if (d.approved > 0) {
      yCursor -= approvedH;
      segments.push(`<rect x="${x}%" y="${yCursor}" width="${w}%" height="${approvedH}" fill="#1F8B4C"></rect>`);
    }
    if (d.rejected > 0) {
      yCursor -= rejectedH;
      segments.push(`<rect x="${x}%" y="${yCursor}" width="${w}%" height="${rejectedH}" fill="#C0392B"></rect>`);
    }
    if (d.pending > 0) {
      yCursor -= pendingH;
      segments.push(`<rect x="${x}%" y="${yCursor}" width="${w}%" height="${pendingH}" fill="#F2B93B"></rect>`);
    }

    // Total label above bar (only if bar has any value)
    const totalLabel = d.total > 0
      ? `<text x="${x + w / 2}%" y="${yCursor - 3}" text-anchor="middle" font-size="9" fill="#5A5A5A" font-weight="600">${d.total}</text>`
      : '';

    // Hover tooltip via title element
    const tooltip = `<title>${d.date}: ${d.total} total (${d.approved} approved, ${d.rejected} rejected, ${d.pending} pending)</title>`;

    // X-axis label — only every Nth day to avoid overcrowding
    const labelEveryN = Math.max(1, Math.ceil(days.length / 12));
    const showLabel = i % labelEveryN === 0 || i === days.length - 1;
    const xLabel = showLabel
      ? `<text x="${x + w / 2}%" y="${chartH - 18}" text-anchor="middle" font-size="9" fill="#777">${formatChartDate(d.date)}</text>`
      : '';

    return `<g>${segments.join('')}${totalLabel}${tooltip}${xLabel}</g>`;
  }).join('');

  // Y-axis lines + labels
  const yLines = [];
  const numYTicks = 4;
  for (let t = 0; t <= numYTicks; t++) {
    const val = (ySteps / numYTicks) * t;
    const y = chartPaddingTop + plotH - (val / ySteps) * plotH;
    yLines.push(`<line x1="${leftAxisW}%" y1="${y}" x2="100%" y2="${y}" stroke="#E5E5E5" stroke-width="1"></line>`);
    yLines.push(`<text x="${leftAxisW - 1}%" y="${y + 3}" text-anchor="end" font-size="9" fill="#999">${Math.round(val)}</text>`);
  }

  return `
    <section class="dash-section">
      <div class="dash-section__head">
        <h3>Daily Activity</h3>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#1F8B4C"></span>Approved</span>
          <span class="legend-item"><span class="legend-dot" style="background:#C0392B"></span>Rejected</span>
          <span class="legend-item"><span class="legend-dot" style="background:#F2B93B"></span>Pending</span>
        </div>
      </div>
      <div class="chart-wrap">
        <svg viewBox="0 0 100 ${chartH}" preserveAspectRatio="none" class="chart-svg">
          ${yLines.join('')}
          ${bars}
        </svg>
      </div>
    </section>
  `;
}

// ----------------------------------------------------------------------------
// Status breakdown — small horizontal pills
// ----------------------------------------------------------------------------

function statusBreakdownHtml(data) {
  const b = data.breakdown;
  const tot = Math.max(1, b.total);
  const pct = (n) => Math.round((n / tot) * 100);
  return `
    <section class="dash-section">
      <div class="dash-section__head"><h3>Status Breakdown</h3></div>
      <div class="status-grid">
        <div class="status-card status-card--approved">
          <div class="status-card__num">${b.approved}</div>
          <div class="status-card__label">Approved</div>
          <div class="status-card__pct">${pct(b.approved)}%</div>
        </div>
        <div class="status-card status-card--rejected">
          <div class="status-card__num">${b.rejected}</div>
          <div class="status-card__label">Rejected</div>
          <div class="status-card__pct">${pct(b.rejected)}%</div>
        </div>
        <div class="status-card status-card--pending">
          <div class="status-card__num">${b.pending}</div>
          <div class="status-card__label">Pending</div>
          <div class="status-card__pct">${pct(b.pending)}%</div>
        </div>
        <div class="status-card status-card--total">
          <div class="status-card__num">${b.total}</div>
          <div class="status-card__label">Total</div>
          <div class="status-card__pct">100%</div>
        </div>
      </div>
    </section>
  `;
}

// ----------------------------------------------------------------------------
// Category breakdown with drill-down to individual forms
// ----------------------------------------------------------------------------

function categoryBreakdownHtml(data) {
  const cats = ['general', 'equipment'];
  const cards = cats.map(cat => {
    const c = data.byCategory[cat];
    const isExpanded = expandedCategory === cat;
    return `
      <div class="cat-card ${isExpanded ? 'cat-card--expanded' : ''}" data-cat="${cat}">
        <div class="cat-card__head">
          <div>
            <div class="cat-card__title">${escapeHtml(c.label)}</div>
            <div class="cat-card__sub">${c.total} submission${c.total === 1 ? '' : 's'}</div>
          </div>
          <div class="cat-card__chev">${isExpanded ? '▾' : '▸'}</div>
        </div>
        <div class="cat-card__bars">
          ${miniBar(c.approved, c.total, '#1F8B4C', 'Approved')}
          ${miniBar(c.rejected, c.total, '#C0392B', 'Rejected')}
          ${miniBar(c.pending, c.total, '#F2B93B', 'Pending')}
        </div>
      </div>`;
  }).join('');

  // Drill-down rows for forms in expanded category
  const drillDown = expandedCategory
    ? formsTableHtml(data.byForm.filter(f => f.category === expandedCategory))
    : '';

  return `
    <section class="dash-section">
      <div class="dash-section__head">
        <h3>By Category</h3>
        <span class="hint">click a category to see individual forms</span>
      </div>
      <div class="cat-grid">
        ${cards}
      </div>
      ${drillDown}
    </section>
  `;
}

function miniBar(value, total, color, label) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return `
    <div class="mini-bar">
      <div class="mini-bar__label">
        <span class="legend-dot" style="background:${color}"></span>
        <span>${label}</span>
        <span class="mini-bar__val">${value}</span>
      </div>
      <div class="mini-bar__track">
        <div class="mini-bar__fill" style="width:${pct.toFixed(1)}%; background:${color};"></div>
      </div>
    </div>
  `;
}

function formsTableHtml(forms) {
  // Sort by total desc
  forms.sort((a, b) => b.total - a.total);
  return `
    <div class="forms-table-wrap">
      <table class="forms-table">
        <thead>
          <tr>
            <th>Form</th>
            <th class="num">Total</th>
            <th class="num">Approved</th>
            <th class="num">Rejected</th>
            <th class="num">Pending</th>
          </tr>
        </thead>
        <tbody>
          ${forms.map(f => `
            <tr>
              <td>
                <div class="cell-form">
                  <span class="cell-form__icon">${FORM_ICONS[f.id] || '📄'}</span>
                  <div>
                    <div>${escapeHtml(f.title)}</div>
                    <div style="margin-top:3px;"><span class="cell-form__code">${escapeHtml(f.code)}</span></div>
                  </div>
                </div>
              </td>
              <td class="num"><strong>${f.total}</strong></td>
              <td class="num" style="color:#1F8B4C;">${f.approved}</td>
              <td class="num" style="color:#C0392B;">${f.rejected || ''}</td>
              <td class="num" style="color:#8C6A00;">${f.pending || ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function niceMax(v) {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  if (v <= 20) return 20;
  if (v <= 50) return 50;
  if (v <= 100) return 100;
  // round up to nearest 50
  return Math.ceil(v / 50) * 50;
}

function formatYmd(d) {
  return d.toISOString().slice(0, 10);
}
function formatDateLong(s) {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatChartDate(s) {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
