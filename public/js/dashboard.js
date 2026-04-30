// Dashboard — renders a tile per form, grouped by category.

(async function init() {
  const [me, forms] = await Promise.all([
    fetch('/api/me').then(r => r.json()),
    fetch('/api/forms').then(r => r.json()),
  ]);

  // User pill
  document.getElementById('user-pill').innerHTML = `
    <div class="app-header__user">
      <img src="${me.picture || ''}" alt="">
      <div>
        <div class="app-header__user-name">${escapeHtml(me.name)}</div>
        <div class="app-header__user-email">${escapeHtml(me.email)}</div>
      </div>
    </div>
  `;
  if (me.isAdmin) {
    document.getElementById('admin-link').style.display = '';
  }

  // Group forms
  const general = forms.filter(f => f.category === 'general');
  const equipment = forms.filter(f => f.category === 'equipment');

  document.getElementById('general-count').textContent = `${general.length} forms`;
  document.getElementById('equipment-count').textContent = `${equipment.length} forms`;

  document.getElementById('general-grid').innerHTML = general.map(tileHtml).join('');
  document.getElementById('equipment-grid').innerHTML = equipment.map(tileHtml).join('');
})();

function tileHtml(f) {
  return `
    <a class="tile" href="/form/${f.id}">
      <div class="tile__icon">${f.icon}</div>
      <div class="tile__code">${f.code}</div>
      <h4 class="tile__title">${escapeHtml(f.title)}</h4>
      <div class="tile__cta">Open form</div>
    </a>
  `;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
