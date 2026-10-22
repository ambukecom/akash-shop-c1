// =====================================================================
//  AKASH SHOP C1 · Inventory Tracker — app logic
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

/* ---------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  store: '<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
  warehouse: '<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8M7 17h10"/>',
  layers: '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M2 13l10 5 10-5"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2m0 8v2"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  shelf: '<path d="M4 4v16M20 4v16M4 10h16M4 16h16"/>',
};
const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const PALETTE = ['#0b84d6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316', '#0ea5e9', '#a855f7'];
const UNBRANDED = { id: 'none', name: 'Unbranded', color: '#94a3b8' };
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#94a3b8');

const fmtNum = (n) => new Intl.NumberFormat(CONFIG.LOCALE).format(n || 0);
const fmtMoney = (n) => new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n || 0);
const fmtMoneyShort = (n) => new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY, notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const currencySymbol = () => new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY }).formatToParts(0).find((p) => p.type === 'currency')?.value || '';

const total = (i) => i.shop_qty + i.warehouse_qty;
const value = (i) => total(i) * Number(i.unit_price || 0);
const needsShelf = (i) => i.shop_qty === 0 && i.warehouse_qty > 0 && !i.flagged_out_of_stock;
function statusOf(i) {
  if (i.flagged_out_of_stock || total(i) === 0) return 'out';
  if (total(i) <= i.low_stock_threshold) return 'low';
  return 'ok';
}
const STATUS = { ok: ['In stock', 'ok'], low: ['Low stock', 'warn'], out: ['Out of stock', 'bad'] };
const STATUS_RANK = { out: 0, low: 1, ok: 2 };

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short' });
}
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function niceError(e) {
  const m = e?.message || String(e);
  if (e?.code === '23505') {
    if (m.includes('sku')) return 'That SKU is already used by another item.';
    if (m.includes('brands')) return 'A brand with that name already exists.';
    return 'That already exists.';
  }
  if (e?.code === 'PGRST301' || /JWT/i.test(m)) return 'Your session has expired. Please sign in again.';
  if (/row-level security|permission denied|Not authorised/i.test(m)) return 'This account is not allowed to make that change.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Check the internet and try again.';
  return m;
}

/* ---------------------------------------------------------------------
   State
--------------------------------------------------------------------- */
const freshFilters = () => ({ q: '', brand: 'all', status: 'all', sort: 'attention' });
const state = {
  user: null,
  brands: [],
  items: [],
  movements: [],
  charts: [],
  scope: null,        // null = dashboard (all items), otherwise brand id or 'none'
  lastRoute: '',
  loadedAt: 0,
  filters: freshFilters(),
  pendingMsg: null,
};
const brandOf = (id) => state.brands.find((b) => b.id === id);
const itemsFor = (bid) => (bid === 'none' ? state.items.filter((i) => !i.brand_id) : state.items.filter((i) => i.brand_id === bid));

function summarize(items) {
  const s = { count: items.length, shop: 0, wh: 0, units: 0, value: 0, ok: 0, low: 0, out: 0, shelf: 0 };
  for (const i of items) {
    s.shop += i.shop_qty;
    s.wh += i.warehouse_qty;
    s.value += value(i);
    s[statusOf(i)]++;
    if (needsShelf(i)) s.shelf++;
  }
  s.units = s.shop + s.wh;
  return s;
}

/* ---------------------------------------------------------------------
   Supabase + auth
--------------------------------------------------------------------- */
const configured = CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT')
  && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-');

let sb = null;
let recovery = location.hash.includes('type=recovery');

if (!configured) {
  $('#boot').innerHTML = `<div class="setup-note"><h2>Almost there</h2>
    <p>Open <code>js/config.js</code> and paste in your Supabase project URL and anon key, then reload this page. The README explains where to find them.</p></div>`;
} else {
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      storage: CONFIG.REMEMBER_LOGIN ? window.localStorage : window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  sb.auth.onAuthStateChange((event, session) => {
    // Defer so we never call Supabase from inside its own callback.
    setTimeout(() => handleAuth(event, session), 0);
  });
  bindAuthForms();
  bindAppChrome();
  startIdleWatch();
}

function handleAuth(event, session) {
  if (event === 'PASSWORD_RECOVERY') { recovery = true; showAuth('newpw'); return; }
  if (recovery) { if (session) showAuth('newpw'); return; }
  if (!session) {
    teardown();
    const msg = state.pendingMsg; state.pendingMsg = null;
    showAuth('login', msg?.[0] || '', msg?.[1] || 'info');
    return;
  }
  if (!state.user || state.user.id !== session.user.id) enterApp(session);
}

function showAuth(which = 'login', msg = '', type = 'info') {
  $('#boot').hidden = true;
  $('#app-view').hidden = true;
  $('#auth-view').hidden = false;
  for (const f of ['login', 'reset', 'newpw']) $(`#${f}-form`).hidden = f !== which;
  setAuthMsg(msg, type);
  $(`#${which}-form input`)?.focus();
}
function setAuthMsg(msg, type = 'info') {
  const el = $('#auth-msg');
  el.textContent = msg;
  el.className = `auth-msg ${type}`;
  el.hidden = !msg;
}

function bindAuthForms() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.classList.add('loading'); setAuthMsg('');
    const { error } = await sb.auth.signInWithPassword({ email: fd.get('email').trim(), password: fd.get('password') });
    btn.disabled = false; btn.classList.remove('loading');
    if (error) setAuthMsg(/invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message, 'error');
    else e.target.reset();
  });

  $('#forgot-btn').addEventListener('click', () => showAuth('reset'));
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => showAuth('login')));

  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = new FormData(e.target).get('email').trim();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    btn.disabled = false;
    if (error) setAuthMsg(error.message, 'error');
    else setAuthMsg('If that email is registered, a reset link is on its way. Check the inbox.', 'ok');
  });

  $('#newpw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('confirm')) return setAuthMsg('The two passwords do not match.', 'error');
    const { error } = await sb.auth.updateUser({ password: fd.get('password') });
    if (error) return setAuthMsg(error.message, 'error');
    recovery = false;
    e.target.reset();
    history.replaceState(null, '', location.pathname + '#/dashboard');
    const { data } = await sb.auth.getSession();
    if (data.session) enterApp(data.session);
    else showAuth('login', 'Password updated. Please sign in.', 'ok');
  });
}

async function enterApp(session) {
  state.user = session.user;
  const { data, error } = await sb.from('staff').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) {
    state.pendingMsg = ['This account is not authorised for AKASH SHOP C1. Ask the owner to add it as staff.', 'error'];
    state.user = null;
    await sb.auth.signOut();
    return;
  }
  $('#user-email').textContent = session.user.email || '';
  $('#boot').hidden = true;
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;
  $('#main').innerHTML = '<div class="boot" style="min-height:40vh"><div class="spinner"></div></div>';
  if (!/^#\//.test(location.hash)) history.replaceState(null, '', location.pathname + '#/dashboard');
  if (await loadAll()) render();
}

function teardown() {
  state.user = null;
  state.brands = []; state.items = []; state.movements = [];
  state.lastRoute = '';
  destroyCharts();
  $('#main').innerHTML = '';
  $('#tabs').innerHTML = '';
  if ($('#modal').open) $('#modal').close();
}

async function signOut(msg) {
  if (msg) state.pendingMsg = [msg, 'info'];
  await sb.auth.signOut();
}

let lastActive = Date.now();
function startIdleWatch() {
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach((ev) =>
    window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  setInterval(() => {
    const limit = Number(CONFIG.IDLE_LOGOUT_MINUTES) || 0;
    if (state.user && limit > 0 && Date.now() - lastActive > limit * 60000) {
      signOut('You were signed out after a period of inactivity.');
    }
  }, 30000);
}

/* ---------------------------------------------------------------------
   Data
--------------------------------------------------------------------- */
async function loadAll() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [b, i, m] = await Promise.all([
    sb.from('brands').select('*').order('name'),
    sb.from('items').select('*').order('name'),
    sb.from('stock_movements').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
  ]);
  const err = b.error || i.error || m.error;
  if (err) { toast(niceError(err), 'error'); return false; }
  state.brands = b.data || [];
  state.items = (i.data || []).map((x) => ({ ...x, unit_price: Number(x.unit_price) }));
  state.movements = m.data || [];
  state.loadedAt = Date.now();
  return true;
}
async function refresh() { if (await loadAll()) render(); }

/* ---------------------------------------------------------------------
   App chrome + routing
--------------------------------------------------------------------- */
function bindAppChrome() {
  $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

  $('#refresh-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('spinning');
    await refresh();
    btn.classList.remove('spinning');
    toast('Up to date');
  });
  $('#signout-btn').addEventListener('click', () => signOut('You have signed out.'));

  window.addEventListener('hashchange', () => { if (state.user) render(); });
  window.addEventListener('focus', async () => {
    if (state.user && Date.now() - state.loadedAt > 60000 && !$('#modal').open) await refresh();
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !state.user) return;
    const { act, id } = el.dataset;
    const item = id ? state.items.find((i) => i.id === id) : null;
    switch (act) {
      case 'new-brand': brandModal(); break;
      case 'edit-brand': brandModal(brandOf(id)); break;
      case 'delete-brand': deleteBrand(brandOf(id)); break;
      case 'add-item': itemModal(null, el.dataset.brand || state.scope); break;
      case 'edit-item': if (item) itemModal(item); break;
      case 'adjust': if (item) adjustModal(item); break;
      case 'flag': if (item) toggleFlag(item); break;
      case 'delete-item': if (item) deleteItem(item); break;
      case 'export': exportCSV(); break;
      case 'filter-status':
        state.filters.status = el.dataset.status;
        syncToolbar(); renderTable();
        $('#inventory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
  });
}

function currentRoute() {
  const m = location.hash.match(/^#\/brand\/(.+)$/);
  return m ? { view: 'brand', id: decodeURIComponent(m[1]) } : { view: 'dashboard' };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  const r = currentRoute();
  if (r.view === 'brand' && r.id !== 'none' && !brandOf(r.id)) { go('#/dashboard'); return; }
  const key = r.view + (r.id || '');
  if (key !== state.lastRoute) { state.filters = freshFilters(); state.lastRoute = key; window.scrollTo(0, 0); }
  destroyCharts();
  renderTabs();
  if (r.view === 'brand') renderBrand(r.id); else renderDashboard();
}

function renderTabs() {
  const r = currentRoute();
  const tab = (href, label, active, lead, badge = 0) =>
    `<a href="${href}" class="tab${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${lead}<span>${esc(label)}</span>${badge ? `<span class="tab-badge" title="${badge} need attention">${badge}</span>` : ''}</a>`;
  let html = tab('#/dashboard', 'Dashboard', r.view === 'dashboard', icon('grid'));
  for (const b of state.brands) {
    const s = summarize(itemsFor(b.id));
    html += tab(`#/brand/${encodeURIComponent(b.id)}`, b.name, r.view === 'brand' && r.id === b.id, `<span class="dot" style="--c:${safeColor(b.color)}"></span>`, s.low + s.out);
  }
  if (itemsFor('none').length) {
    const s = summarize(itemsFor('none'));
    html += tab('#/brand/none', UNBRANDED.name, r.view === 'brand' && r.id === 'none', `<span class="dot" style="--c:${UNBRANDED.color}"></span>`, s.low + s.out);
  }
  html += `<button class="tab tab-add" data-act="new-brand">${icon('plus')}<span>New brand tab</span></button>`;
  $('#tabs').innerHTML = `<div class="tabs-inner">${html}</div>`;
  $('#tabs .tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ---------------------------------------------------------------------
   Building blocks
--------------------------------------------------------------------- */
function kpi(label, val, ic, tone = '', sub = '') {
  return `<div class="kpi ${tone}"><div class="kpi-ico">${icon(ic)}</div><div style="min-width:0">
    <p class="kpi-label">${label}</p><p class="kpi-value" title="${esc(val)}">${val}</p>${sub ? `<p class="kpi-sub">${sub}</p>` : ''}</div></div>`;
}

function alertBanner(s) {
  if (!s.out && !s.low && !s.shelf) return '';
  const parts = [];
  if (s.out) parts.push(`<button class="pill-btn bad" data-act="filter-status" data-status="out">${s.out} out of stock</button>`);
  if (s.low) parts.push(`<button class="pill-btn warn" data-act="filter-status" data-status="low">${s.low} running low</button>`);
  if (s.shelf) parts.push(`<button class="pill-btn sky" data-act="filter-status" data-status="shelf">${s.shelf} shelf refill from warehouse</button>`);
  return `<div class="alert-banner">${icon('alert')}<span>Needs attention:</span>${parts.join('')}</div>`;
}

function attentionList(items, kind) {
  if (!items.length) {
    return `<div class="empty-mini">${icon('check')}<span>${kind === 'low' ? 'Nothing is running low' : 'Nothing is out of stock'}</span></div>`;
  }
  const rows = items.slice(0, 7).map((i) => {
    const b = brandOf(i.brand_id) || UNBRANDED;
    const detail = kind === 'low'
      ? `${fmtNum(total(i))} left · alert at ${fmtNum(i.low_stock_threshold)}`
      : (i.flagged_out_of_stock ? (total(i) > 0 ? `Flagged · ${fmtNum(total(i))} on record` : 'Flagged · none left') : 'No units left');
    return `<li><span class="dot" style="--c:${safeColor(b.color)}"></span>
      <div class="alist-main"><strong>${esc(i.name)}</strong><small>${esc(b.name)} · ${detail}</small></div>
      <div class="alist-act">${kind === 'out' && i.flagged_out_of_stock ? `<button class="btn btn-sm btn-ghost" data-act="flag" data-id="${i.id}">Unflag</button>` : ''}
      <button class="btn btn-sm btn-soft" data-act="adjust" data-id="${i.id}">Restock</button></div></li>`;
  }).join('');
  const more = items.length > 7 ? `<button class="link more" data-act="filter-status" data-status="${kind}">View all ${items.length} →</button>` : '';
  return `<ul class="alist">${rows}</ul>${more}`;
}

function activityList(movements) {
  if (!movements.length) return `<div class="empty-mini">${icon('activity')}<span>No stock changes in the last 30 days</span></div>`;
  return `<ul class="feed">${movements.slice(0, 8).map((m) => {
    const isMove = (m.reason || '').startsWith('Transfer');
    const cls = isMove ? 'move' : m.change > 0 ? 'in' : 'out';
    return `<li><span class="feed-chip ${cls}">${m.change > 0 ? '+' : '−'}${fmtNum(Math.abs(m.change))}</span>
      <div><strong>${esc(m.item_name)}</strong><small>${m.location === 'shop' ? 'Shop' : 'Warehouse'} · ${esc(m.reason || '')}</small></div>
      <time datetime="${esc(m.created_at)}">${timeAgo(m.created_at)}</time></li>`;
  }).join('')}</ul>`;
}

/* ---------------------------------------------------------------------
   Dashboard
--------------------------------------------------------------------- */
function renderDashboard() {
  state.scope = null;
  const s = summarize(state.items);
  const today = new Date().toLocaleDateString(CONFIG.LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const week = Date.now() - 7 * 864e5;
  const moves7 = state.movements.filter((m) => new Date(m.created_at).getTime() >= week && !(m.reason || '').startsWith('Transfer'));
  const sold7 = moves7.filter((m) => m.change < 0).reduce((a, m) => a - m.change, 0);
  const pct = (a) => (s.units ? Math.round((a / s.units) * 100) : 0);

  const head = `<section class="page-head">
      <div><p class="eyebrow">${esc(today)}</p><h1>Dashboard</h1></div>
      <div class="head-actions">
        <button class="btn btn-ghost" data-act="new-brand">${icon('tag')}New brand tab</button>
        <button class="btn btn-primary" data-act="add-item">${icon('plus')}Add item</button>
      </div></section>`;

  if (!state.items.length) {
    $('#main').innerHTML = head + `<section class="welcome">
        <h2>Welcome to the AKASH SHOP C1 inventory</h2>
        <p>Create a tab for each brand you stock, then add items with their shop and warehouse quantities. Every item you add here also appears in its brand's tab automatically.</p>
        <div class="steps">
          <button class="btn btn-accent" data-act="new-brand">${icon('tag')}1 · Create a brand tab</button>
          <button class="btn btn-glass" data-act="add-item">${icon('plus')}2 · Add your first item</button>
        </div></section>`;
    return;
  }

  const groups = state.brands.map((b) => ({ b, items: itemsFor(b.id) }));
  if (itemsFor('none').length) groups.push({ b: UNBRANDED, items: itemsFor('none') });
  const brandChartH = Math.max(240, groups.length * 34 + 70);

  const lowItems = state.items.filter((i) => statusOf(i) === 'low').sort((a, b) => total(a) - total(b));
  const outItems = state.items.filter((i) => statusOf(i) === 'out');

  $('#main').innerHTML = head + alertBanner(s) + `
    <section class="kpis">
      ${kpi('Products', fmtNum(s.count), 'box', '', `${state.brands.length} brand tab${state.brands.length === 1 ? '' : 's'}`)}
      ${kpi('Units in shop', fmtNum(s.shop), 'store', '', `${pct(s.shop)}% of all stock`)}
      ${kpi('Units in warehouse', fmtNum(s.wh), 'warehouse', 'navy', `${pct(s.wh)}% of all stock`)}
      ${kpi('Stock value', fmtMoney(s.value), 'coin', 'ok', `${fmtNum(s.units)} units in total`)}
      ${kpi('Low stock', fmtNum(s.low), 'alert', s.low ? 'warn' : 'ok', 'At or below alert level')}
      ${kpi('Out of stock', fmtNum(s.out), 'flag', s.out ? 'bad' : 'ok', 'Includes flagged items')}
      ${kpi('Shelf refills', fmtNum(s.shelf), 'shelf', '', 'Empty in shop, held in warehouse')}
      ${kpi('Units out · 7 days', fmtNum(sold7), 'activity', '', `${fmtNum(moves7.length)} stock changes this week`)}
    </section>

    <section class="grid">
      <article class="card span-2">
        <header class="card-head"><div><h3>Stock by brand</h3><p>Units in the shop and in the warehouse</p></div></header>
        <div class="chart-box" style="height:${brandChartH}px"><canvas id="ch-brand"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Stock health</h3><p>Products by status</p></div></header>
        <div class="chart-box"><canvas id="ch-health"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Where the stock is</h3><p>Shop vs warehouse units</p></div></header>
        <div class="chart-box"><canvas id="ch-split"></canvas></div>
      </article>
      <article class="card span-2">
        <header class="card-head"><div><h3>Stock movement</h3><p>Units in and out over the last 14 days (transfers excluded)</p></div></header>
        <div class="chart-box"><canvas id="ch-move"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Stock value by brand</h3><p>Units × unit price</p></div></header>
        <div class="chart-box"><canvas id="ch-value"></canvas></div>
      </article>
      <article class="card span-2">
        <header class="card-head"><div><h3>Top products by stock value</h3><p>Where most of the money is sitting</p></div></header>
        <div class="chart-box"><canvas id="ch-top"></canvas></div>
      </article>
    </section>

    <section class="grid">
      <article class="card">
        <header class="card-head"><div><h3>Low-stock alerts</h3><p>Reorder soon</p></div><span class="count">${lowItems.length}</span></header>
        ${attentionList(lowItems, 'low')}
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Out of stock</h3><p>Empty or flagged by you</p></div><span class="count">${outItems.length}</span></header>
        ${attentionList(outItems, 'out')}
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Recent activity</h3><p>Latest stock changes</p></div></header>
        ${activityList(state.movements)}
      </article>
    </section>

    <section class="card table-card" id="inventory">${toolbar()}<div id="table-wrap"></div></section>`;

  bindToolbar();
  renderTable();
  drawDashboardCharts(groups, s);
}

/* ---------------------------------------------------------------------
   Brand tab
--------------------------------------------------------------------- */
function renderBrand(id) {
  state.scope = id;
  const b = id === 'none' ? UNBRANDED : brandOf(id);
  const items = itemsFor(id);
  const s = summarize(items);
  const moves = state.movements.filter((m) => items.some((i) => i.id === m.item_id));

  const actions = id === 'none'
    ? `<button class="btn btn-primary" data-act="add-item" data-brand="none">${icon('plus')}Add item</button>`
    : `<button class="btn btn-ghost" data-act="edit-brand" data-id="${b.id}">${icon('edit')}Edit tab</button>
       <button class="btn btn-danger-ghost" data-act="delete-brand" data-id="${b.id}">${icon('trash')}Delete</button>
       <button class="btn btn-primary" data-act="add-item" data-brand="${b.id}">${icon('plus')}Add ${esc(b.name)} item</button>`;

  let html = `<section class="page-head">
      <div><p class="eyebrow">Brand tab</p><h1><span class="dot" style="--c:${safeColor(b.color)}"></span>${esc(b.name)}</h1></div>
      <div class="head-actions">${actions}</div></section>`;

  if (!items.length) {
    html += `<section class="card"><div class="empty">${icon('box')}<h3>No ${esc(b.name)} items yet</h3>
      <p>Items you add for this brand, here or from the dashboard, will show up in this tab.</p>
      <div class="empty-actions"><button class="btn btn-primary" data-act="add-item" data-brand="${b.id}">${icon('plus')}Add an item</button></div></div></section>`;
    $('#main').innerHTML = html;
    return;
  }

  const chartItems = items.slice().sort((a, c) => total(c) - total(a)).slice(0, 15);
  const chartH = Math.max(240, chartItems.length * 30 + 70);

  html += alertBanner(s) + `
    <section class="kpis kpis-6">
      ${kpi('Products', fmtNum(s.count), 'box')}
      ${kpi('In shop', fmtNum(s.shop), 'store')}
      ${kpi('In warehouse', fmtNum(s.wh), 'warehouse', 'navy')}
      ${kpi('Stock value', fmtMoney(s.value), 'coin', 'ok')}
      ${kpi('Low stock', fmtNum(s.low), 'alert', s.low ? 'warn' : 'ok')}
      ${kpi('Out of stock', fmtNum(s.out), 'flag', s.out ? 'bad' : 'ok')}
    </section>
    <section class="grid">
      <article class="card span-2">
        <header class="card-head"><div><h3>Stock per item</h3><p>${items.length > 15 ? 'Top 15 items by units · ' : ''}shop and warehouse</p></div></header>
        <div class="chart-box" style="height:${chartH}px"><canvas id="ch-items"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Stock health</h3><p>Products by status</p></div></header>
        <div class="chart-box sm"><canvas id="ch-health"></canvas></div>
        <header class="card-head" style="margin-top:14px"><div><h3>Recent activity</h3></div></header>
        ${activityList(moves.slice(0, 5))}
      </article>
    </section>
    <section class="card table-card" id="inventory">${toolbar()}<div id="table-wrap"></div></section>`;

  $('#main').innerHTML = html;
  bindToolbar();
  renderTable();
  drawBrandCharts(chartItems, s);
}

/* ---------------------------------------------------------------------
   Inventory table
--------------------------------------------------------------------- */
function toolbar() {
  const f = state.filters;
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const brandSelect = state.scope ? '' : `<select id="f-brand" aria-label="Brand">${opt('all', 'All brands', f.brand)}${state.brands.map((b) => opt(b.id, b.name, f.brand)).join('')}${itemsFor('none').length ? opt('none', 'Unbranded', f.brand) : ''}</select>`;
  return `<div class="toolbar">
    <div class="tb-title"><h3>${state.scope ? 'Items' : 'All inventory'}</h3><span class="muted" id="row-count"></span></div>
    <div class="tb-controls">
      <label class="search">${icon('search')}<input id="f-q" type="search" placeholder="Search name, SKU or category" value="${esc(f.q)}" aria-label="Search items"></label>
      ${brandSelect}
      <select id="f-status" aria-label="Status">${opt('all', 'Any status', f.status)}${opt('ok', 'In stock', f.status)}${opt('low', 'Low stock', f.status)}${opt('out', 'Out of stock', f.status)}${opt('shelf', 'Shelf refill needed', f.status)}</select>
      <select id="f-sort" aria-label="Sort">${opt('attention', 'Needs attention first', f.sort)}${opt('name', 'Name A–Z', f.sort)}${opt('low', 'Fewest units', f.sort)}${opt('high', 'Most units', f.sort)}${opt('value', 'Highest value', f.sort)}${opt('recent', 'Recently updated', f.sort)}</select>
    </div></div>`;
}
function bindToolbar() {
  $('#f-q')?.addEventListener('input', (e) => { state.filters.q = e.target.value; renderTable(); });
  for (const k of ['brand', 'status', 'sort']) {
    $(`#f-${k}`)?.addEventListener('change', (e) => { state.filters[k] = e.target.value; renderTable(); });
  }
}
function syncToolbar() {
  for (const k of ['brand', 'status', 'sort']) { const el = $(`#f-${k}`); if (el) el.value = state.filters[k]; }
}

const SORTERS = {
  attention: (a, b) => STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || total(a) - total(b) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  low: (a, b) => total(a) - total(b),
  high: (a, b) => total(b) - total(a),
  value: (a, b) => value(b) - value(a),
  recent: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)),
};

function renderTable() {
  const wrap = $('#table-wrap');
  if (!wrap) return;
  const f = state.filters;
  const scope = state.scope;
  let rows = scope ? itemsFor(scope) : state.items.slice();
  if (!scope && f.brand !== 'all') rows = rows.filter((i) => (f.brand === 'none' ? !i.brand_id : i.brand_id === f.brand));
  if (f.status === 'shelf') rows = rows.filter(needsShelf);
  else if (f.status !== 'all') rows = rows.filter((i) => statusOf(i) === f.status);
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    rows = rows.filter((i) => [i.name, i.sku, i.category, brandOf(i.brand_id)?.name].some((v) => v && v.toLowerCase().includes(q)));
  }
  rows.sort(SORTERS[f.sort] || SORTERS.name);

  const all = scope ? itemsFor(scope).length : state.items.length;
  $('#row-count').textContent = rows.length === all ? `${all} item${all === 1 ? '' : 's'}` : `${rows.length} of ${all}`;

  if (!rows.length) {
    wrap.innerHTML = `<div class="empty">${icon('search')}<h3>No items match</h3><p>Try a different search or filter.</p></div>`;
    return;
  }

  wrap.innerHTML = `<div class="table-scroll"><table class="inv">
    <thead><tr>
      <th>Item</th>${scope ? '' : '<th>Brand</th>'}
      <th class="num">Shop</th><th class="num">Warehouse</th><th class="num">Total</th>
      <th class="num">Alert at</th><th class="num">Price</th><th class="num">Value</th>
      <th>Status</th><th class="num"><span class="sr-only">Actions</span></th>
    </tr></thead>
    <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
}

function rowHtml(i) {
  const st = statusOf(i);
  const b = brandOf(i.brand_id) || UNBRANDED;
  const t = total(i);
  const shopPct = t ? Math.round((i.shop_qty / t) * 100) : 0;
  const meta = [i.sku, i.category].filter(Boolean).map(esc).join(' · ');
  const [label, tone] = STATUS[st];
  const badges = [`<span class="badge ${tone}">${i.flagged_out_of_stock ? 'Flagged out' : label}</span>`];
  if (needsShelf(i)) badges.push('<span class="badge sky">Refill shelf</span>');
  return `<tr class="row-${st}">
    <td><div class="item-cell"><strong>${esc(i.name)}</strong>${meta ? `<small>${meta}</small>` : ''}</div></td>
    ${state.scope ? '' : `<td><span class="brand-chip"><span class="dot" style="--c:${safeColor(b.color)}"></span>${esc(b.name)}</span></td>`}
    <td class="num ${i.shop_qty === 0 ? 'qty-zero' : ''}">${fmtNum(i.shop_qty)}</td>
    <td class="num ${i.warehouse_qty === 0 ? 'qty-zero' : ''}">${fmtNum(i.warehouse_qty)}</td>
    <td class="num"><div class="split"><span class="strong">${fmtNum(t)}</span><span class="split-bar" title="${shopPct}% in shop"><i style="width:${shopPct}%"></i></span></div></td>
    <td class="num muted">${fmtNum(i.low_stock_threshold)}</td>
    <td class="num">${fmtMoney(i.unit_price)}</td>
    <td class="num">${fmtMoney(value(i))}</td>
    <td><div class="badges">${badges.join('')}</div></td>
    <td class="actions">
      <button class="icon-btn" data-act="adjust" data-id="${i.id}" title="Adjust stock">${icon('swap')}</button>
      <button class="icon-btn${i.flagged_out_of_stock ? ' on' : ''}" data-act="flag" data-id="${i.id}" title="${i.flagged_out_of_stock ? 'Remove out-of-stock flag' : 'Flag as out of stock'}">${icon('flag')}</button>
      <button class="icon-btn" data-act="edit-item" data-id="${i.id}" title="Edit item">${icon('edit')}</button>
    </td></tr>`;
}

/* ---------------------------------------------------------------------
   Charts
--------------------------------------------------------------------- */
function destroyCharts() { state.charts.forEach((c) => c.destroy()); state.charts = []; }
function mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  state.charts.push(new Chart(el, cfg));
}
function colors() {
  return {
    shop: cssVar('--c-shop'), wh: cssVar('--c-wh'), ok: cssVar('--ok'), warn: cssVar('--warn'), bad: cssVar('--bad'),
    ink: cssVar('--ink'), muted: cssVar('--muted'), line: cssVar('--line'), surface: cssVar('--surface'), sky: cssVar('--sky'),
  };
}
function chartDefaults(c) {
  if (!window.Chart) return;
  Chart.defaults.font.family = "Manrope, system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = c.muted;
  Chart.defaults.borderColor = c.line;
  Chart.defaults.plugins.tooltip.backgroundColor = '#0a1a33';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '700' };
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.legend.labels.padding = 14;
}
const centerText = {
  id: 'centerText',
  afterDraw(chart, _args, opts) {
    if (!opts?.text) return;
    const { ctx, chartArea: { left, right, top, bottom } } = chart;
    const x = (left + right) / 2, y = (top + bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar('--ink');
    ctx.font = '700 22px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(opts.text, x, y - 7);
    ctx.fillStyle = cssVar('--muted');
    ctx.font = '600 11px Manrope, system-ui, sans-serif';
    ctx.fillText(opts.sub || '', x, y + 13);
    ctx.restore();
  },
};
const sumBy = (items, k) => items.reduce((a, i) => a + i[k], 0);
const shorten = (s, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function doughnut(id, labels, data, bg, center, sub, fmt = fmtNum) {
  const c = colors();
  mkChart(id, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderColor: c.surface, borderWidth: 3, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'bottom' },
        centerText: { text: center, sub },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.raw)}` } },
      },
    },
    plugins: [centerText],
  });
}

function stackedBars(id, labels, shop, wh, horizontal = true) {
  const c = colors();
  const ds = (label, data, color) => ({ label, data, backgroundColor: color, borderRadius: 5, borderSkipped: false, maxBarThickness: 22 });
  mkChart(id, {
    type: 'bar',
    data: { labels, datasets: [ds('Shop', shop, c.shop), ds('Warehouse', wh, c.wh)] },
    options: {
      indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: horizontal ? c.line : 'transparent' }, ticks: { precision: 0 } },
        y: { stacked: true, grid: { color: horizontal ? 'transparent' : c.line }, ticks: { precision: 0 } },
      },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { mode: 'index', intersect: false, callbacks: { footer: (items) => `Total: ${fmtNum(items.reduce((a, x) => a + x.raw, 0))}` } },
      },
    },
  });
}

function drawDashboardCharts(groups, s) {
  const c = colors();
  chartDefaults(c);

  stackedBars('ch-brand', groups.map((g) => g.b.name), groups.map((g) => sumBy(g.items, 'shop_qty')), groups.map((g) => sumBy(g.items, 'warehouse_qty')));

  doughnut('ch-health', ['In stock', 'Low stock', 'Out of stock'], [s.ok, s.low, s.out], [c.ok, c.warn, c.bad], fmtNum(s.count), 'products');
  doughnut('ch-split', ['Shop', 'Warehouse'], [s.shop, s.wh], [c.shop, c.wh], fmtNum(s.units), 'units');

  // movement, last 14 days
  const days = 14, labels = [], ins = [], outs = [], idx = {};
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  for (let d = 0; d < days; d++) {
    const dt = new Date(start); dt.setDate(start.getDate() + d);
    idx[dayKey(dt)] = d;
    labels.push(dt.toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short' }));
    ins.push(0); outs.push(0);
  }
  for (const m of state.movements) {
    if ((m.reason || '').startsWith('Transfer')) continue;
    const k = dayKey(new Date(m.created_at));
    if (k in idx) { if (m.change > 0) ins[idx[k]] += m.change; else outs[idx[k]] -= m.change; }
  }
  mkChart('ch-move', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Units in', data: ins, backgroundColor: c.ok, borderRadius: 5, maxBarThickness: 16 },
        { label: 'Units out', data: outs, backgroundColor: c.bad, borderRadius: 5, maxBarThickness: 16 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: 'top', align: 'end' }, tooltip: { mode: 'index', intersect: false } },
    },
  });

  // value by brand
  const vGroups = groups.map((g) => ({ name: g.b.name, color: safeColor(g.b.color), v: g.items.reduce((a, i) => a + value(i), 0) })).filter((g) => g.v > 0);
  doughnut('ch-value', vGroups.map((g) => g.name), vGroups.map((g) => g.v), vGroups.map((g) => g.color), fmtMoneyShort(s.value), 'total value', fmtMoney);

  // top products by value
  const top = state.items.filter((i) => value(i) > 0).sort((a, b) => value(b) - value(a)).slice(0, 8);
  mkChart('ch-top', {
    type: 'bar',
    data: {
      labels: top.map((i) => shorten(i.name)),
      datasets: [{ label: 'Stock value', data: top.map(value), backgroundColor: top.map((i) => safeColor((brandOf(i.brand_id) || UNBRANDED).color)), borderRadius: 5, maxBarThickness: 20 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { ticks: { callback: (v) => fmtMoneyShort(v) } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${fmtMoney(ctx.raw)} · ${fmtNum(total(top[ctx.dataIndex]))} units` } } },
    },
  });
}

function drawBrandCharts(items, s) {
  const c = colors();
  chartDefaults(c);
  stackedBars('ch-items', items.map((i) => shorten(i.name, 26)), items.map((i) => i.shop_qty), items.map((i) => i.warehouse_qty));
  doughnut('ch-health', ['In stock', 'Low stock', 'Out of stock'], [s.ok, s.low, s.out], [c.ok, c.warn, c.bad], fmtNum(s.count), 'products');
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.user) render(); });

/* ---------------------------------------------------------------------
   Modals
--------------------------------------------------------------------- */
function openModal({ title, body, submitLabel = 'Save', danger = false, onSubmit, extraFooter = '' }) {
  const d = $('#modal');
  d.innerHTML = `<form class="modal-card">
    <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
    <div class="modal-body">${body}</div>
    <footer class="modal-foot">${extraFooter}<span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button></footer>
  </form>`;
  const form = d.querySelector('form');
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const ok = await onSubmit(new FormData(form), form);
      if (ok !== false && d.open) d.close();
    } catch (err) {
      toast(niceError(err), 'error');
    } finally {
      btn.disabled = false; btn.classList.remove('loading');
    }
  });
  if (!d.open) d.showModal();
  setTimeout(() => form.querySelector('.modal-body input:not([type=radio]):not([type=checkbox]), .modal-body select')?.focus(), 30);
  return form;
}

function confirmModal({ title, message, confirmLabel = 'Delete', onConfirm }) {
  openModal({ title, body: `<p class="confirm-text">${message}</p>`, submitLabel: confirmLabel, danger: true, onSubmit: onConfirm });
}

/* ----- brand ----- */
function brandModal(brand = null) {
  const used = new Set(state.brands.map((b) => b.color));
  const current = brand?.color || PALETTE.find((c) => !used.has(c)) || PALETTE[0];
  const list = PALETTE.includes(current) ? PALETTE : [current, ...PALETTE];
  openModal({
    title: brand ? `Edit “${brand.name}” tab` : 'New brand tab',
    submitLabel: brand ? 'Save changes' : 'Create tab',
    body: `
      <label class="field"><span>Brand name</span>
        <input name="name" required maxlength="60" value="${esc(brand?.name || '')}" placeholder="e.g. Coca-Cola"></label>
      <fieldset class="field"><legend>Tab colour</legend>
        <div class="swatches">${list.map((c) => `<label class="swatch" style="--c:${c}" title="${c}"><input type="radio" name="color" value="${c}"${c === current ? ' checked' : ''}><span></span></label>`).join('')}</div>
      </fieldset>`,
    onSubmit: async (fd) => {
      const payload = { name: String(fd.get('name')).trim(), color: safeColor(fd.get('color')) };
      if (!payload.name) { toast('Enter a brand name', 'error'); return false; }
      const q = brand
        ? sb.from('brands').update(payload).eq('id', brand.id).select().single()
        : sb.from('brands').insert(payload).select().single();
      const { data, error } = await q;
      if (error) { toast(niceError(error), 'error'); return false; }
      toast(brand ? 'Brand tab updated' : `Tab “${payload.name}” created`);
      await loadAll();
      go(`#/brand/${encodeURIComponent(data.id)}`);
    },
  });
}

function deleteBrand(brand) {
  if (!brand) return;
  const n = itemsFor(brand.id).length;
  confirmModal({
    title: 'Delete brand tab?',
    message: `This removes the <strong>${esc(brand.name)}</strong> tab.` + (n ? ` Its ${n} item${n === 1 ? '' : 's'} will not be deleted — they move to an “Unbranded” tab so you can reassign them.` : ''),
    confirmLabel: 'Delete tab',
    onConfirm: async () => {
      const { error } = await sb.from('brands').delete().eq('id', brand.id);
      if (error) { toast(niceError(error), 'error'); return false; }
      toast(`Tab “${brand.name}” deleted`);
      await loadAll();
      go('#/dashboard');
    },
  });
}

/* ----- item ----- */
function itemModal(item = null, presetBrand = null) {
  const isEdit = !!item;
  const defBrand = presetBrand && presetBrand !== 'none' && brandOf(presetBrand) ? presetBrand : (state.brands[0]?.id || '__new');
  const v = item || {
    name: '', sku: '', category: '', brand_id: defBrand, shop_qty: 0, warehouse_qty: 0,
    low_stock_threshold: CONFIG.DEFAULT_LOW_STOCK, unit_price: 0, flagged_out_of_stock: false, notes: '',
  };
  const selBrand = v.brand_id || (state.brands.length ? '' : '__new');
  const brandOpts = (selBrand === '' ? '<option value="" selected disabled>Choose a brand…</option>' : '')
    + state.brands.map((b) => `<option value="${b.id}"${b.id === selBrand ? ' selected' : ''}>${esc(b.name)}</option>`).join('')
    + `<option value="__new"${selBrand === '__new' ? ' selected' : ''}>+ New brand…</option>`;
  const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))].sort();
  const sym = currencySymbol();

  const form = openModal({
    title: isEdit ? 'Edit item' : 'Add item',
    submitLabel: isEdit ? 'Save changes' : 'Add item',
    extraFooter: isEdit ? `<button type="button" class="btn btn-danger-ghost" data-act="delete-item" data-id="${item.id}">${icon('trash')}Delete</button>` : '',
    body: `<div class="form-grid">
      <label class="field span-2"><span>Item name *</span><input name="name" required maxlength="120" value="${esc(v.name)}" placeholder="e.g. Coca-Cola 330ml can"></label>
      <label class="field"><span>Brand tab *</span><select name="brand_id" id="brand-select" required>${brandOpts}</select></label>
      <label class="field" id="new-brand-field"${selBrand === '__new' ? '' : ' hidden'}><span>New brand name</span><input name="new_brand" maxlength="60" placeholder="Creates a new tab"></label>
      <label class="field"><span>SKU / barcode</span><input name="sku" maxlength="64" value="${esc(v.sku || '')}"></label>
      <label class="field"><span>Category</span><input name="category" list="cat-list" maxlength="60" value="${esc(v.category || '')}" placeholder="e.g. Drinks"></label>
      <datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      <label class="field"><span>${icon('store')}Quantity in shop</span><input type="number" name="shop_qty" min="0" step="1" inputmode="numeric" required value="${v.shop_qty}"></label>
      <label class="field"><span>${icon('warehouse')}Quantity in warehouse</span><input type="number" name="warehouse_qty" min="0" step="1" inputmode="numeric" required value="${v.warehouse_qty}"></label>
      <label class="field"><span>${icon('alert')}Low-stock alert at</span><input type="number" name="low_stock_threshold" min="0" step="1" inputmode="numeric" required value="${v.low_stock_threshold}">
        <small>Alert when shop + warehouse is at or below this</small></label>
      <label class="field"><span>${icon('coin')}Unit price (${esc(sym)})</span><input type="number" name="unit_price" min="0" step="0.01" inputmode="decimal" required value="${Number(v.unit_price) || 0}"></label>
      <label class="check span-2"><input type="checkbox" name="flagged"${v.flagged_out_of_stock ? ' checked' : ''}>
        <span><strong>Flag as out of stock</strong><small>Use this when the item can't be sold even though units are on record (damaged, recalled, supplier problem). Adding stock later clears the flag.</small></span></label>
      <label class="field span-2"><span>Notes</span><textarea name="notes" rows="2" maxlength="500">${esc(v.notes || '')}</textarea></label>
    </div>`,
    onSubmit: async (fd) => {
      let brandId = fd.get('brand_id');
      if (brandId === '__new') {
        const name = String(fd.get('new_brand') || '').trim();
        if (!name) { toast('Enter a name for the new brand', 'error'); return false; }
        brandId = await ensureBrand(name);
        if (!brandId) return false;
      }
      const payload = {
        name: String(fd.get('name')).trim(),
        brand_id: brandId || null,
        sku: String(fd.get('sku') || '').trim() || null,
        category: String(fd.get('category') || '').trim() || null,
        shop_qty: parseInt(fd.get('shop_qty'), 10) || 0,
        warehouse_qty: parseInt(fd.get('warehouse_qty'), 10) || 0,
        low_stock_threshold: parseInt(fd.get('low_stock_threshold'), 10) || 0,
        unit_price: Math.max(0, Number(fd.get('unit_price')) || 0),
        flagged_out_of_stock: fd.get('flagged') === 'on',
        notes: String(fd.get('notes') || '').trim() || null,
      };
      const { error } = isEdit
        ? await sb.from('items').update(payload).eq('id', item.id)
        : await sb.from('items').insert(payload);
      if (error) { toast(niceError(error), 'error'); return false; }
      const bName = brandOf(brandId)?.name || 'Unbranded';
      toast(isEdit ? `“${payload.name}” saved` : `“${payload.name}” added to Dashboard and ${bName} tab`);
      await refresh();
    },
  });

  const sel = $('#brand-select', form);
  const nbField = $('#new-brand-field', form);
  const syncNew = () => {
    const on = sel.value === '__new';
    nbField.hidden = !on;
    nbField.querySelector('input').required = on;
  };
  sel.addEventListener('change', () => { syncNew(); if (sel.value === '__new') nbField.querySelector('input').focus(); });
  syncNew();
}

async function ensureBrand(name) {
  const existing = state.brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const used = new Set(state.brands.map((b) => b.color));
  const color = PALETTE.find((c) => !used.has(c)) || PALETTE[state.brands.length % PALETTE.length];
  const { data, error } = await sb.from('brands').insert({ name, color }).select().single();
  if (error) { toast(niceError(error), 'error'); return null; }
  state.brands.push(data);
  return data.id;
}

function deleteItem(item) {
  confirmModal({
    title: 'Delete item?',
    message: `<strong>${esc(item.name)}</strong> will be removed from the dashboard and its brand tab. Its past stock history is kept.`,
    confirmLabel: 'Delete item',
    onConfirm: async () => {
      const { error } = await sb.from('items').delete().eq('id', item.id);
      if (error) { toast(niceError(error), 'error'); return false; }
      toast(`“${item.name}” deleted`);
      await refresh();
    },
  });
}

/* ----- stock adjust ----- */
function adjustModal(item) {
  const def = needsShelf(item) ? 'to_shop' : 'in';
  const radio = (name, val, label, ic, checked) =>
    `<label><input type="radio" name="${name}" value="${val}"${checked ? ' checked' : ''}><span>${icon(ic)}${label}</span></label>`;

  const form = openModal({
    title: 'Adjust stock',
    submitLabel: 'Update stock',
    body: `
      <div class="adj-head"><strong>${esc(item.name)}</strong>
        <div class="adj-now"><span>${icon('store')}Shop <b>${fmtNum(item.shop_qty)}</b></span><span>${icon('warehouse')}Warehouse <b>${fmtNum(item.warehouse_qty)}</b></span></div></div>
      <fieldset class="field"><legend>What happened?</legend>
        <div class="seg seg-4">
          ${radio('action', 'in', 'Stock in', 'plus', def === 'in')}
          ${radio('action', 'out', 'Stock out / sold', 'activity', def === 'out')}
          ${radio('action', 'to_shop', 'Warehouse → Shop', 'store', def === 'to_shop')}
          ${radio('action', 'to_warehouse', 'Shop → Warehouse', 'warehouse', def === 'to_warehouse')}
        </div></fieldset>
      <fieldset class="field" id="loc-field"><legend>Where?</legend>
        <div class="seg">
          ${radio('location', 'shop', 'Shop', 'store', false)}
          ${radio('location', 'warehouse', 'Warehouse', 'warehouse', true)}
        </div></fieldset>
      <div class="form-grid">
        <label class="field"><span>Quantity</span><input type="number" name="qty" min="1" step="1" inputmode="numeric" required value="1"></label>
        <label class="field" id="reason-field"><span>Reason (optional)</span><input name="reason" list="reason-list" maxlength="80" placeholder="e.g. Delivery"></label>
      </div>
      <datalist id="reason-list"><option value="Delivery from supplier"></option><option value="Sold"></option><option value="Damaged"></option><option value="Customer return"></option><option value="Expired"></option><option value="Stock count correction"></option></datalist>
      <p class="adj-preview" id="adj-preview"></p>`,
    onSubmit: async (fd) => {
      const act = fd.get('action');
      const qty = parseInt(fd.get('qty'), 10);
      if (!(qty > 0)) { toast('Enter a quantity of at least 1', 'error'); return false; }
      const reason = String(fd.get('reason') || '').trim() || null;
      const res = (act === 'in' || act === 'out')
        ? await sb.rpc('adjust_stock', { p_item: item.id, p_location: fd.get('location'), p_change: act === 'in' ? qty : -qty, p_reason: reason })
        : await sb.rpc('transfer_stock', { p_item: item.id, p_qty: qty, p_direction: act });
      if (res.error) { toast(niceError(res.error), 'error'); return false; }
      toast(`Stock updated for “${item.name}”`);
      await refresh();
    },
  });

  const preview = $('#adj-preview', form);
  const submit = form.querySelector('[type=submit]');
  let lastAct = null;
  const el = form.elements;
  const update = () => {
    const act = el.namedItem('action').value;
    const transfer = act === 'to_shop' || act === 'to_warehouse';
    $('#loc-field', form).hidden = transfer;
    $('#reason-field', form).hidden = transfer;
    if (act !== lastAct && !transfer) el.namedItem('location').value = act === 'in' ? 'warehouse' : 'shop';
    lastAct = act;
    const loc = el.namedItem('location').value;
    const qty = parseInt(el.namedItem('qty').value, 10) || 0;
    let shop = item.shop_qty, wh = item.warehouse_qty;
    if (act === 'in') { if (loc === 'shop') shop += qty; else wh += qty; }
    if (act === 'out') { if (loc === 'shop') shop -= qty; else wh -= qty; }
    if (act === 'to_shop') { shop += qty; wh -= qty; }
    if (act === 'to_warehouse') { shop -= qty; wh += qty; }
    const bad = shop < 0 || wh < 0;
    preview.classList.toggle('error', bad);
    preview.textContent = bad
      ? `Not enough stock — only ${fmtNum(shop < 0 ? item.shop_qty : item.warehouse_qty)} in the ${shop < 0 ? 'shop' : 'warehouse'}.`
      : `After this: Shop ${fmtNum(shop)} · Warehouse ${fmtNum(wh)} · Total ${fmtNum(shop + wh)}` + (act === 'in' && item.flagged_out_of_stock ? ' · out-of-stock flag will be cleared' : '');
    submit.disabled = bad;
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

/* ----- flag ----- */
async function toggleFlag(item) {
  const flag = !item.flagged_out_of_stock;
  const { error } = await sb.from('items').update({ flagged_out_of_stock: flag }).eq('id', item.id);
  if (error) return toast(niceError(error), 'error');
  toast(flag ? `“${item.name}” flagged as out of stock` : `Out-of-stock flag removed from “${item.name}”`);
  await refresh();
}

/* ---------------------------------------------------------------------
   Export
--------------------------------------------------------------------- */
function exportCSV() {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Item', 'Brand', 'SKU', 'Category', 'Shop qty', 'Warehouse qty', 'Total', 'Low-stock alert at', 'Unit price', 'Stock value', 'Status', 'Flagged out of stock', 'Notes', 'Last updated'];
  const rows = state.items.slice().sort(SORTERS.name).map((i) => [
    i.name, (brandOf(i.brand_id) || UNBRANDED).name, i.sku, i.category, i.shop_qty, i.warehouse_qty, total(i),
    i.low_stock_threshold, Number(i.unit_price).toFixed(2), value(i).toFixed(2), STATUS[statusOf(i)][0],
    i.flagged_out_of_stock ? 'Yes' : 'No', i.notes, i.updated_at,
  ]);
  const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `akash-shop-c1-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${rows.length} items`);
}

/* ---------------------------------------------------------------------
   Toasts
--------------------------------------------------------------------- */
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), type === 'error' ? 5000 : 3000);
  setTimeout(() => t.remove(), type === 'error' ? 5400 : 3400);
}
