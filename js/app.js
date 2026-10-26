// =====================================================================
//  AKASH SHOP C1 · Inventory Tracker — app logic
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';
import { buildInvoicePdf, winAnsiSafe } from './pdf.js';
import { buildInventoryPdf, buildSalesReportPdf } from './reports.js';

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
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7H6.2"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.3"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.8 3.5 5.7"/>',
  userPlus: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3.1-7 7-7 1.4 0 2.7.4 3.8 1M19 14v6M16 17h6"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  minus: '<path d="M5 12h14"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  file: '<path d="M14 3H6v18h12V7l-4-4z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 17v3h16v-3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  pdf: '<path d="M14 3H6v18h12V7l-4-4z"/><path d="M14 3v4h4"/><path d="M8.5 13h1.5a1.5 1.5 0 0 1 0 3H8.5v-3zm0 3v2M13 13v5h1a2 2 0 0 0 0-5h-1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
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
  sales: [],
  customers: [],
  shop: {},
  salesError: null,
  salesFilters: { q: '', status: 'all' },
  pos: null,
  payments: [],
  tracker: null,
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
    state.pendingMsg = [error
      ? `Signed in, but the database refused the access check: ${error.message}`
      : 'This account is not authorised for AKASH SHOP C1. Ask the owner to add it as staff.', 'error'];
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
  state.sales = []; state.customers = []; state.shop = {};
  state.lastRoute = '';
  closePOS(true);
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
  const [b, i, m, s, c, st] = await Promise.all([
    sb.from('brands').select('*').order('name'),
    sb.from('items').select('*').order('name'),
    sb.from('stock_movements').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    fetchAll('sales', '*, sale_items(*), sale_payments(*)', 'created_at', false),
    sb.from('customers').select('*').order('name'),
    sb.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  const err = b.error || i.error || m.error;
  if (err) { toast(niceError(err), 'error'); return false; }
  state.brands = b.data || [];
  state.items = (i.data || []).map((x) => ({ ...x, unit_price: Number(x.unit_price) }));
  state.movements = m.data || [];
  // Sales features need supabase/sales.sql; the rest of the app works without it.
  const salesErr = s.error || c.error || st.error;
  state.salesError = salesErr ? (salesErr.message || String(salesErr)) : null;
  state.sales = s.error ? [] : (s.data || []).map(normalizeSale);
  // every payment, oldest first: sales are counted when the money is received
  state.payments = state.sales.flatMap((x) => x.payments.map((p) => ({ ...p, sale: x })))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  state.customers = c.error ? [] : (c.data || []);
  state.shop = st.data || { shop_name: 'AKASH SHOP C1', footer_note: 'Thanks For Shopping With Us' };
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
    if (state.user && Date.now() - state.loadedAt > 60000 && !$('#modal').open && !state.pos) await refresh();
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el?.dataset.act?.endsWith('-menu')) closeMenu();
    if (!el || !state.user) return;
    const { act, id } = el.dataset;
    const item = id ? state.items.find((i) => i.id === id) : null;
    const sale = id ? saleById(id) : null;
    switch (act) {
      case 'pos-open': openPOS(); break;
      case 'inv-pdf': if (sale) downloadInvoice(sale); break;
      case 'inv-share': if (sale) shareInvoice(sale); break;
      case 'inv-view': if (sale) saleModal(sale); break;
      case 'pay': if (sale) paymentModal(sale); break;
      case 'shop-settings': shopModal(); break;
      case 'customers': customersModal(); break;
      case 'sales-status':
        state.salesFilters.status = el.dataset.status;
        { const s = $('#s-status'); if (s) s.value = el.dataset.status; }
        renderSalesTable();
        break;
      case 'new-brand': brandModal(); break;
      case 'edit-brand': brandModal(brandOf(id)); break;
      case 'delete-brand': deleteBrand(brandOf(id)); break;
      case 'add-item': itemModal(null, el.dataset.brand || state.scope); break;
      case 'edit-item': if (item) itemModal(item); break;
      case 'adjust': if (item) adjustModal(item); break;
      case 'flag': if (item) toggleFlag(item); break;
      case 'delete-item': if (item) deleteItem(item); break;
      case 'export':
      case 'export-csv': exportCSV(); break;
      case 'export-pdf': exportInventoryPdf(); break;
      case 'export-menu': toggleMenu(el, 'export', [
        { act: 'export-csv', icon: 'table', label: 'Spreadsheet (CSV)', sub: 'Opens in Excel or Google Sheets' },
        { act: 'export-pdf', icon: 'pdf', label: 'PDF report', sub: 'Printable report of every item' },
      ]); break;
      case 'backup-menu': toggleMenu(el, 'backup', [
        { act: 'backup-create', icon: 'download', label: 'Create backup', sub: lastBackupText() },
        { act: 'backup-restore', icon: 'history', label: 'Restore a backup', sub: 'Bring everything back from a backup file' },
      ]); break;
      case 'backup-create': createBackupNow(); break;
      case 'backup-restore': restoreModal(); break;
      case 'cal-prev': case 'cal-next': shiftMonth(act === 'cal-prev' ? -1 : 1); break;
      case 'cal-day': pickDay(el.dataset.day); break;
      case 'cal-preset': applyPreset(el.dataset.preset); break;
      case 'report': downloadSalesReport(); break;
      case 'filter-status':
        state.filters.status = el.dataset.status;
        syncToolbar(); renderTable();
        $('#inventory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
  });
}

function currentRoute() {
  if (location.hash === '#/invoices') return { view: 'invoices' };
  if (location.hash === '#/unpaid') return { view: 'unpaid' };
  if (location.hash === '#/tracker') return { view: 'tracker' };
  const m = location.hash.match(/^#\/brand\/(.+)$/);
  return m ? { view: 'brand', id: decodeURIComponent(m[1]) } : { view: 'dashboard' };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  const r = currentRoute();
  if (r.view === 'brand' && r.id !== 'none' && !brandOf(r.id)) { go('#/dashboard'); return; }
  const key = r.view + (r.id || '');
  if (key !== state.lastRoute) {
    state.filters = freshFilters();
    state.salesFilters = { q: '', status: 'all' };
    state.lastRoute = key;
    window.scrollTo(0, 0);
  }
  destroyCharts();
  renderTabs();
  if (r.view === 'brand') renderBrand(r.id);
  else if (r.view === 'invoices') renderInvoices();
  else if (r.view === 'unpaid') renderUnpaid();
  else if (r.view === 'tracker') renderTracker();
  else renderDashboard();
}

function renderTabs() {
  const r = currentRoute();
  const tab = (href, label, active, lead, badge = 0) =>
    `<a href="${href}" class="tab${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${lead}<span>${esc(label)}</span>${badge ? `<span class="tab-badge" title="${badge} need attention">${badge}</span>` : ''}</a>`;
  let html = tab('#/dashboard', 'Dashboard', r.view === 'dashboard', icon('grid'));
  html += tab('#/invoices', 'Invoices', r.view === 'invoices', icon('receipt'));
  html += tab('#/unpaid', 'Not Fully Paid', r.view === 'unpaid', icon('wallet'), unpaidSales().length);
  html += tab('#/tracker', 'Sales Tracker', r.view === 'tracker', icon('trend'));
  html += '<span class="tab-sep" aria-hidden="true"></span>';
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
    const cls = isMove ? 'move' : (m.reason || '').startsWith('Sale') ? 'sale' : m.change > 0 ? 'in' : 'out';
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

  $('#main').innerHTML = head + salesStrip() + alertBanner(s) + `
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

/* =====================================================================
   SALES — helpers
===================================================================== */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmtMoney2 = (n) => new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const pdfMoney = (n) => {
  const s = fmtMoney2(n);
  return winAnsiSafe(s) ? s : `${CONFIG.CURRENCY} ${new Intl.NumberFormat(CONFIG.LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(CONFIG.LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(CONFIG.LOCALE, { hour: '2-digit', minute: '2-digit' });
const owed = (s) => Math.max(0, round2(s.total - s.amount_paid));
const saleStatus = (s) => (owed(s) <= 0 ? 'paid' : s.amount_paid > 0 ? 'partial' : 'unpaid');
const SALE_STATUS = { paid: ['Paid', 'ok'], partial: ['Part paid', 'warn'], unpaid: ['Unpaid', 'bad'] };
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const saleById = (id) => state.sales.find((s) => s.id === id);
const unpaidSales = () => state.sales.filter((s) => owed(s) > 0);
const unitsOf = (s) => s.items.reduce((a, l) => a + l.qty, 0);
const ageLabel = (d) => (d === 0 ? 'Today' : d === 1 ? '1 day' : `${d} days`);
// Who owes: saved customer, else same name, else each anonymous private sale on its own.
const owerKey = (s) => s.customer_id || (s.is_private ? (s.customer_phone ? 'p:' + s.customer_phone.replace(/\D/g, '') : 'inv:' + s.id) : 'n:' + s.customer_name.trim().toLowerCase());
const owerName = (s) => (s.is_private && !s.customer_phone ? `Private · ${s.invoice_no}` : s.customer_name);
const PAY_METHODS = [['Cash', 'cash'], ['Card', 'card'], ['Bank transfer', 'bank']];

function normalizeSale(s) {
  return {
    ...s,
    total: Number(s.total),
    amount_paid: Number(s.amount_paid),
    items: (s.sale_items || []).map((l) => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price), line_total: Number(l.line_total) }))
      .sort((a, b) => a.id - b.id),
    payments: (s.sale_payments || []).map((p) => ({ ...p, amount: Number(p.amount) }))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
  };
}

function salesStats() {
  const today = dayStart().getTime();
  const week = today - 6 * 864e5;
  const m = new Date(); const month = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
  const r = { today: 0, todayN: 0, week: 0, weekN: 0, month: 0, monthN: 0, all: 0, invoiced: 0, owed: 0, owedN: 0, owing: new Set() };
  // Sales = money actually received, on the day it was received.
  for (const p of state.payments) {
    const t = new Date(p.created_at).getTime();
    r.all += p.amount;
    if (t >= today) { r.today += p.amount; r.todayN++; }
    if (t >= week) { r.week += p.amount; r.weekN++; }
    if (t >= month) { r.month += p.amount; r.monthN++; }
  }
  for (const s of state.sales) {
    r.invoiced += s.total;
    const o = owed(s);
    if (o > 0) { r.owed += o; r.owedN++; r.owing.add(owerKey(s)); }
  }
  r.owingN = r.owing.size;
  for (const k of ['today', 'week', 'month', 'all', 'invoiced', 'owed']) r[k] = round2(r[k]);
  return r;
}

function salesSetupNotice() {
  return `<section class="card setup-card">${icon('alert')}<div>
    <h3>One more step to switch on sales</h3>
    <p>Run <code>supabase/sales.sql</code> in Supabase → SQL Editor (New query → paste → Run), then click Refresh.</p>
    <small class="muted">Database said: ${esc(state.salesError)}</small></div></section>`;
}

function salesStrip() {
  if (state.salesError) {
    return `<section class="sales-strip"><button class="pos-launch" data-act="pos-open">
      <span class="pos-launch-ico">${icon('cart')}</span>
      <span><strong>Live Sales Counter</strong><small>Needs one setup step: see the Invoices tab</small></span>${icon('right')}</button></section>`;
  }
  const st = salesStats();
  return `<section class="sales-strip">
    <button class="pos-launch" data-act="pos-open">
      <span class="pos-launch-ico">${icon('cart')}</span>
      <span><strong>Live Sales Counter</strong><small>Start a new sale</small></span>${icon('right')}
    </button>
    <a class="strip-stat" href="#/tracker"><small>Today's sales</small><strong>${fmtMoney2(st.today)}</strong><span>${st.todayN} payment${st.todayN === 1 ? '' : 's'} received</span></a>
    <a class="strip-stat" href="#/tracker"><small>This month</small><strong>${fmtMoney2(st.month)}</strong><span>${st.monthN} payment${st.monthN === 1 ? '' : 's'} received</span></a>
    <a class="strip-stat ${st.owed > 0 ? 'bad' : ''}" href="#/unpaid"><small>Owed to you</small><strong>${fmtMoney2(st.owed)}</strong><span>${st.owingN} customer${st.owingN === 1 ? '' : 's'} · ${st.owedN} invoice${st.owedN === 1 ? '' : 's'}</span></a>
  </section>`;
}

/* =====================================================================
   INVOICE PDF — download / share
===================================================================== */
function invoiceBlob(sale) {
  const bytes = buildInvoicePdf({
    shop: state.shop, sale, lines: sale.items, payments: sale.payments,
    money: pdfMoney, date: fmtDate, dateTime: fmtDateTime,
  });
  return new Blob([bytes], { type: 'application/pdf' });
}
const invoiceFileName = (s) => `Invoice-${s.invoice_no}-${(s.customer_name || 'customer').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.pdf`;

function downloadInvoice(sale) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(invoiceBlob(sale));
    a.download = invoiceFileName(sale);
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Invoice ${sale.invoice_no} downloaded`);
  } catch (e) {
    toast('Could not create the PDF: ' + (e.message || e), 'error');
  }
}
function canShareFiles() {
  try { return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
}
async function shareInvoice(sale) {
  const file = new File([invoiceBlob(sale)], invoiceFileName(sale), { type: 'application/pdf' });
  try {
    await navigator.share({ files: [file], title: `Invoice ${sale.invoice_no}`, text: `Invoice ${sale.invoice_no} from ${state.shop.shop_name || 'AKASH SHOP C1'}` });
  } catch (e) {
    if (e?.name !== 'AbortError') downloadInvoice(sale);
  }
}

/* =====================================================================
   LIVE SALES COUNTER
===================================================================== */
const MUTE_KEY = 'c1-pos-muted';
const isMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };
const setMuted = (v) => { try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* private mode */ } };

function speak(text) {
  if (isMuted() || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.LOCALE || 'en-GB';
    u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => x.lang === u.lang) || speechSynthesis.getVoices().find((x) => x.lang?.startsWith('en'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}

const freshPOS = () => ({
  step: 'items', lines: [], selected: null, qty: 1, q: '', brand: 'all', flash: null,
  customer: { mode: 'private', id: '', name: '', address: '', phone: '', save: true },
  pay: { full: true, amount: '', method: 'Cash' },
  sale: null, busy: false,
});

const posTotal = () => round2(state.pos.lines.reduce((a, l) => a + round2(l.qty * l.unit_price), 0));
const posUnits = () => state.pos.lines.reduce((a, l) => a + l.qty, 0);
const inCart = (id) => state.pos.lines.find((l) => l.item_id === id)?.qty || 0;
const sellable = (i) => !i.flagged_out_of_stock && i.shop_qty > 0;
const availFor = (i) => (sellable(i) ? i.shop_qty - inCart(i.id) : 0);
const posItem = (id) => state.items.find((i) => i.id === id);

function openPOS() {
  if (state.salesError) { toast('Run supabase/sales.sql in Supabase first, then click Refresh.', 'error'); return; }
  if (!state.items.some(sellable)) { toast('No items have stock in the shop to sell yet.', 'error'); return; }
  state.pos = freshPOS();
  let el = $('#pos');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pos'; el.className = 'pos';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Live Sales Counter');
    document.body.append(el);
    el.addEventListener('click', posClick);
    el.addEventListener('input', posInput);
    el.addEventListener('change', posInput);
    el.addEventListener('keydown', posKey);
  }
  el.hidden = false;
  document.body.classList.add('pos-open');
  renderPOS();
  // warm up the voice list (some browsers load voices lazily)
  try { speechSynthesis?.getVoices(); } catch { /* ignore */ }
}

function closePOS(force = false) {
  const el = $('#pos');
  if (!state.pos || !el) { state.pos = null; return; }
  const dirty = state.pos.step !== 'done' && state.pos.lines.length;
  const done = () => {
    state.pos = null;
    el.hidden = true; el.innerHTML = '';
    document.body.classList.remove('pos-open');
    try { speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (state.user && !force) render();
  };
  if (dirty && !force) {
    confirmModal({
      title: 'Discard this sale?', confirmLabel: 'Discard sale',
      message: `The sales sheet has <strong>${state.pos.lines.length} item${state.pos.lines.length === 1 ? '' : 's'}</strong>. Nothing has been recorded or taken from stock yet.`,
      onConfirm: async () => { done(); },
    });
  } else done();
}

function renderPOS() {
  const p = state.pos, el = $('#pos');
  if (!p || !el) return;
  const steps = [['items', 'Items'], ['customer', 'Customer'], ['payment', 'Payment']];
  const idx = p.step === 'done' ? 3 : steps.findIndex((s) => s[0] === p.step);
  el.innerHTML = `<div class="pos-shell step-${p.step}">
    <header class="pos-head">
      <div class="pos-title"><span class="mark">C1</span><div><strong>Live Sales Counter</strong><small>${esc(state.shop.shop_name || 'AKASH SHOP C1')}</small></div></div>
      <ol class="pos-steps">${steps.map(([, l], i) => `<li class="${i < idx ? 'done' : i === idx ? 'on' : ''}"><span>${i < idx ? icon('check') : i + 1}</span>${l}</li>`).join('')}</ol>
      <div class="pos-head-act">
        <button class="pos-icon" data-pos="mute" title="${isMuted() ? 'Turn voice on' : 'Mute voice'}" aria-pressed="${isMuted()}">${icon(isMuted() ? 'mute' : 'volume')}<span class="hide-sm">${isMuted() ? 'Muted' : 'Voice on'}</span></button>
        <button class="pos-icon" data-pos="close" title="Close counter" aria-label="Close">${icon('x')}</button>
      </div>
    </header>
    <div class="pos-body" id="pos-body"></div>
  </div>`;
  if (p.step === 'items') renderItemsStep();
  else if (p.step === 'customer') renderCustomerStep();
  else if (p.step === 'payment') renderPaymentStep();
  else renderDoneStep();
}

/* ---------- step 1: items ---------- */
function renderItemsStep() {
  const p = state.pos;
  const brands = state.brands.filter((b) => itemsFor(b.id).some(sellable));
  $('#pos-body').innerHTML = `
    <main class="pos-main">
      <section class="pos-sheet" aria-label="Sales sheet">
        <div class="sheet-head">
          <div><h2>Sales Sheet</h2><span class="muted" id="sheet-count"></span></div>
          <button class="btn btn-sm btn-ghost" data-pos="clear" id="sheet-clear">${icon('trash')}Clear</button>
        </div>
        <div class="sheet-cols" aria-hidden="true"><span>Item</span><span>Qty</span><span>Price</span><span>Amount</span><span></span></div>
        <div class="sheet-body" id="sheet-body"></div>
      </section>
      <section class="pos-pad">
        <div class="pad-picker">
          <div class="picker-bar">
            <label class="search">${icon('search')}<input id="pos-q" type="search" placeholder="Search items" value="${esc(p.q)}" autocomplete="off" aria-label="Search items"></label>
            <div class="chips" role="tablist">
              <button class="chip ${p.brand === 'all' ? 'on' : ''}" data-pos="brand" data-id="all">All</button>
              ${brands.map((b) => `<button class="chip ${p.brand === b.id ? 'on' : ''}" data-pos="brand" data-id="${b.id}"><span class="dot" style="--c:${safeColor(b.color)}"></span>${esc(b.name)}</button>`).join('')}
              ${itemsFor('none').some(sellable) ? `<button class="chip ${p.brand === 'none' ? 'on' : ''}" data-pos="brand" data-id="none"><span class="dot" style="--c:${UNBRANDED.color}"></span>Unbranded</button>` : ''}
            </div>
          </div>
          <div class="picker-grid" id="pos-grid"></div>
        </div>
        <div class="pad-qty">
          <div class="qty-item" id="qty-item"></div>
          <div class="qty-ring">
            <button class="qty-btn minus" data-pos="dec" aria-label="Decrease quantity">${icon('minus')}</button>
            <div class="qty-circle"><input id="pos-qty" type="number" inputmode="numeric" min="1" step="1" value="${p.qty}" aria-label="Quantity"><small>QTY</small></div>
            <button class="qty-btn plus" data-pos="inc" aria-label="Increase quantity">${icon('plus')}</button>
          </div>
          <div class="qty-hint" id="qty-hint"></div>
        </div>
        <button class="pad-add" data-pos="add" id="pos-add">${icon('plus')}<span>Add</span></button>
      </section>
    </main>
    <footer class="pos-foot">
      <div class="foot-sum"><span id="foot-meta"></span><strong id="pos-total"></strong></div>
      <button class="btn btn-accent btn-lg" data-pos="submit" id="pos-submit">Submit order ${icon('right')}</button>
    </footer>`;
  renderSheet(); renderGrid(); renderQty();
}

function renderSheet() {
  const p = state.pos, body = $('#sheet-body');
  if (!body) return;
  if (!p.lines.length) {
    body.innerHTML = `<div class="sheet-empty">${icon('cart')}<strong>No items yet</strong><span>Pick an item below, choose the quantity and tap <b>Add</b>.</span></div>`;
  } else {
    body.innerHTML = p.lines.map((l, i) => {
      const it = posItem(l.item_id);
      const max = it ? it.shop_qty : l.qty;
      return `<div class="sheet-row${p.flash === l.item_id ? ' flash' : ''}" data-id="${l.item_id}">
        <div class="sr-name"><span class="sr-n">${i + 1}</span><div><strong>${esc(l.name)}</strong>${l.sku ? `<small>${esc(l.sku)}</small>` : ''}</div></div>
        <div class="sr-qty">
          <button class="mini" data-pos="line-dec" data-id="${l.item_id}" aria-label="One less">${icon('minus')}</button>
          <input type="number" min="1" max="${max}" step="1" inputmode="numeric" value="${l.qty}" data-line="qty" data-id="${l.item_id}" aria-label="Quantity of ${esc(l.name)}">
          <button class="mini" data-pos="line-inc" data-id="${l.item_id}" aria-label="One more" ${l.qty >= max ? 'disabled' : ''}>${icon('plus')}</button>
        </div>
        <label class="sr-price"><span>${esc(currencySymbol())}</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${l.unit_price.toFixed(2)}" data-line="price" data-id="${l.item_id}" aria-label="Price of ${esc(l.name)}"></label>
        <strong class="sr-amt" data-amt="${l.item_id}">${fmtMoney2(l.qty * l.unit_price)}</strong>
        <button class="icon-btn" data-pos="remove" data-id="${l.item_id}" title="Remove" aria-label="Remove ${esc(l.name)}">${icon('x')}</button>
      </div>`;
    }).join('');
    if (p.flash) body.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
    p.flash = null;
  }
  updateTotals();
}

function updateTotals() {
  const p = state.pos;
  const n = p.lines.length, u = posUnits();
  $('#sheet-count') && ($('#sheet-count').textContent = n ? `${n} item${n === 1 ? '' : 's'} · ${u} unit${u === 1 ? '' : 's'}` : '');
  $('#sheet-clear') && ($('#sheet-clear').hidden = !n);
  $('#foot-meta') && ($('#foot-meta').textContent = n ? `Total · ${u} unit${u === 1 ? '' : 's'}` : 'Total');
  $('#pos-total') && ($('#pos-total').textContent = fmtMoney2(posTotal()));
  $('#pos-submit') && ($('#pos-submit').disabled = !n);
}

function renderGrid() {
  const p = state.pos, grid = $('#pos-grid');
  if (!grid) return;
  const q = p.q.trim().toLowerCase();
  let list = state.items.slice();
  if (p.brand !== 'all') list = list.filter((i) => (p.brand === 'none' ? !i.brand_id : i.brand_id === p.brand));
  if (q) list = list.filter((i) => [i.name, i.sku, i.category, brandOf(i.brand_id)?.name].some((v) => v && v.toLowerCase().includes(q)));
  list.sort((a, b) => (sellable(b) - sellable(a)) || a.name.localeCompare(b.name));
  const ids = list.map((i) => i.id).join(',');
  if (!list.length) { grid.dataset.ids = ''; grid.innerHTML = `<div class="grid-empty">${icon('search')}No items match “${esc(p.q)}”</div>`; return; }
  const look = (i) => {
    const av = availFor(i), off = av <= 0;
    return {
      off, on: p.selected === i.id, low: !off && av <= 3,
      cls: `tile${p.selected === i.id ? ' on' : ''}${off ? ' off' : ''}`,
      note: i.flagged_out_of_stock ? 'Flagged out' : !i.shop_qty ? 'None in shop' : off ? 'All in sheet' : `${av} in shop`,
    };
  };
  // Same tiles as before: update them in place so a tap that is in progress is never lost.
  if (grid.dataset.ids === ids) {
    for (const i of list) {
      const t = grid.querySelector(`.tile[data-id="${i.id}"]`), L = look(i);
      if (!t) continue;
      t.className = L.cls;
      if (L.off) t.setAttribute('aria-disabled', 'true'); else t.removeAttribute('aria-disabled');
      const em = t.querySelector('.tile-meta em'); em.textContent = L.note; em.className = L.low ? 'low' : '';
      const ck = t.querySelector('.tile-check');
      if (L.on && !ck) t.insertAdjacentHTML('beforeend', `<span class="tile-check">${icon('check')}</span>`);
      if (!L.on && ck) ck.remove();
    }
    return;
  }
  grid.dataset.ids = ids;
  grid.innerHTML = list.map((i) => {
    const b = brandOf(i.brand_id) || UNBRANDED, L = look(i);
    return `<button class="${L.cls}" data-pos="pick" data-id="${i.id}" style="--c:${safeColor(b.color)}" ${L.off ? 'aria-disabled="true"' : ''}>
      <span class="tile-name">${esc(i.name)}</span>
      <span class="tile-meta"><b>${fmtMoney2(i.unit_price)}</b><em class="${L.low ? 'low' : ''}">${L.note}</em></span>
      ${L.on ? `<span class="tile-check">${icon('check')}</span>` : ''}
    </button>`;
  }).join('');
}

function renderQty() {
  const p = state.pos;
  const it = p.selected ? posItem(p.selected) : null;
  const av = it ? availFor(it) : 0;
  if (it && p.qty > av) p.qty = Math.max(1, av);
  const qi = $('#pos-qty');
  if (qi && document.activeElement !== qi) qi.value = p.qty;
  $('#qty-item').innerHTML = it
    ? `<strong>${esc(it.name)}</strong><span>${fmtMoney2(it.unit_price)} each</span>`
    : '<strong class="muted">Select an item</strong><span>Tap an item on the left</span>';
  $('#qty-hint').textContent = it ? `${av} available in shop` : '';
  $('#qty-hint').classList.toggle('bad', !!it && av <= 0);
  $('[data-pos="dec"]').disabled = !it || p.qty <= 1;
  $('[data-pos="inc"]').disabled = !it || p.qty >= av;
  $('#pos-add').disabled = !it || av <= 0 || !(p.qty >= 1);
  $('#pos-add span').textContent = it && p.qty > 0 ? `Add ${p.qty}` : 'Add';
}

function addToSheet() {
  const p = state.pos;
  const it = p.selected ? posItem(p.selected) : null;
  if (!it) { toast('Select an item first', 'error'); return; }
  const qty = parseInt($('#pos-qty')?.value, 10) || p.qty;
  const av = availFor(it);
  if (!(qty >= 1)) { toast('Quantity must be at least 1', 'error'); return; }
  if (qty > av) { toast(`Only ${av} more ${it.name} in the shop`, 'error'); return; }
  const line = p.lines.find((l) => l.item_id === it.id);
  if (line) line.qty += qty;
  else p.lines.push({ item_id: it.id, name: it.name, sku: it.sku, qty, unit_price: Number(it.unit_price) || 0 });
  p.flash = it.id;
  speak(`${it.name}, quantity ${qty}`);
  p.qty = 1;
  const qi = $('#pos-qty'); if (qi) qi.value = 1;
  if (availFor(it) <= 0) p.selected = null;
  renderSheet(); renderGrid(); renderQty();
  $('#pos-q')?.focus({ preventScroll: true });
}

function setLineQty(id, qty) {
  const p = state.pos, l = p.lines.find((x) => x.item_id === id), it = posItem(id);
  if (!l) return;
  const max = it ? it.shop_qty : l.qty;
  if (qty < 1) qty = 1;
  if (qty > max) { qty = max; toast(`Only ${max} ${l.name} in the shop`, 'error'); }
  l.qty = qty;
}

/* ---------- step 2: customer ---------- */
function renderCustomerStep() {
  const p = state.pos, c = p.customer;
  const tab = (mode, label, ic) => `<label><input type="radio" name="cmode" value="${mode}" ${c.mode === mode ? 'checked' : ''}><span>${icon(ic)}${label}</span></label>`;
  let fields = '';
  if (c.mode === 'private') {
    fields = `<div class="cust-note">${icon('user')}<div><strong>Private customer</strong><span>The invoice will say “Private customer”. Address and number below are optional.</span></div></div>`;
  } else if (c.mode === 'frequent') {
    fields = state.customers.length
      ? `<label class="field"><span>Frequent customer *</span>
          <select id="cust-select" required>
            <option value="">Choose a customer…</option>
            ${state.customers.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}${x.phone ? ' · ' + esc(x.phone) : ''}</option>`).join('')}
          </select></label>`
      : `<div class="cust-note">${icon('users')}<div><strong>No frequent customers saved yet</strong><span>Choose <b>New customer</b> and tick “Save as frequent customer”. They'll appear here next time.</span></div></div>`;
  } else {
    fields = `<label class="field"><span>Customer name *</span><input id="cust-name" maxlength="80" value="${esc(c.name)}" placeholder="e.g. Ravi Patel" autocomplete="off"></label>
      <label class="check save-check"><input type="checkbox" id="cust-save" ${c.save ? 'checked' : ''}><span><strong>Save as frequent customer</strong><small>They'll stay in the Frequent customer drop-down for next time.</small></span></label>`;
  }
  $('#pos-body').innerHTML = `
    <main class="pos-step">
      <section class="pos-card">
        <header><h2>Customer details</h2><p>Who is this sale for?</p></header>
        <fieldset class="field"><legend>Customer name</legend>
          <div class="seg seg-3 cust-tabs">${tab('private', 'Private', 'user')}${tab('frequent', 'Frequent customer', 'users')}${tab('new', 'New customer', 'userPlus')}</div>
        </fieldset>
        ${fields}
        <label class="field"><span>Address <small>(optional)</small></span><textarea id="cust-address" rows="2" maxlength="200">${esc(c.address)}</textarea></label>
        <label class="field"><span>Contact number <small>(optional)</small></span><input id="cust-phone" type="tel" maxlength="30" value="${esc(c.phone)}" autocomplete="off"></label>
      </section>
      ${orderSummary()}
    </main>
    <footer class="pos-foot">
      <button class="btn btn-glass btn-lg" data-pos="back">${icon('left')}Back to items</button>
      <button class="btn btn-accent btn-lg" data-pos="cust-next">Submit ${icon('right')}</button>
    </footer>`;
}

function orderSummary() {
  const p = state.pos;
  return `<aside class="pos-card pos-summary">
    <header><h3>Order</h3><span class="muted">${p.lines.length} item${p.lines.length === 1 ? '' : 's'} · ${posUnits()} units</span></header>
    <ul>${p.lines.map((l) => `<li><span class="q">${l.qty}×</span><span class="n">${esc(l.name)}</span><span class="a">${fmtMoney2(l.qty * l.unit_price)}</span></li>`).join('')}</ul>
    <footer><span>Total</span><strong>${fmtMoney2(posTotal())}</strong></footer>
  </aside>`;
}

function customerValid() {
  const c = state.pos.customer;
  if (c.mode === 'frequent' && !c.id) { toast('Choose a frequent customer from the list', 'error'); return false; }
  if (c.mode === 'new' && !c.name.trim()) { toast('Enter the customer name', 'error'); $('#cust-name')?.focus(); return false; }
  return true;
}

/* ---------- step 3: payment ---------- */
function renderPaymentStep() {
  const p = state.pos, total = posTotal();
  const name = customerLabel();
  $('#pos-body').innerHTML = `
    <main class="pos-step">
      <section class="pos-card pay-card">
        <div class="due-box"><small>Amount due</small><strong>${fmtMoney2(total)}</strong><span>${p.lines.length} item${p.lines.length === 1 ? '' : 's'} · ${esc(name)}</span></div>
        <label class="check pay-full"><input type="checkbox" id="pay-full" ${p.pay.full ? 'checked' : ''}><span><strong>Paid in full</strong><small>The customer has paid the whole ${fmtMoney2(total)}</small></span></label>
        <label class="field"><span>Partial payment</span>
          <div class="money-input"><b>${esc(currencySymbol())}</b><input id="pay-amount" type="number" min="0" max="${total}" step="0.01" inputmode="decimal" placeholder="0.00" value="${p.pay.full ? total.toFixed(2) : esc(p.pay.amount)}"></div>
          <small>Amount received now. Whatever is left goes to <b>Not Fully Paid</b>.</small></label>
        <div class="pay-calc" id="pay-calc"></div>
        <fieldset class="field"><legend>Mode of payment</legend>
          <div class="seg seg-3">${PAY_METHODS.map(([m, ic]) => `<label><input type="radio" name="pmethod" value="${m}" ${p.pay.method === m ? 'checked' : ''}><span>${icon(ic)}${m}</span></label>`).join('')}</div>
        </fieldset>
        <p class="pay-tip" id="pay-tip" hidden>${icon('alert')}<span>This customer is “Private”. Go back and add a name or number so you know who owes the rest.</span></p>
      </section>
      ${orderSummary()}
    </main>
    <footer class="pos-foot">
      <button class="btn btn-glass btn-lg" data-pos="back">${icon('left')}Back</button>
      <button class="btn btn-accent btn-lg" data-pos="record" id="pos-record">${icon('file')}Generate Invoice &amp; Record Sale</button>
    </footer>`;
  updatePayCalc();
}

function paidNow() {
  const p = state.pos, total = posTotal();
  if (p.pay.full) return total;
  const v = Number(p.pay.amount);
  return Number.isFinite(v) ? round2(v) : 0;
}
function updatePayCalc() {
  const p = state.pos, total = posTotal(), paid = paidNow(), left = round2(total - paid);
  const bad = paid < 0 || paid > total;
  const el = $('#pay-calc');
  el.className = `pay-calc ${bad ? 'error' : left > 0 ? 'warn' : 'ok'}`;
  el.innerHTML = bad
    ? `${icon('alert')}<span>Payment must be between ${fmtMoney2(0)} and ${fmtMoney2(total)}</span>`
    : `<div><small>Paid now</small><strong>${fmtMoney2(paid)}</strong></div><div><small>Outstanding</small><strong>${fmtMoney2(left)}</strong></div>
       <div><small>Status</small><strong>${left <= 0 ? 'Paid in full' : paid > 0 ? 'Part paid' : 'Unpaid'}</strong></div>`;
  $('#pay-tip').hidden = !(left > 0 && p.customer.mode === 'private' && !p.customer.phone.trim());
  $('#pos-record').disabled = bad || p.busy;
}

const customerLabel = () => {
  const c = state.pos.customer;
  if (c.mode === 'private') return 'Private customer';
  if (c.mode === 'frequent') return state.customers.find((x) => x.id === c.id)?.name || 'Frequent customer';
  return c.name.trim() || 'New customer';
};

async function recordSale() {
  const p = state.pos, total = posTotal(), paid = paidNow();
  if (paid < 0 || paid > total) { toast('Check the payment amount', 'error'); return; }
  const btn = $('#pos-record');
  p.busy = true; btn.disabled = true; btn.classList.add('loading');
  const c = p.customer;
  const { data, error } = await sb.rpc('record_sale', {
    p_lines: p.lines.map((l) => ({ item_id: l.item_id, qty: l.qty, unit_price: round2(l.unit_price) })),
    p_customer: { mode: c.mode, id: c.id || null, name: c.mode === 'private' ? null : c.name.trim(), address: c.address.trim(), phone: c.phone.trim(), save: c.save },
    p_paid: paid,
    p_method: p.pay.method,
  });
  p.busy = false; btn.classList.remove('loading'); btn.disabled = false;
  if (error) { toast(niceError(error), 'error'); return; }
  await loadAll();
  const sale = saleById(data.id) || normalizeSale({ ...data, sale_items: [], sale_payments: [] });
  p.sale = sale;
  p.step = 'done';
  renderPOS();
  downloadInvoice(sale);
}

/* ---------- step 4: done ---------- */
function renderDoneStep() {
  const s = state.pos.sale;
  const [label, tone] = SALE_STATUS[saleStatus(s)];
  $('#pos-body').innerHTML = `
    <main class="pos-step pos-done">
      <div class="done-card">
        <div class="done-check">${icon('check')}</div>
        <h2>Sale recorded</h2>
        <p class="done-inv">Invoice <strong>${esc(s.invoice_no)}</strong> · ${esc(s.customer_name)}</p>
        <div class="done-figs">
          <div><small>Total</small><strong>${fmtMoney2(s.total)}</strong></div>
          <div><small>Paid</small><strong>${fmtMoney2(s.amount_paid)}</strong></div>
          <div><small>Outstanding</small><strong class="${owed(s) > 0 ? 'bad' : ''}">${fmtMoney2(owed(s))}</strong></div>
        </div>
        <span class="badge ${tone}">${label} · ${esc(s.payment_method)}</span>
        <p class="muted">${unitsOf(s)} unit${unitsOf(s) === 1 ? '' : 's'} taken off shop stock. The invoice PDF has downloaded${owed(s) > 0 ? ', and the balance is listed under <b>Not Fully Paid</b>' : ''}.</p>
        <div class="done-actions">
          <button class="btn btn-ghost" data-pos="pdf">${icon('download')}Download PDF again</button>
          ${canShareFiles() ? `<button class="btn btn-ghost" data-pos="share">${icon('share')}Send to customer</button>` : ''}
          <button class="btn btn-ghost" data-pos="invoices">${icon('receipt')}View invoices</button>
          <button class="btn btn-accent" data-pos="new">${icon('plus')}New sale</button>
        </div>
      </div>
    </main>`;
}

/* ---------- counter events ---------- */
function posClick(e) {
  const el = e.target.closest('[data-pos]');
  if (!el || !state.pos) return;
  const p = state.pos, id = el.dataset.id;
  switch (el.dataset.pos) {
    case 'close': closePOS(); break;
    case 'mute': setMuted(!isMuted()); if (isMuted()) try { speechSynthesis.cancel(); } catch { /* */ }
      el.outerHTML = `<button class="pos-icon" data-pos="mute" title="${isMuted() ? 'Turn voice on' : 'Mute voice'}" aria-pressed="${isMuted()}">${icon(isMuted() ? 'mute' : 'volume')}<span class="hide-sm">${isMuted() ? 'Muted' : 'Voice on'}</span></button>`;
      break;
    case 'brand': p.brand = id; $$('.chip', $('#pos')).forEach((c) => c.classList.toggle('on', c.dataset.id === id)); renderGrid(); break;
    case 'pick': {
      const it = posItem(id);
      if (!it || availFor(it) <= 0) { toast(it && !sellable(it) ? `${it.name} has no stock in the shop` : 'All of this item is already in the sheet', 'error'); return; }
      p.selected = p.selected === id ? null : id; p.qty = 1;
      renderGrid(); renderQty();
      if (p.selected && matchMedia('(min-width: 761px)').matches) $('#pos-qty')?.select();
      break;
    }
    case 'dec': p.qty = Math.max(1, (parseInt($('#pos-qty').value, 10) || p.qty) - 1); $('#pos-qty').value = p.qty; renderQty(); break;
    case 'inc': p.qty = (parseInt($('#pos-qty').value, 10) || p.qty) + 1; $('#pos-qty').value = p.qty; renderQty(); break;
    case 'add': addToSheet(); break;
    case 'line-dec': { const l = p.lines.find((x) => x.item_id === id); if (l && l.qty > 1) { setLineQty(id, l.qty - 1); renderSheet(); renderGrid(); renderQty(); } break; }
    case 'line-inc': { const l = p.lines.find((x) => x.item_id === id); if (l) { setLineQty(id, l.qty + 1); renderSheet(); renderGrid(); renderQty(); } break; }
    case 'remove': p.lines = p.lines.filter((x) => x.item_id !== id); renderSheet(); renderGrid(); renderQty(); break;
    case 'clear':
      confirmModal({ title: 'Clear the sales sheet?', confirmLabel: 'Clear sheet', message: 'All items will be removed from this sale.',
        onConfirm: async () => { p.lines = []; renderSheet(); renderGrid(); renderQty(); } });
      break;
    case 'submit': {
      if (!p.lines.length) return;
      openModal({
        title: 'Submit this order?', submitLabel: 'Yes, submit order',
        body: `<p class="confirm-text">Please check the order before continuing.</p>
          <ul class="confirm-list">${p.lines.map((l) => `<li><span>${l.qty} × ${esc(l.name)}</span><b>${fmtMoney2(l.qty * l.unit_price)}</b></li>`).join('')}</ul>
          <div class="confirm-total"><span>Total · ${posUnits()} units</span><strong>${fmtMoney2(posTotal())}</strong></div>
          <p class="confirm-text">Next you'll add the customer details and payment. Stock is only taken off when you record the sale.</p>`,
        onSubmit: async () => { p.step = 'customer'; renderPOS(); },
      });
      break;
    }
    case 'back': p.step = p.step === 'payment' ? 'customer' : 'items'; renderPOS(); break;
    case 'cust-next': if (customerValid()) { p.step = 'payment'; renderPOS(); } break;
    case 'record': recordSale(); break;
    case 'pdf': downloadInvoice(p.sale); break;
    case 'share': shareInvoice(p.sale); break;
    case 'invoices': closePOS(); go('#/invoices'); break;
    case 'new': state.pos = freshPOS(); renderPOS(); break;
  }
}

function posInput(e) {
  const p = state.pos, t = e.target;
  if (!p) return;
  if ((t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT') && e.type === 'input') return;
  if (t.id === 'pos-q') { if (e.type === 'input') { p.q = t.value; renderGrid(); } return; }
  if (t.id === 'pos-qty') {
    const v = parseInt(t.value, 10);
    p.qty = v > 0 ? v : 0;
    const it = p.selected ? posItem(p.selected) : null;
    if (it && e.type === 'change') { const av = availFor(it); if (p.qty > av) { p.qty = av; t.value = av; toast(`Only ${av} available in the shop`, 'error'); } if (p.qty < 1) { p.qty = 1; t.value = 1; } }
    renderQty();
    return;
  }
  if (t.dataset.line) {
    const id = t.dataset.id, l = p.lines.find((x) => x.item_id === id);
    if (!l) return;
    if (t.dataset.line === 'price') {
      const v = Number(t.value);
      l.unit_price = Number.isFinite(v) && v >= 0 ? round2(v) : 0;
      if (e.type === 'change') t.value = l.unit_price.toFixed(2);
    } else {
      const v = parseInt(t.value, 10);
      if (e.type === 'change' || v > 0) setLineQty(id, v > 0 ? v : 1);
      if (e.type === 'change') {
        t.value = l.qty;
        const it = posItem(id), inc = t.parentElement.querySelector('[data-pos="line-inc"]');
        if (inc) inc.disabled = !!it && l.qty >= it.shop_qty;
        renderGrid(); renderQty();
      }
    }
    const amt = $(`[data-amt="${id}"]`); if (amt) amt.textContent = fmtMoney2(l.qty * l.unit_price);
    updateTotals();
    return;
  }
  // customer step
  const c = p.customer;
  if (t.name === 'cmode') { c.mode = t.value; renderCustomerStep(); return; }
  if (t.id === 'cust-select') {
    c.id = t.value;
    const x = state.customers.find((k) => k.id === t.value);
    c.name = x?.name || '';
    if (e.type === 'change') { c.address = x?.address || ''; c.phone = x?.phone || ''; $('#cust-address').value = c.address; $('#cust-phone').value = c.phone; }
    return;
  }
  if (t.id === 'cust-name') { c.name = t.value; return; }
  if (t.id === 'cust-save') { c.save = t.checked; return; }
  if (t.id === 'cust-address') { c.address = t.value; return; }
  if (t.id === 'cust-phone') { c.phone = t.value; return; }
  // payment step
  if (t.id === 'pay-full') {
    p.pay.full = t.checked;
    p.pay.amount = t.checked ? '' : '';
    $('#pay-amount').value = t.checked ? posTotal().toFixed(2) : '';
    if (!t.checked) $('#pay-amount').focus();
    updatePayCalc(); return;
  }
  if (t.id === 'pay-amount') {
    p.pay.amount = t.value;
    const v = Number(t.value);
    p.pay.full = t.value !== '' && round2(v) === posTotal();
    $('#pay-full').checked = p.pay.full;
    updatePayCalc(); return;
  }
  if (t.name === 'pmethod') { p.pay.method = t.value; return; }
}

function posKey(e) {
  if (!state.pos) return;
  if (e.key === 'Escape' && !$('#modal').open) { e.preventDefault(); closePOS(); return; }
  if (e.key !== 'Enter' || state.pos.step !== 'items') return;
  if (e.target.id === 'pos-qty') { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); addToSheet(); }
  else if (e.target.id === 'pos-q') {
    e.preventDefault();
    const first = $('#pos-grid .tile:not(.off)');
    if (first) { state.pos.selected = first.dataset.id; state.pos.qty = 1; renderGrid(); renderQty(); $('#pos-qty').select(); }
  }
}

/* =====================================================================
   INVOICES TAB
===================================================================== */
function renderInvoices() {
  state.scope = null;
  const head = `<section class="page-head">
    <div><p class="eyebrow">Sales</p><h1>Invoices</h1></div>
    <div class="head-actions">
      <button class="btn btn-ghost" data-act="customers">${icon('users')}Frequent customers</button>
      <button class="btn btn-ghost" data-act="shop-settings">${icon('settings')}Invoice details</button>
      <button class="btn btn-accent" data-act="pos-open">${icon('cart')}Live Sales Counter</button>
    </div></section>`;
  if (state.salesError) { $('#main').innerHTML = head + salesSetupNotice(); return; }
  const st = salesStats();
  if (!state.sales.length) {
    $('#main').innerHTML = head + `<section class="card"><div class="empty">${icon('receipt')}<h3>No invoices yet</h3>
      <p>Every sale made on the Live Sales Counter creates an invoice here, ready to download as a PDF.</p>
      <div class="empty-actions"><button class="btn btn-accent" data-act="pos-open">${icon('cart')}Open Live Sales Counter</button></div></div></section>`;
    return;
  }
  $('#main').innerHTML = head + `
    <section class="kpis kpis-6">
      ${kpi("Today's sales", fmtMoney2(st.today), 'cart', '', `${st.todayN} payment${st.todayN === 1 ? '' : 's'} received`)}
      ${kpi('Last 7 days', fmtMoney2(st.week), 'activity', '', `${st.weekN} payment${st.weekN === 1 ? '' : 's'}`)}
      ${kpi('This month', fmtMoney2(st.month), 'calendar', '', `${st.monthN} payment${st.monthN === 1 ? '' : 's'}`)}
      ${kpi('All sales (received)', fmtMoney2(st.all), 'coin', 'ok', `<a href="#/tracker">Open Sales Tracker →</a>`)}
      ${kpi('Invoiced', fmtMoney2(st.invoiced), 'layers', 'navy', `${state.sales.length} invoice${state.sales.length === 1 ? '' : 's'}`)}
      ${kpi('Still owed', fmtMoney2(st.owed), 'wallet', st.owed > 0 ? 'bad' : 'ok', `<a href="#/unpaid">${st.owedN} not fully paid →</a>`)}
    </section>
    <section class="grid">
      <article class="card span-2">
        <header class="card-head"><div><h3>Daily sales</h3><p>Money received each day · last 14 days</p></div></header>
        <div class="chart-box"><canvas id="ch-sales"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>How customers paid</h3><p>Money received by payment method</p></div></header>
        <div class="chart-box"><canvas id="ch-methods"></canvas></div>
      </article>
    </section>
    <section class="card table-card" id="sales-list">
      <div class="toolbar">
        <div class="tb-title"><h3>All invoices</h3><span class="muted" id="sales-count"></span></div>
        <div class="tb-controls">
          <label class="search">${icon('search')}<input id="s-q" type="search" placeholder="Search invoice, customer or item" value="${esc(state.salesFilters.q)}" aria-label="Search invoices"></label>
          <select id="s-status" aria-label="Payment status">
            ${[['all', 'Any status'], ['paid', 'Paid'], ['partial', 'Part paid'], ['unpaid', 'Unpaid']].map(([v, l]) => `<option value="${v}" ${state.salesFilters.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="sales-wrap"></div>
    </section>`;
  $('#s-q').addEventListener('input', (e) => { state.salesFilters.q = e.target.value; renderSalesTable(); });
  $('#s-status').addEventListener('change', (e) => { state.salesFilters.status = e.target.value; renderSalesTable(); });
  renderSalesTable();
  drawSalesCharts();
}

function renderSalesTable() {
  const wrap = $('#sales-wrap');
  if (!wrap) return;
  const f = state.salesFilters;
  let rows = state.sales.slice();
  if (f.status !== 'all') rows = rows.filter((s) => saleStatus(s) === f.status);
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    rows = rows.filter((s) => [s.invoice_no, s.customer_name, s.customer_phone, ...s.items.map((l) => l.item_name)].some((v) => v && v.toLowerCase().includes(q)));
  }
  $('#sales-count').textContent = rows.length === state.sales.length ? `${rows.length} invoice${rows.length === 1 ? '' : 's'}` : `${rows.length} of ${state.sales.length}`;
  if (!rows.length) { wrap.innerHTML = `<div class="empty">${icon('search')}<h3>No invoices match</h3><p>Try a different search or status.</p></div>`; return; }
  wrap.innerHTML = `<div class="table-scroll"><table class="inv sales">
    <thead><tr><th>Invoice</th><th>Customer</th><th class="num">Items</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th class="num"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${rows.map((s) => {
      const st = saleStatus(s), [label, tone] = SALE_STATUS[st];
      return `<tr class="row-${st === 'paid' ? 'ok' : st === 'partial' ? 'low' : 'out'}">
        <td><div class="item-cell"><strong>${esc(s.invoice_no)}</strong><small>${fmtDateTime(s.created_at)}</small></div></td>
        <td><div class="item-cell"><strong>${esc(s.customer_name)}</strong><small>${esc(s.customer_phone || (s.is_private ? 'Private' : ''))}</small></div></td>
        <td class="num">${unitsOf(s)}</td>
        <td class="num strong">${fmtMoney2(s.total)}</td>
        <td class="num">${fmtMoney2(s.amount_paid)}</td>
        <td class="num ${owed(s) > 0 ? 'qty-zero' : 'muted'}">${fmtMoney2(owed(s))}</td>
        <td><div class="badges"><span class="badge ${tone}">${label}</span><small class="muted">${esc(s.payment_method)}</small></div></td>
        <td class="actions">
          <button class="icon-btn" data-act="inv-view" data-id="${s.id}" title="View invoice">${icon('eye')}</button>
          <button class="icon-btn" data-act="inv-pdf" data-id="${s.id}" title="Download PDF">${icon('download')}</button>
          ${owed(s) > 0 ? `<button class="icon-btn" data-act="pay" data-id="${s.id}" title="Record a payment">${icon('wallet')}</button>` : ''}
        </td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function drawSalesCharts() {
  const c = colors(); chartDefaults(c);
  const days = 14, labels = [], paid = [], idx = {};
  const start = dayStart(); start.setDate(start.getDate() - (days - 1));
  for (let d = 0; d < days; d++) {
    const dt = new Date(start); dt.setDate(start.getDate() + d);
    idx[dayKey(dt)] = d; labels.push(dt.toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short' })); paid.push(0);
  }
  for (const p of state.payments) {
    const k = dayKey(new Date(p.created_at));
    if (k in idx) paid[idx[k]] = round2(paid[idx[k]] + p.amount);
  }
  mkChart('ch-sales', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Sales (money received)', data: paid, backgroundColor: c.ok, borderRadius: 5, maxBarThickness: 26 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => fmtMoneyShort(v) } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => ` Sales: ${fmtMoney2(x.raw)}` } } },
    },
  });
  const by = {};
  for (const s of state.sales) for (const p of s.payments) by[p.method] = round2((by[p.method] || 0) + p.amount);
  const methods = PAY_METHODS.map(([m]) => m).filter((m) => by[m]);
  doughnut('ch-methods', methods, methods.map((m) => by[m]), [c.ok, c.sky, '#8b5cf6'].slice(0, methods.length),
    fmtMoney(Object.values(by).reduce((a, b) => a + b, 0)), 'collected', fmtMoney2);
}

/* =====================================================================
   NOT FULLY PAID TAB
===================================================================== */
function renderUnpaid() {
  state.scope = null;
  const head = `<section class="page-head">
    <div><p class="eyebrow">Money owed to the shop</p><h1>Not Fully Paid</h1></div>
    <div class="head-actions"><button class="btn btn-accent" data-act="pos-open">${icon('cart')}Live Sales Counter</button></div></section>`;
  if (state.salesError) { $('#main').innerHTML = head + salesSetupNotice(); return; }
  const list = unpaidSales().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (!list.length) {
    $('#main').innerHTML = head + `<section class="card"><div class="empty all-paid">${icon('check')}<h3>Everyone has paid in full</h3>
      <p>Sales with a partial payment, or no payment yet, will appear here with the amount still owed.</p></div></section>`;
    return;
  }
  const total = round2(list.reduce((a, s) => a + owed(s), 0));
  const billed = round2(list.reduce((a, s) => a + s.total, 0));
  const got = round2(list.reduce((a, s) => a + s.amount_paid, 0));
  const groups = {};
  for (const s of list) {
    const g = groups[owerKey(s)] ||= { name: owerName(s), phone: s.customer_phone, owed: 0, n: 0, oldest: s.created_at };
    g.owed = round2(g.owed + owed(s)); g.n++; if (!g.phone && s.customer_phone) g.phone = s.customer_phone;
  }
  const people = Object.values(groups).sort((a, b) => b.owed - a.owed);
  const oldest = daysSince(list[0].created_at);
  const chartH = Math.max(220, Math.min(people.length, 10) * 34 + 60);

  $('#main').innerHTML = head + `
    <section class="kpis">
      ${kpi('Still to be paid', fmtMoney2(total), 'wallet', 'bad', `from ${fmtMoney2(billed)} invoiced`)}
      ${kpi('Invoices not fully paid', fmtNum(list.length), 'receipt', 'warn', `${list.filter((s) => s.amount_paid > 0).length} part paid · ${list.filter((s) => !s.amount_paid).length} unpaid`)}
      ${kpi('Customers owing', fmtNum(people.length), 'users', '', people[0] ? `Most: ${esc(people[0].name)}` : '')}
      ${kpi('Oldest balance', ageLabel(oldest), 'alert', oldest > 30 ? 'bad' : oldest > 7 ? 'warn' : '', `Since ${fmtDate(list[0].created_at)}`)}
    </section>
    <section class="grid">
      <article class="card span-2">
        <header class="card-head"><div><h3>Who owes the most</h3><p>Outstanding balance per customer${people.length > 10 ? ' · top 10' : ''}</p></div></header>
        <div class="chart-box" style="height:${chartH}px"><canvas id="ch-owed"></canvas></div>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Collected so far</h3><p>On these ${list.length} invoices</p></div></header>
        <div class="chart-box"><canvas id="ch-collect"></canvas></div>
      </article>
    </section>
    <section class="grid owe-people">${people.slice(0, 6).map((g) => `
      <article class="card owe-card">
        <div class="owe-top"><span class="owe-avatar">${esc(g.name.trim().charAt(0).toUpperCase() || '?')}</span>
          <div><strong>${esc(g.name)}</strong><small>${g.n} invoice${g.n === 1 ? '' : 's'} · oldest ${ageLabel(daysSince(g.oldest)).toLowerCase()}</small></div></div>
        <div class="owe-amt">${fmtMoney2(g.owed)}</div>
        ${g.phone ? `<a class="btn btn-sm btn-soft" href="tel:${esc(g.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}${esc(g.phone)}</a>` : '<span class="muted owe-nophone">No contact number</span>'}
      </article>`).join('')}
    </section>
    <section class="card table-card">
      <div class="toolbar"><div class="tb-title"><h3>Outstanding invoices</h3><span class="muted">Oldest first</span></div></div>
      <div class="table-scroll"><table class="inv sales">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Contact</th><th class="num">Age</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Outstanding</th><th class="num"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${list.map((s) => {
          const age = daysSince(s.created_at);
          return `<tr class="row-${s.amount_paid > 0 ? 'low' : 'out'}">
            <td><div class="item-cell"><strong>${esc(s.invoice_no)}</strong><small>${fmtDate(s.created_at)} · ${fmtTime(s.created_at)}</small></div></td>
            <td><div class="item-cell"><strong>${esc(s.customer_name)}</strong><small>${esc(s.customer_address || '')}</small></div></td>
            <td>${s.customer_phone ? `<a class="tel" href="tel:${esc(s.customer_phone.replace(/[^\d+]/g, ''))}">${esc(s.customer_phone)}</a>` : '<span class="muted">—</span>'}</td>
            <td class="num ${age > 30 ? 'qty-zero' : ''}">${ageLabel(age)}</td>
            <td class="num">${fmtMoney2(s.total)}</td>
            <td class="num">${fmtMoney2(s.amount_paid)}</td>
            <td class="num"><strong class="owed-amt">${fmtMoney2(owed(s))}</strong></td>
            <td class="actions">
              <button class="btn btn-sm btn-primary" data-act="pay" data-id="${s.id}">${icon('wallet')}Record payment</button>
              <button class="icon-btn" data-act="inv-view" data-id="${s.id}" title="View invoice">${icon('eye')}</button>
              <button class="icon-btn" data-act="inv-pdf" data-id="${s.id}" title="Download PDF">${icon('download')}</button>
            </td></tr>`;
        }).join('')}</tbody></table></div>
    </section>`;

  const c = colors(); chartDefaults(c);
  const top = people.slice(0, 10);
  mkChart('ch-owed', {
    type: 'bar',
    data: { labels: top.map((g) => shorten(g.name)), datasets: [{ label: 'Owed', data: top.map((g) => g.owed), backgroundColor: c.bad, borderRadius: 5, maxBarThickness: 22 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => fmtMoneyShort(v) } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => ` ${fmtMoney2(x.raw)} owed · ${top[x.dataIndex].n} invoice(s)` } } },
    },
  });
  doughnut('ch-collect', ['Collected', 'Still owed'], [got, total], [c.ok, c.bad],
    `${billed ? Math.round((got / billed) * 100) : 0}%`, 'collected', fmtMoney2);
}

/* =====================================================================
   SALES MODALS
===================================================================== */
function saleModal(s) {
  const st = saleStatus(s), [label, tone] = SALE_STATUS[st];
  openModal({
    title: `Invoice ${s.invoice_no}`,
    submitLabel: 'Download PDF',
    extraFooter: `${owed(s) > 0 ? `<button type="button" class="btn btn-soft" data-act="pay" data-id="${s.id}">${icon('wallet')}Record payment</button>` : ''}
      ${canShareFiles() ? `<button type="button" class="btn btn-ghost" data-act="inv-share" data-id="${s.id}">${icon('share')}Send</button>` : ''}`,
    body: `
      <div class="inv-meta">
        <div><small>Customer</small><strong>${esc(s.customer_name)}</strong>
          ${s.customer_address ? `<span>${esc(s.customer_address)}</span>` : ''}${s.customer_phone ? `<span>${esc(s.customer_phone)}</span>` : ''}</div>
        <div><small>Date</small><strong>${fmtDateTime(s.created_at)}</strong><span class="badge ${tone}">${label} · ${esc(s.payment_method)}</span></div>
      </div>
      <ul class="confirm-list">${s.items.map((l) => `<li><span>${l.qty} × ${esc(l.item_name)} <small class="muted">@ ${fmtMoney2(l.unit_price)}</small></span><b>${fmtMoney2(l.line_total)}</b></li>`).join('')}</ul>
      <div class="inv-totals">
        <div><span>Total</span><strong>${fmtMoney2(s.total)}</strong></div>
        <div><span>Paid</span><strong class="ok">${fmtMoney2(s.amount_paid)}</strong></div>
        <div><span>Outstanding</span><strong class="${owed(s) > 0 ? 'bad' : ''}">${fmtMoney2(owed(s))}</strong></div>
      </div>
      ${s.payments.length ? `<div><p class="eyebrow">Payments received</p><ul class="pay-hist">${s.payments.map((p) => `<li><span>${fmtDateTime(p.created_at)} · ${esc(p.method)}${p.note ? ` · ${esc(p.note)}` : ''}</span><b>${fmtMoney2(p.amount)}</b></li>`).join('')}</ul></div>` : ''}`,
    onSubmit: async () => { downloadInvoice(s); return false; },
  });
}

function paymentModal(s) {
  const due = owed(s);
  const form = openModal({
    title: 'Record a payment',
    submitLabel: 'Save payment',
    body: `
      <div class="adj-head"><div><strong>${esc(s.customer_name)}</strong><br><small class="muted">Invoice ${esc(s.invoice_no)} · ${fmtDate(s.created_at)}</small></div>
        <div class="adj-now"><span>Total <b>${fmtMoney2(s.total)}</b></span><span>Owed <b class="owed-amt">${fmtMoney2(due)}</b></span></div></div>
      <label class="field"><span>Amount received</span>
        <div class="money-input"><b>${esc(currencySymbol())}</b><input name="amount" type="number" min="0.01" max="${due}" step="0.01" inputmode="decimal" required value="${due.toFixed(2)}"></div></label>
      <div class="quick-amts"><button type="button" class="btn btn-sm btn-soft" data-fill="${due}">Full balance ${fmtMoney2(due)}</button>
        ${due >= 2 ? `<button type="button" class="btn btn-sm btn-ghost" data-fill="${round2(due / 2)}">Half ${fmtMoney2(due / 2)}</button>` : ''}</div>
      <fieldset class="field"><legend>Mode of payment</legend>
        <div class="seg seg-3">${PAY_METHODS.map(([m, ic], i) => `<label><input type="radio" name="method" value="${m}" ${i === 0 ? 'checked' : ''}><span>${icon(ic)}${m}</span></label>`).join('')}</div></fieldset>
      <label class="field"><span>Note <small>(optional)</small></span><input name="note" maxlength="120" placeholder="e.g. Paid by his son"></label>
      <p class="adj-preview" id="pay-preview"></p>`,
    onSubmit: async (fd) => {
      const amount = round2(fd.get('amount'));
      if (!(amount > 0) || amount > due) { toast(`Enter an amount between ${fmtMoney2(0.01)} and ${fmtMoney2(due)}`, 'error'); return false; }
      const { error } = await sb.rpc('add_payment', { p_sale: s.id, p_amount: amount, p_method: fd.get('method'), p_note: String(fd.get('note') || '').trim() || null });
      if (error) { toast(niceError(error), 'error'); return false; }
      toast(amount >= due ? `${s.invoice_no} is now paid in full` : `${fmtMoney2(amount)} recorded · ${fmtMoney2(due - amount)} still owed`);
      await refresh();
    },
  });
  const amt = form.elements.namedItem('amount'), prev = $('#pay-preview', form);
  const upd = () => {
    const v = round2(amt.value || 0), bad = !(v > 0) || v > due;
    prev.classList.toggle('error', bad);
    prev.textContent = bad ? `Enter between ${fmtMoney2(0.01)} and ${fmtMoney2(due)}` : v >= due ? 'This clears the invoice — it will move out of Not Fully Paid.' : `After this: ${fmtMoney2(due - v)} still owed`;
    form.querySelector('[type=submit]').disabled = bad;
  };
  amt.addEventListener('input', upd);
  $$('[data-fill]', form).forEach((b) => b.addEventListener('click', () => { amt.value = Number(b.dataset.fill).toFixed(2); upd(); }));
  upd();
}

function shopModal() {
  const s = state.shop || {};
  openModal({
    title: 'Invoice details',
    submitLabel: 'Save details',
    body: `<p class="confirm-text">These details are printed at the top and bottom of every invoice.</p>
      <div class="form-grid">
        <label class="field span-2"><span>Shop name</span><input name="shop_name" required maxlength="60" value="${esc(s.shop_name || 'AKASH SHOP C1')}"></label>
        <label class="field span-2"><span>Address</span><textarea name="address" rows="2" maxlength="200">${esc(s.address || '')}</textarea></label>
        <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="30" value="${esc(s.phone || '')}"></label>
        <label class="field"><span>Email</span><input name="email" type="email" maxlength="80" value="${esc(s.email || '')}"></label>
        <label class="field span-2"><span>Message at the bottom</span><input name="footer_note" required maxlength="80" value="${esc(s.footer_note || 'Thanks For Shopping With Us')}"></label>
      </div>`,
    onSubmit: async (fd) => {
      const payload = {};
      for (const k of ['shop_name', 'address', 'phone', 'email', 'footer_note']) payload[k] = String(fd.get(k) || '').trim() || null;
      payload.shop_name ||= 'AKASH SHOP C1';
      payload.footer_note ||= 'Thanks For Shopping With Us';
      const { error } = await sb.from('shop_settings').update(payload).eq('id', 1);
      if (error) { toast(niceError(error), 'error'); return false; }
      toast('Invoice details saved');
      await refresh();
    },
  });
}

function customersModal() {
  const list = state.customers;
  const form = openModal({
    title: 'Frequent customers',
    submitLabel: 'Add customer',
    body: `<p class="confirm-text">Saved customers appear in the <b>Frequent customer</b> drop-down on the sales counter.</p>
      <div class="form-grid">
        <label class="field span-2"><span>Name *</span><input name="name" required maxlength="80" placeholder="e.g. Ravi Patel"></label>
        <label class="field"><span>Contact number</span><input name="phone" type="tel" maxlength="30"></label>
        <label class="field"><span>Address</span><input name="address" maxlength="200"></label>
      </div>
      <div><p class="eyebrow">${list.length} saved</p>
      ${list.length ? `<ul class="cust-list">${list.map((c) => `<li><span class="owe-avatar sm">${esc(c.name.charAt(0).toUpperCase())}</span>
        <div><strong>${esc(c.name)}</strong><small>${esc([c.phone, c.address].filter(Boolean).join(' · ') || 'No details')}</small></div>
        <button type="button" class="btn btn-sm btn-danger-ghost" data-cdel="${c.id}">Remove</button></li>`).join('')}</ul>`
        : '<p class="muted">No frequent customers yet.</p>'}</div>`,
    onSubmit: async (fd) => {
      const payload = { name: String(fd.get('name')).trim(), phone: String(fd.get('phone') || '').trim() || null, address: String(fd.get('address') || '').trim() || null };
      if (!payload.name) return false;
      const { error } = await sb.from('customers').insert(payload);
      if (error) { toast(error.code === '23505' ? 'A customer with that name already exists' : niceError(error), 'error'); return false; }
      toast(`${payload.name} saved as a frequent customer`);
      await loadAll();
      customersModal();
      return false;
    },
  });
  $$('[data-cdel]', form).forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; return; }
    const { error } = await sb.from('customers').delete().eq('id', b.dataset.cdel);
    if (error) { toast(niceError(error), 'error'); return; }
    toast('Customer removed (their past invoices are kept)');
    await loadAll();
    customersModal();
  }));
}

/* =====================================================================
   DATA HELPERS — load every row (Supabase returns 1,000 rows per request)
===================================================================== */
async function fetchAll(table, cols = '*', order = 'id', ascending = true) {
  const out = [], size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(cols).order(order, { ascending });
    if (order !== 'id') q = q.order('id', { ascending });
    const { data, error } = await q.range(from, from + size - 1);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < size) return { data: out, error: null };
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLong = (d) => d.toLocaleDateString(CONFIG.LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDay = (d) => d.toLocaleDateString(CONFIG.LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

/* =====================================================================
   TOP-BAR MENUS
===================================================================== */
let openMenuEl = null;
function closeMenu() {
  if (!openMenuEl) return;
  openMenuEl.anchor.setAttribute('aria-expanded', 'false');
  openMenuEl.el.remove();
  openMenuEl = null;
}
function toggleMenu(anchor, name, entries) {
  const same = openMenuEl?.name === name;
  closeMenu();
  if (same) return;
  const el = document.createElement('div');
  el.className = 'menu'; el.setAttribute('role', 'menu');
  el.innerHTML = entries.map((x) => `<button role="menuitem" data-act="${x.act}">${icon(x.icon)}<span><strong>${esc(x.label)}</strong><small>${esc(x.sub)}</small></span></button>`).join('');
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = `${r.bottom + 8}px`;
  el.style.left = `${Math.max(8, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 8))}px`;
  anchor.setAttribute('aria-expanded', 'true');
  openMenuEl = { el, anchor, name };
  el.querySelector('button')?.focus();
}

/* =====================================================================
   INVENTORY PDF EXPORT
===================================================================== */
function exportInventoryPdf() {
  try {
    const mk = (i) => ({
      name: i.name, sku: i.sku, category: i.category, notes: i.notes,
      shop_qty: i.shop_qty, warehouse_qty: i.warehouse_qty, threshold: i.low_stock_threshold,
      price: i.unit_price, value: value(i), status: statusOf(i), flagged: i.flagged_out_of_stock,
      shopTxt: fmtNum(i.shop_qty), whTxt: fmtNum(i.warehouse_qty), totalTxt: fmtNum(total(i)),
    });
    const group = (name, color, list) => {
      const items = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      const units = items.reduce((a, i) => a + total(i), 0);
      return { name, color: safeColor(color), items: items.map(mk), count: items.length, units, unitsTxt: fmtNum(units), value: items.reduce((a, i) => a + value(i), 0) };
    };
    const groups = state.brands.map((b) => group(b.name, b.color, itemsFor(b.id))).filter((g) => g.count);
    if (itemsFor('none').length) groups.push(group(UNBRANDED.name, UNBRANDED.color, itemsFor('none')));
    const s = summarize(state.items);
    const summary = { ...s, brands: state.brands.length, shopTxt: fmtNum(s.shop), whTxt: fmtNum(s.wh), unitsTxt: fmtNum(s.units), shopPct: s.units ? Math.round((s.shop / s.units) * 100) : 0 };
    const now = new Date();
    const bytes = buildInventoryPdf({ shop: state.shop || {}, groups, summary, money: pdfMoney, generated: fmtDateTime(now.toISOString()) });
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `AKASH-SHOP-C1-Inventory-${ymd(now)}.pdf`);
    toast(`Inventory PDF downloaded (${s.count} items)`);
  } catch (e) {
    toast('Could not create the PDF: ' + (e.message || e), 'error');
  }
}

/* =====================================================================
   BACKUP & RESTORE  (one .json file holds everything)
===================================================================== */
const BACKUP_TABLES = ['brands', 'items', 'customers', 'sales', 'sale_items', 'sale_payments', 'stock_movements', 'shop_settings'];
const BACKUP_LABELS = { brands: 'Brand tabs', items: 'Items', customers: 'Frequent customers', sales: 'Invoices', sale_items: 'Invoice lines', sale_payments: 'Payments', stock_movements: 'Stock history lines', shop_settings: 'Invoice details' };
const LAST_BACKUP_KEY = 'c1-last-backup';

function lastBackupText() {
  let t = null;
  try { t = localStorage.getItem(LAST_BACKUP_KEY); } catch { /* private mode */ }
  if (!t) return 'Download a file with everything';
  return `Last backup on this device: ${timeAgo(t)}`;
}

async function createBackup(reason = 'manual') {
  const data = {};
  for (const t of BACKUP_TABLES) {
    const { data: rows, error } = await fetchAll(t, '*', 'id', true);
    if (error) {
      if (state.salesError && t !== 'brands' && t !== 'items' && t !== 'stock_movements') { data[t] = []; continue; }
      throw error;
    }
    data[t] = rows;
  }
  const now = new Date();
  const file = {
    app: 'AKASH SHOP C1 Inventory Tracker',
    format: 'akash-shop-c1-backup',
    version: 1,
    created_at: now.toISOString(),
    created_by: state.user?.email || null,
    reason,
    counts: Object.fromEntries(BACKUP_TABLES.map((t) => [t, data[t].length])),
    data,
  };
  const stamp = `${ymd(now)}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }),
    `AKASH-SHOP-C1-backup-${stamp}${reason === 'before-restore' ? '-before-restore' : ''}.json`);
  try { localStorage.setItem(LAST_BACKUP_KEY, now.toISOString()); } catch { /* private mode */ }
  return file;
}

async function createBackupNow() {
  toast('Creating backup…');
  try {
    const f = await createBackup();
    toast(`Backup downloaded: ${f.counts.items} items, ${f.counts.sales} invoices. Keep the file somewhere safe.`);
  } catch (e) {
    toast('Backup failed: ' + niceError(e), 'error');
  }
}

function restoreModal() {
  let parsed = null;
  const form = openModal({
    title: 'Restore a backup',
    submitLabel: 'Restore backup',
    danger: true,
    body: `
      <p class="confirm-text">Choose a backup file (<b>.json</b>) made with <b>Create backup</b>. Everything in the tracker will be put back exactly as it was in that file.</p>
      <label class="file-drop" id="file-drop">
        <input type="file" name="file" accept=".json,application/json" aria-label="Backup file">
        ${icon('upload')}<strong id="file-name">Choose backup file</strong><small>or drag it here</small>
      </label>
      <div id="bk-preview"></div>
      <label class="check"><input type="checkbox" name="safety" checked><span><strong>Download a backup of the current data first</strong><small>Recommended, so you can undo this if you picked the wrong file.</small></span></label>
      <label class="check danger-check"><input type="checkbox" name="confirm"><span><strong>I understand that everything now in the tracker will be replaced</strong><small>Logins and staff access are not affected.</small></span></label>`,
    onSubmit: async (fd) => {
      if (!parsed) { toast('Choose a backup file first', 'error'); return false; }
      if (fd.get('confirm') !== 'on') { toast('Tick the box to confirm the restore', 'error'); return false; }
      if (fd.get('safety') === 'on') {
        try { await createBackup('before-restore'); } catch (e) { toast('Could not make the safety backup: ' + niceError(e), 'error'); return false; }
      }
      const { data, error } = await sb.rpc('restore_backup', { p: parsed });
      if (error) {
        const missing = /restore_backup/.test(error.message || '') && /(find|exist)/i.test(error.message || '');
        toast(missing ? 'Run supabase/backup.sql in Supabase first, then try again.' : niceError(error), 'error');
        return false;
      }
      state.lastRoute = '';
      await loadAll();
      if (location.hash !== '#/dashboard') location.hash = '#/dashboard'; else render();
      toast(`Backup restored: ${data.items} items, ${data.invoices} invoices, ${data.customers} customers`);
    },
  });
  const submit = form.querySelector('[type=submit]');
  const input = form.elements.namedItem('file');
  const confirm = form.elements.namedItem('confirm');
  const sync = () => { submit.disabled = !parsed || !confirm.checked; };
  confirm.addEventListener('change', sync);
  sync();
  const drop = $('#file-drop', form);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.add('over')));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  input.addEventListener('change', async () => {
    parsed = null; sync();
    const f = input.files?.[0];
    const prev = $('#bk-preview', form);
    if (!f) { prev.innerHTML = ''; return; }
    $('#file-name', form).textContent = f.name;
    try {
      const j = JSON.parse(await f.text());
      if (j?.format !== 'akash-shop-c1-backup' || !j.data) throw new Error('This file is not an AKASH SHOP C1 backup.');
      if (Number(j.version) > 1) throw new Error('This backup was made by a newer version of the app.');
      parsed = j;
      const now = { brands: state.brands.length, items: state.items.length, customers: state.customers.length, sales: state.sales.length, sale_payments: state.payments.length };
      const rows = ['brands', 'items', 'sales', 'sale_payments', 'customers', 'stock_movements'].map((t) =>
        `<li><span>${BACKUP_LABELS[t]}</span><b>${fmtNum((j.data[t] || []).length)}</b>${t in now ? `<small>now ${fmtNum(now[t])}</small>` : '<small></small>'}</li>`).join('');
      prev.innerHTML = `<div class="bk-card">
        <div class="bk-head">${icon('database')}<div><strong>Backup from ${esc(fmtDateTime(j.created_at))}</strong><small>${esc(timeAgo(j.created_at))}${j.created_by ? ' · made by ' + esc(j.created_by) : ''}</small></div></div>
        <ul class="bk-counts">${rows}</ul></div>`;
    } catch (e) {
      prev.innerHTML = `<p class="adj-preview error">${esc(e instanceof SyntaxError ? 'This file could not be read. Choose a .json backup made by this app.' : e.message)}</p>`;
    }
    sync();
  });
}

/* =====================================================================
   SALES TRACKER
===================================================================== */
const isAtSale = (p) => Math.abs(new Date(p.created_at) - new Date(p.sale.created_at)) < 5000;
const pdfMoneyShort = (n) => { const s = fmtMoneyShort(n); return winAnsiSafe(s) ? s : new Intl.NumberFormat(CONFIG.LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n); };

function trackerDefault() {
  const today = new Date();
  return { start: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), end: ymd(today), month: ymd(today).slice(0, 7), picking: false, preset: 'month' };
}

function salesReportData(s, e) {
  const start = fromYmd(s), last = fromYmd(e), endEx = addDays(last, 1);
  const t0 = start.getTime(), t1 = endEx.getTime();
  const days = Math.max(1, Math.round((t1 - t0) / 864e5));
  const inRange = (iso) => { const t = new Date(iso).getTime(); return t >= t0 && t < t1; };
  const pays = state.payments.filter((p) => inRange(p.created_at));
  const total = round2(pays.reduce((a, p) => a + p.amount, 0));
  const unit = days === 1 ? 'hour' : days <= 92 ? 'day' : 'month';

  // series
  let series = [];
  if (unit === 'hour') {
    const h = Array(24).fill(0), c = Array(24).fill(0);
    for (const p of pays) { const x = new Date(p.created_at).getHours(); h[x] += p.amount; c[x]++; }
    const used = h.map((v, i) => (c[i] ? i : null)).filter((x) => x != null);
    const from = Math.min(8, ...used), to = Math.max(20, ...used);
    for (let i = from; i <= to; i++) series.push({ key: i, label: `${pad2(i)}:00`, short: `${pad2(i)}:00`, long: `${pad2(i)}:00–${pad2(i + 1 === 24 ? 0 : i + 1)}:00`, value: round2(h[i]), count: c[i] });
  } else if (unit === 'day') {
    const map = {};
    for (const p of pays) { const k = ymd(new Date(p.created_at)); (map[k] ||= { v: 0, c: 0 }); map[k].v += p.amount; map[k].c++; }
    for (let d = new Date(start); d < endEx; d = addDays(d, 1)) {
      const k = ymd(d);
      series.push({ key: k, label: fmtDay(d), short: d.toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short' }), long: fmtDay(d), value: round2(map[k]?.v || 0), count: map[k]?.c || 0 });
    }
  } else {
    const map = {};
    for (const p of pays) { const dt = new Date(p.created_at); const k = `${dt.getFullYear()}-${dt.getMonth()}`; (map[k] ||= { v: 0, c: 0 }); map[k].v += p.amount; map[k].c++; }
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d < endEx; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      series.push({ key: k, label: d.toLocaleDateString(CONFIG.LOCALE, { month: 'short', year: 'numeric' }), short: d.toLocaleDateString(CONFIG.LOCALE, { month: 'short', year: '2-digit' }), long: d.toLocaleDateString(CONFIG.LOCALE, { month: 'long', year: 'numeric' }), value: round2(map[k]?.v || 0), count: map[k]?.c || 0 });
    }
  }
  let best = null;
  series.forEach((p) => { if (p.value > 0 && (!best || p.value > best.value)) best = p; });
  if (best) best.best = true;

  const methods = PAY_METHODS.map(([m]) => {
    const list = pays.filter((p) => p.method === m);
    return { name: m, amount: round2(list.reduce((a, p) => a + p.amount, 0)), count: list.length };
  });
  const issued = state.sales.filter((x) => inRange(x.created_at));
  const earlierPays = pays.filter((p) => new Date(p.sale.created_at).getTime() < t0);
  const items = {};
  for (const x of issued) for (const l of x.items) {
    const it = (items[l.item_name] ||= { name: l.item_name, units: 0, value: 0 });
    it.units += l.qty; it.value = round2(it.value + l.line_total);
  }
  const topItems = Object.values(items).sort((a, b) => b.value - a.value || b.units - a.units);

  // statement timeline
  const events = pays.map((p) => {
    const x = p.sale, atSale = isAtSale(p), left = round2(x.total - p.amount);
    return {
      at: p.created_at, ref: x.invoice_no, method: p.method, amount: p.amount,
      details: atSale
        ? `${x.customer_name} · Sale · ${unitsOf(x)} unit${unitsOf(x) === 1 ? '' : 's'}${left > 0 ? ` · ${pdfMoney(left)} on credit` : ''}`
        : `${x.customer_name} · Payment towards ${x.invoice_no} (${fmtDate(x.created_at)})`,
    };
  });
  for (const x of issued) {
    if (!x.payments.some((p) => isAtSale({ ...p, sale: x }))) {
      events.push({ at: x.created_at, ref: x.invoice_no, method: null, amount: null, details: `${x.customer_name} · Sale on credit · ${unitsOf(x)} unit${unitsOf(x) === 1 ? '' : 's'} · ${pdfMoney(x.total)} owed` });
    }
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  const dayMap = new Map();
  for (const ev of events) {
    const d = new Date(ev.at), k = ymd(d);
    if (!dayMap.has(k)) dayMap.set(k, { label: fmtLong(d), total: 0, rows: [] });
    const g = dayMap.get(k);
    g.rows.push({ ...ev, time: fmtTime(ev.at) });
    if (ev.amount != null) g.total = round2(g.total + ev.amount);
  }

  const label = days === 1 ? start.toLocaleDateString(CONFIG.LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : `${fmtDate(start)} – ${fmtDate(last)}`;
  return {
    start, last, days, unit, total, count: pays.length, pays, series, best,
    bestTitle: unit === 'hour' ? 'BUSIEST HOUR' : unit === 'month' ? 'BEST MONTH' : 'BEST DAY',
    bestText: best ? (unit === 'hour' ? best.long : best.long) : '—',
    avgPerDay: round2(total / days), methods,
    issuedCount: issued.length, issuedValue: round2(issued.reduce((a, x) => a + x.total, 0)),
    units: issued.reduce((a, x) => a + unitsOf(x), 0), lineCount: issued.reduce((a, x) => a + x.items.length, 0),
    earlier: round2(earlierPays.reduce((a, p) => a + p.amount, 0)), earlierCount: earlierPays.length,
    stillOwed: round2(issued.reduce((a, x) => a + owed(x), 0)),
    topItems, timeline: [...dayMap.values()], creditRows: events.some((ev) => ev.amount == null) || pays.some((p) => isAtSale(p) && p.sale.total - p.amount > 0.004),
    label, rangeText: days === 1 ? fmtLong(start) : `${days} days · ${fmtDate(start)} – ${fmtDate(last)}`,
  };
}

function downloadSalesReport() {
  const t = state.tracker || (state.tracker = trackerDefault());
  try {
    const r = salesReportData(t.start, t.end);
    const data = { ...r, shop: state.shop || {}, money: pdfMoney, moneyShort: pdfMoneyShort, generated: fmtDateTime(new Date().toISOString()),
      best: r.best ? { label: r.best.label, amount: r.best.value } : null };
    const bytes = buildSalesReportPdf(data);
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `AKASH-SHOP-C1-Sales-Report-${t.start}${t.start !== t.end ? '-to-' + t.end : ''}.pdf`);
    toast(`Sales report downloaded · ${r.label}`);
  } catch (e) {
    toast('Could not create the report: ' + (e.message || e), 'error');
  }
}

/* ----- calendar ----- */
function shiftMonth(n) {
  const t = state.tracker;
  const [y, m] = t.month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  t.month = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  renderTracker();
}
function pickDay(day) {
  const t = state.tracker;
  if (!t.picking) { t.start = t.end = day; t.picking = true; }
  else {
    if (day < t.start) { t.end = t.start; t.start = day; } else t.end = day;
    t.picking = false;
  }
  t.preset = null;
  renderTracker();
}
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['all', 'All time']];
function applyPreset(k) {
  const t = state.tracker, today = dayStart();
  let a = today, b = today;
  if (k === 'yesterday') a = b = addDays(today, -1);
  if (k === '7d') a = addDays(today, -6);
  if (k === '30d') a = addDays(today, -29);
  if (k === 'month') a = new Date(today.getFullYear(), today.getMonth(), 1);
  if (k === 'lastmonth') { a = new Date(today.getFullYear(), today.getMonth() - 1, 1); b = new Date(today.getFullYear(), today.getMonth(), 0); }
  if (k === 'year') a = new Date(today.getFullYear(), 0, 1);
  if (k === 'all') { const first = state.payments[0] || state.sales[state.sales.length - 1]; a = first ? dayStart(new Date(first.created_at)) : today; }
  t.start = ymd(a); t.end = ymd(b); t.month = t.end.slice(0, 7); t.picking = false; t.preset = k;
  renderTracker();
}

function calendarHtml(t) {
  const [y, m] = t.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const gridStart = addDays(first, -lead);
  const today = ymd(new Date());
  const totals = {};
  for (const p of state.payments) { const k = ymd(new Date(p.created_at)); totals[k] = (totals[k] || 0) + p.amount; }
  const monthMax = Math.max(0, ...Object.entries(totals).filter(([k]) => k.startsWith(t.month)).map(([, v]) => v));
  const wk = [];
  for (let i = 0; i < 7; i++) wk.push(addDays(new Date(2024, 0, 1), i).toLocaleDateString(CONFIG.LOCALE, { weekday: 'narrow' }));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i), k = ymd(d);
    if (i >= 35 && d.getMonth() !== m - 1) break;
    const v = totals[k] || 0;
    const lv = !v ? 0 : monthMax ? Math.min(4, Math.ceil((v / monthMax) * 4)) : 1;
    const cls = ['cal-day', `lv${lv}`];
    if (d.getMonth() !== m - 1) cls.push('other');
    if (k === today) cls.push('today');
    if (k >= t.start && k <= t.end) cls.push('in');
    if (k === t.start) cls.push('first');
    if (k === t.end) cls.push('last');
    const future = k > today;
    cells += `<button class="${cls.join(' ')}" data-act="cal-day" data-day="${k}" ${future ? 'disabled' : ''} title="${esc(fmtLong(d))}${v ? ' · ' + esc(fmtMoney2(v)) : ''}">
      <span>${d.getDate()}</span>${v ? '<i></i>' : ''}</button>`;
  }
  return `<div class="cal">
    <div class="cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="Previous month">${icon('left')}</button>
      <strong>${first.toLocaleDateString(CONFIG.LOCALE, { month: 'long', year: 'numeric' })}</strong>
      <button class="icon-btn" data-act="cal-next" aria-label="Next month">${icon('right')}</button>
    </div>
    <div class="cal-grid">${wk.map((w) => `<span class="cal-wk">${w}</span>`).join('')}${cells}</div>
    <div class="cal-legend"><span>Less</span><i class="lv0"></i><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i><i class="lv4"></i><span>More sales</span></div>
  </div>`;
}

function renderTracker() {
  destroyCharts();
  state.scope = null;
  const t = state.tracker || (state.tracker = trackerDefault());
  const head = `<section class="page-head">
    <div><p class="eyebrow">Sales</p><h1>Sales Tracker</h1></div>
    <div class="head-actions"><button class="btn btn-accent" data-act="report">${icon('pdf')}Generate Sales Report</button></div></section>`;
  if (state.salesError) { $('#main').innerHTML = head + salesSetupNotice(); return; }
  const r = salesReportData(t.start, t.end);
  const recent = r.pays.slice(-8).reverse();
  const pct = (a) => (r.total ? Math.round((a / r.total) * 100) : 0);
  const mColor = { Cash: 'var(--ok)', Card: 'var(--sky)', 'Bank transfer': '#8b5cf6' };

  $('#main').innerHTML = head + `
    <section class="tracker-top">
      <article class="card cal-card">
        <div class="chips presets">${PRESETS.map(([k, l]) => `<button class="chip ${t.preset === k ? 'on' : ''}" data-act="cal-preset" data-preset="${k}">${l}</button>`).join('')}</div>
        ${calendarHtml(t)}
        <div class="cal-sel">
          <div><small>${t.picking ? 'Start day chosen. Now tap the last day' : 'Selected'}</small><strong>${esc(r.label)}</strong><span class="muted">${r.days} day${r.days === 1 ? '' : 's'}</span></div>
          <button class="btn btn-primary" data-act="report">${icon('download')}Generate Sales Report</button>
        </div>
      </article>
      <div class="tracker-side">
        <article class="tk-hero">
          <small>${r.days === 1 ? 'Sales on this day' : 'Total sales in this period'}</small>
          <strong class="tk-total" data-count="${r.total}">${fmtMoney2(r.total)}</strong>
          <span>Money received · ${esc(r.rangeText)}</span>
          <div class="tk-mini">
            <div><small>Transactions</small><b>${fmtNum(r.count)}</b></div>
            <div><small>${r.days === 1 ? 'Average sale' : 'Average per day'}</small><b>${fmtMoney2(r.days === 1 ? (r.count ? r.total / r.count : 0) : r.avgPerDay)}</b></div>
            <div><small>${r.unit === 'hour' ? 'Busiest hour' : r.unit === 'month' ? 'Best month' : 'Best day'}</small><b>${r.best ? esc(r.best.label) : '—'}</b>${r.best ? `<em>${fmtMoney2(r.best.value)}</em>` : ''}</div>
          </div>
        </article>
        <section class="kpis tk-kpis">
          ${kpi('Invoices issued', fmtNum(r.issuedCount), 'receipt', '', `${fmtMoney2(r.issuedValue)} invoiced`)}
          ${kpi('Units sold', fmtNum(r.units), 'box', '', `${r.lineCount} item line${r.lineCount === 1 ? '' : 's'}`)}
          ${kpi('From earlier invoices', fmtMoney2(r.earlier), 'history', 'ok', `${r.earlierCount} payment${r.earlierCount === 1 ? '' : 's'} on old balances`)}
          ${kpi('Still owed', fmtMoney2(r.stillOwed), 'wallet', r.stillOwed > 0 ? 'bad' : 'ok', 'On invoices from this period')}
        </section>
      </div>
    </section>
    <article class="card">
      <header class="card-head"><div><h3>Sales over time</h3><p>Money received ${r.unit === 'hour' ? 'each hour' : r.unit === 'month' ? 'each month' : 'each day'} · ${esc(r.label)}</p></div>
        <span class="count">${fmtMoney2(r.total)}</span></header>
      <div class="chart-box tk-chart"><canvas id="ch-tracker"></canvas></div>
    </article>
    <section class="grid">
      <article class="card">
        <header class="card-head"><div><h3>How customers paid</h3><p>${r.count} payment${r.count === 1 ? '' : 's'}</p></div></header>
        <ul class="mbars">${r.methods.map((m) => `<li><div><strong>${m.name}</strong><span>${fmtMoney2(m.amount)} · ${pct(m.amount)}%</span></div>
          <div class="mbar"><i style="width:${pct(m.amount)}%;background:${mColor[m.name]}"></i></div><small>${m.count} payment${m.count === 1 ? '' : 's'}</small></li>`).join('')}</ul>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Best sellers</h3><p>From invoices in this period</p></div></header>
        ${r.topItems.length ? `<ol class="best">${r.topItems.slice(0, 6).map((x) => `<li><span class="b-name">${esc(x.name)}</span><span class="b-u">${fmtNum(x.units)} units</span><b>${fmtMoney2(x.value)}</b></li>`).join('')}</ol>`
          : `<div class="empty-mini">${icon('box')}<span>No items sold in this period</span></div>`}
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Latest money in</h3><p>Full statement is in the PDF report</p></div></header>
        ${recent.length ? `<ul class="feed">${recent.map((p) => `<li><span class="feed-chip in">+${fmtMoney2(p.amount)}</span>
          <div><strong>${esc(p.sale.customer_name)}</strong><small>${esc(p.sale.invoice_no)} · ${esc(p.method)}${isAtSale(p) ? '' : ' · later payment'}</small></div>
          <time datetime="${esc(p.created_at)}">${r.days === 1 ? fmtTime(p.created_at) : fmtDate(p.created_at)}</time></li>`).join('')}</ul>`
          : `<div class="empty-mini">${icon('activity')}<span>No money received in this period</span></div>`}
      </article>
    </section>
    <p class="tk-note">${icon('alert')}Sales are counted on the day the money is received. A sale on credit counts only when the customer pays.</p>`;

  drawTracker(r);
  countUp($('.tk-total'), r.total);
}

function countUp(el, target) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || !(target > 0)) return;
  const t0 = performance.now(), dur = 900;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtMoney2(target * e);
    if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = fmtMoney2(target);
  };
  requestAnimationFrame(step);
}

function drawTracker(r) {
  const c = colors(); chartDefaults(c);
  const n = r.series.length;
  const delayEach = Math.min(60, 900 / Math.max(n, 1));
  const animation = { duration: 900, easing: 'easeOutQuart', delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? Math.round(ctx.dataIndex * delayEach) : 0) };
  const bars = r.unit === 'hour' || n <= 3;
  const tooltip = { callbacks: {
    title: (it) => r.series[it[0].dataIndex].long,
    label: (x) => ` Sales: ${fmtMoney2(x.raw)}`,
    footer: (it) => { const k = r.series[it[0].dataIndex].count; return `${k} payment${k === 1 ? '' : 's'}`; },
  } };
  const scales = {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
    y: { beginAtZero: true, ticks: { callback: (v) => fmtMoneyShort(v) }, title: { display: true, text: 'Amount' } },
  };
  if (bars) {
    mkChart('ch-tracker', {
      type: 'bar',
      data: { labels: r.series.map((p) => p.label), datasets: [{ label: 'Sales', data: r.series.map((p) => p.value),
        backgroundColor: r.series.map((p) => (p.best ? '#f59e0b' : c.sky)), borderRadius: 6, maxBarThickness: 34 }] },
      options: { responsive: true, maintainAspectRatio: false, animation, scales, plugins: { legend: { display: false }, tooltip } },
    });
    return;
  }
  mkChart('ch-tracker', {
    type: 'line',
    data: { labels: r.series.map((p) => p.label), datasets: [{
      label: 'Sales', data: r.series.map((p) => p.value), fill: true, tension: 0.35, borderWidth: 3, borderColor: c.sky,
      backgroundColor: (ctx) => {
        const { chart } = ctx; const area = chart.chartArea;
        if (!area) return 'rgba(11,132,214,.12)';
        const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, 'rgba(11,132,214,.35)'); g.addColorStop(1, 'rgba(11,132,214,0)');
        return g;
      },
      pointRadius: r.series.map((p) => (p.best ? 6 : n > 45 ? 0 : 3)),
      pointHoverRadius: 7,
      pointBackgroundColor: r.series.map((p) => (p.best ? '#f59e0b' : c.surface)),
      pointBorderColor: r.series.map((p) => (p.best ? '#f59e0b' : c.sky)),
      pointBorderWidth: 2,
    }] },
    options: { responsive: true, maintainAspectRatio: false, animation, interaction: { mode: 'index', intersect: false }, scales, plugins: { legend: { display: false }, tooltip } },
  });
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
