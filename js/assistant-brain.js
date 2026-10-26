/* =====================================================================
   AI Shop Assistant · the brain
   ---------------------------------------------------------------------
   Turns a sentence into an answer or an action. It reads the shop's
   live data through `ctx` and never changes anything without asking
   "Shall I go ahead?" first.

   The engine is swappable: `understand()` returns a plain intent object,
   so a cloud model (for example Claude) can later produce the same
   object and every handler below keeps working.
===================================================================== */
import * as N from './assistant-nlu.js';
import { PACKS, formatters } from './assistant-lang.js';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (a, k) => !!a.concepts[k];

/* example sentences used to make a best guess when nothing else fits */
const EXAMPLES = {
  sales: ['sales today', 'how much did we sell', 'takings', 'aaj ki sale', 'kitni sale hui', 'money came in', 'revenue'],
  summary: ['summary of the day', 'overview', 'how is business', 'how was the day', 'khulasa', 'hisaab', 'brief me'],
  stock: ['how many do i have', 'stock of', 'kitne bache hain', 'is it available', 'in the warehouse', 'in the shop'],
  low: ['what is running low', 'what needs reordering', 'out of stock', 'kya khatam hai', 'what is finished'],
  debts: ['who owes money', 'udhaar', 'who owes the most', 'outstanding balances', 'unpaid', 'credit list'],
  balance: ['customer balance', 'how much does he owe', 'his balance', 'baqaya'],
  invoice: ['last invoice', 'what did he buy', 'bill', 'receipt', 'read the items'],
  payment: ['paid', 'received payment', 'he gave money', 'jama karo', 'record a payment'],
  adjust: ['received delivery', 'add to stock', 'move to shop', 'damaged', 'stock in', 'maal aaya'],
  pos: ['start a sale', 'new sale', 'open the counter', 'sell', 'customer wants'],
  report: ['sales report', 'pdf report', 'download report', 'statement'],
  help: ['help', 'what can you do', 'how do i use you', 'options'],
};
const EX_SK = Object.fromEntries(Object.entries(EXAMPLES).map(([k, l]) => [k, l.map((s) => N.tokenize(s).map((t) => t.k).filter((x) => x.length >= 2))]));

export function createBrain(ctx) {
  const S = { pending: null, last: null, lastReply: null, undo: [], queue: [], checkout: null };
  let IX = null, IXstamp = null;

  /* ------------------------------------------------------------------
     language
  ------------------------------------------------------------------ */
  const lang = () => ctx.lang();
  const settings = () => ctx.settings();
  const pack = () => PACKS[lang()] || PACKS.en;
  const F = (voice = false, L = lang()) => formatters(L, { ...settings(), voice });
  const clean = (s) => String(s).replace(/^• /gm, '').replace(/\n+/g, ' ').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  function T(key, p = {}) {
    const L = lang();
    const fn = pack()[key] ?? PACKS.en[key];
    const run = (f, P) => (typeof f === 'function' ? f(p, P) : String(f ?? ''));
    const text = run(fn, F(false));
    const say = clean(run(fn, F(true)));
    const alt = L === 'ur' ? clean(run(PACKS.hi[key] ?? PACKS.en[key], F(true, 'hi'))) : null;
    return { text, say, alt };
  }
  const ui = (k) => (pack().ui || PACKS.en.ui)[k] ?? PACKS.en.ui[k];

  class Reply {
    constructor() { this.lines = []; this.card = null; this.chips = null; this.confirm = false; this.choices = null; this.intent = null; }
    add(key, p) { this.lines.push(T(key, p)); return this; }
    raw(text) { this.lines.push({ text, say: clean(text), alt: null }); return this; }
  }
  const R = (key, p) => new Reply().add(key, p);

  /* ------------------------------------------------------------------
     data
  ------------------------------------------------------------------ */
  const D = () => ctx.data();
  const owed = (s) => Math.max(0, r2(s.total - s.amount_paid));
  const total = (i) => i.shop_qty + i.warehouse_qty;
  const statusOf = (i) => (i.flagged_out_of_stock || total(i) === 0 ? 'out' : total(i) <= i.low_stock_threshold ? 'low' : 'ok');
  const unitsOf = (s) => s.items.reduce((a, l) => a + l.qty, 0);
  const inRange = (iso, r) => { const t = new Date(iso).getTime(); return t >= r.start.getTime() && t < addD(r.end, 1).getTime(); };
  const paysIn = (r) => D().payments.filter((p) => inRange(p.created_at, r));
  const salesIn = (r) => D().sales.filter((s) => inRange(s.created_at, r));
  const atSale = (p, s) => Math.abs(new Date(p.created_at) - new Date(s.created_at)) < 5000;
  const ownerKey = (s) => s.customer_id || (s.is_private ? (s.customer_phone ? 'p:' + String(s.customer_phone).replace(/\D/g, '') : 'inv:' + s.id) : 'n:' + String(s.customer_name || '').trim().toLowerCase());
  const today = () => sod(ctx.now ? ctx.now() : new Date());
  const rangeOf = (kind) => {
    const t = today();
    if (kind === 'thismonth') return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: t, kind };
    return { start: t, end: t, kind: 'today' };
  };

  /** customers grouped the same way the Not Fully Paid tab groups them */
  function people() {
    const map = new Map();
    for (const c of D().customers) map.set(c.id, { key: c.id, name: c.name, phone: c.phone, customerId: c.id, sales: [], frequent: true });
    for (const s of D().sales) {
      const k = ownerKey(s);
      if (!map.has(k)) map.set(k, { key: k, name: s.is_private && !s.customer_phone ? `Private · ${s.invoice_no}` : s.customer_name, phone: s.customer_phone, customerId: s.customer_id, sales: [], private: s.is_private });
      map.get(k).sales.push(s);
    }
    for (const p of map.values()) {
      p.sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      p.unpaid = p.sales.filter((s) => owed(s) > 0).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      p.owed = r2(p.unpaid.reduce((a, s) => a + owed(s), 0));
      p.since = p.unpaid[0] ? new Date(p.unpaid[0].created_at) : null;
    }
    return [...map.values()];
  }

  /* ------------------------------------------------------------------
     indexes (rebuilt automatically whenever the data changes)
  ------------------------------------------------------------------ */
  function indexes() {
    const d = D();
    const stamp = d.stamp;
    if (IX && IXstamp === stamp) return IX;
    const ppl = people().filter((p) => !(p.private && !p.phone && !p.customerId));
    const pop = {};
    for (const s of d.sales) for (const l of s.items) if (l.item_id) pop[l.item_id] = (pop[l.item_id] || 0) + l.qty;
    IX = {
      items: N.buildIndex(d.items, (i) => i.name, (i) => [i.sku].filter(Boolean)),
      brands: N.buildIndex(d.brands, (b) => b.name),
      people: N.buildIndex(ppl, (p) => p.name, (p) => []),
      custs: N.buildIndex(d.customers, (c) => c.name),
      pop, ppl,
    };
    IXstamp = stamp;
    return IX;
  }

  /* ------------------------------------------------------------------
     memory: phrases the owner has taught it ("the black one" = item X)
  ------------------------------------------------------------------ */
  const mem = () => ctx.memory.get('aliases') || {};
  // a taught phrase is kept as Roman words; it matches the same words in any script or with an "s" on the end
  const ALIAS_SKIP = new Set(['the', 'a', 'an', 'my', 'ka', 'ki', 'ke', 'wala', 'wali', 'wale']);
  function aliasHits(type, tokens, recs, idOf) {
    const out = [];
    for (const [key, v] of Object.entries(mem())) {
      if (v.t !== type) continue;
      const parts = key.replace(/^\w+:/, '').split(' ').map((r) => ({ r, k: N.skel(r) }));
      const pos = [];
      for (const p of parts) {
        let at = -1;
        tokens.forEach((t, i) => { if (at < 0 && !pos.includes(i) && !t.sep && N.tokSim(t, p) >= 0.82) at = i; });
        if (at < 0) { pos.length = 0; break; }
        pos.push(at);
      }
      if (!pos.length) continue;
      const rec = recs.find((r) => idOf(r) === v.id);
      if (rec) out.push({ rec, used: pos, len: parts.length });
    }
    // the longest taught phrase wins
    return out.sort((a, b) => b.len - a.len).filter((x, i, arr) => x.len === arr[0].len);
  }
  function learn(type, tokens, used, id) {
    const parts = [...used].sort((a, b) => a - b).map((i) => tokens[i]).filter((t) => t && !t.sep && t.num == null && !ALIAS_SKIP.has(t.r) && t.r.length >= 2).map((t) => t.r);
    if (!parts.length) return;
    const all = { ...mem(), [`${type}:${parts.join(' ')}`]: { t: type, id, at: Date.now() } };
    const keys = Object.keys(all);
    if (keys.length > 300) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 300).forEach((k) => delete all[k]);
    ctx.memory.set('aliases', all);
  }

  /* ------------------------------------------------------------------
     entity extraction
  ------------------------------------------------------------------ */
  function findItems(a, opts = {}) {
    const ix = indexes();
    const c = N.matchIndex(ix.items, a.tokens, { ...opts, aliasHits: aliasHits('item', a.tokens, D().items, (i) => i.id) });
    const d = N.decide(c, { prior: (it) => ix.pop[it.id] || 0 });
    if (d.kind === 'none' || (d.kind === 'one' && d.soft)) {
      const g = groupMatch(a, opts);
      if (g) return { ...g, all: c };
    }
    return { ...d, all: c };
  }
  /** a category word ("crisps", "drinks") stands for every item in it */
  function groupMatch(a, opts = {}) {
    const cats = [...new Set(D().items.map((i) => i.category).filter(Boolean))].map((name) => ({ name }));
    if (!cats.length) return null;
    const d = N.decide(N.matchIndex(N.buildIndex(cats, (x) => x.name), a.tokens, opts), { sure: 0.85, floor: 0.8 });
    if (d.kind !== 'one' || d.soft) return null;
    const list = D().items.filter((i) => i.category === d.best.rec.name);
    if (!list.length) return null;
    return { kind: list.length === 1 ? 'one' : 'many', group: true, groupName: d.best.rec.name, best: { rec: list[0], score: 0.9, used: d.best.used, hits: 1, best: 1 }, list: list.map((rec) => ({ rec, score: 0.6, used: d.best.used, hits: 1, best: 1 })) };
  }
  function findPeople(a, opts = {}, onlyCustomers = false) {
    const ix = indexes();
    const idx = onlyCustomers ? ix.custs : ix.people;
    const recs = onlyCustomers ? D().customers : ix.ppl;
    const c = N.matchIndex(idx, a.tokens, { ...opts, person: true, aliasHits: aliasHits(onlyCustomers ? 'cust' : 'person', a.tokens, recs, (p) => p.key || p.id) });
    return { ...N.decide(c, { sure: 0.7, floor: 0.5 }), all: c };
  }
  function findBrand(a) {
    const c = N.matchIndex(indexes().brands, a.tokens);
    const d = N.decide(c, { sure: 0.8, floor: 0.75 });
    return d.kind === 'one' ? d.best : null;
  }

  function entities(a) {
    const E = { a };
    const inv = a.tokens.find((t) => t.inv != null);
    E.inv = inv ? inv.inv : null;
    const invWord = a.tokens.findIndex((t) => /^(invoice|bill|bil|receipt)s?$/.test(t.r));
    if (E.inv == null && invWord >= 0) {
      let j = invWord + 1;
      if (/^(number|no|num|nambar|numbar|#)$/.test(a.tokens[j]?.r || '')) j++;
      if (a.tokens[j]?.num >= 1000 && Number.isInteger(a.tokens[j].num)) { E.inv = a.tokens[j].num; E.invAt = j; }
    }
    const dateUsed = new Set(a.date ? a.date.used : []);
    // greetings and yes/no words never name an item or a person ("assalam" is not Mr Aslam)
    for (const k of ['GREET', 'THANKS', 'BYE']) (a.concepts[k] || []).forEach((i) => { if (a.tokens[i].num == null && a.tokens[i].r.length > 1) dateUsed.add(i); });
    E.items = findItems(a, { skip: dateUsed });
    E.people = findPeople(a, { skip: dateUsed });
    E.brand = findBrand(a);
    // an item and a person can claim the same words; keep the stronger one
    const ib = E.items.kind === 'one' ? E.items.best : null, pb = E.people.kind === 'one' ? E.people.best : null;
    E.item = ib && (!pb || ib.score >= pb.score || ![...pb.used].some((x) => ib.used.has(x))) ? ib : null;
    E.person = pb && (!ib || pb.score > ib.score || ![...pb.used].some((x) => ib.used.has(x))) ? pb : null;
    if (E.item && E.person && [...E.person.used].some((x) => E.item.used.has(x))) {
      if (E.item.score >= E.person.score) E.person = null; else E.item = null;
    }
    const used = new Set([...dateUsed, ...(E.item ? E.item.used : []), ...(E.person ? E.person.used : [])]);
    E.used = used;
    E.nums = numbersIn(a.tokens, used);
    E.money = E.nums.find((n) => n.money) || null;
    E.qty = E.nums.find((n) => !n.money && Number.isInteger(n.v) && n.v > 0) || null;
    E.loc = N.locationIn(a.tokens, used);
    E.method = N.methodIn(a.tokens, used);
    // items already on the sales sheet get first say while the counter is open
    E.sheet = null;
    if (ctx.pos.isOpen() && ctx.pos.lines().length && E.items.kind !== 'none') {
      const lines = ctx.pos.lines();
      const c = N.matchIndex(N.buildIndex(lines, (l) => l.name), a.tokens, { skip: dateUsed });
      const d = N.decide(c, { sure: 0.5, floor: 0.3, gap: 0.1 });
      if (d.kind === 'one') E.sheet = d.best.rec;
    }
    return E;
  }

  function numbersIn(tokens, used = new Set()) {
    const priceWord = (t) => t && (N.VOCAB.PRICE.some((e) => e.r === t.r) || ['at', 'for', '@', 'ka', 'ki', 'ke', 'mein', 'me', 'wala', 'vala'].includes(t.r));
    const curWord = (t) => t && (t.cur || N.VOCAB.CURRENCY.some((e) => e.r === t.r));
    const out = [];
    tokens.forEach((t, i) => {
      if (t.num == null || t.inv != null || used.has(i)) return;
      const money = curWord(tokens[i - 1]) || curWord(tokens[i + 1])
        || (priceWord(tokens[i - 1]) && ['at', 'for', '@', 'price', 'rate', 'qimat', 'kimat', 'dam', 'daam'].includes(tokens[i - 1].r))
        || (['each', 'apiece', 'per', 'wala', 'vala', 'wali'].includes(tokens[i + 1]?.r))
        || !Number.isInteger(t.num);
      out.push({ i, v: t.num, money });
    });
    return out;
  }

  /* ------------------------------------------------------------------
     cards (small visual summaries shown under a reply)
  ------------------------------------------------------------------ */
  const M = (n) => F(false).money(n);
  const NUM = (n) => F(false).num(n);
  const card = {
    stats: (tiles, extra = '') => `<div class="ai-card"><div class="ai-tiles">${tiles.map((t) => `<div class="ai-tile${t.tone ? ' ' + t.tone : ''}"><small>${esc(t.label)}</small><strong>${esc(t.value)}</strong></div>`).join('')}</div>${extra}</div>`,
    bars: (series) => {
      const max = Math.max(1, ...series.map((s) => s.v));
      return `<div class="ai-bars" role="img">${series.map((s) => `<span title="${esc(s.label)}: ${esc(M(s.v))}" style="--h:${Math.max(3, Math.round((s.v / max) * 100))}%" class="${s.hot ? 'hot' : ''}"></span>`).join('')}</div>`;
    },
    rows: (rows, title = '') => `<div class="ai-card">${title ? `<div class="ai-card-h">${esc(title)}</div>` : ''}<ul class="ai-rows">${rows.map((r) => `<li${r.act ? ` data-ai-act="${esc(r.act)}" data-id="${esc(r.id || '')}" tabindex="0" role="button"` : ''}><span class="ai-dot ${r.tone || ''}"></span><span class="n">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><b>${esc(r.value ?? '')}</b></li>`).join('')}</ul></div>`,
    item: (i) => {
      const st = statusOf(i);
      const b = D().brands.find((x) => x.id === i.brand_id);
      return `<div class="ai-card ai-item"><div class="ai-card-h"><span class="ai-dot ${st}"></span>${esc(i.name)}${b ? `<small>${esc(b.name)}</small>` : ''}</div>
        <div class="ai-tiles"><div class="ai-tile"><small>${esc(ui('shop'))}</small><strong>${NUM(i.shop_qty)}</strong></div><div class="ai-tile"><small>${esc(ui('warehouse'))}</small><strong>${NUM(i.warehouse_qty)}</strong></div><div class="ai-tile"><small>${esc(ui('price'))}</small><strong>${esc(M(i.unit_price))}</strong></div></div></div>`;
    },
    invoice: (s) => `<div class="ai-card ai-inv"><div class="ai-card-h">${esc(s.invoice_no)}<small>${esc(new Date(s.created_at).toLocaleDateString(lang() === 'en' ? settings().locale : lang() === 'ur' ? 'ur-PK' : 'hi-IN', { day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(s.customer_name)}</small></div>
      <table class="ai-lines"><tbody>${s.items.map((l) => `<tr><td>${NUM(l.qty)}×</td><td>${esc(l.item_name)}</td><td>${esc(M(l.line_total))}</td></tr>`).join('')}</tbody></table>
      <div class="ai-inv-foot"><span>${esc(ui('total'))} <b>${esc(M(s.total))}</b></span><span>${esc(ui('paid'))} <b>${esc(M(s.amount_paid))}</b></span>${owed(s) > 0 ? `<span class="bad">${esc(ui('owed'))} <b>${esc(M(owed(s)))}</b></span>` : ''}</div>
      <div class="ai-card-act"><button type="button" class="ai-btn" data-ai-act="inv-pdf" data-id="${esc(s.id)}">${esc(ui('download'))}</button><button type="button" class="ai-btn ghost" data-ai-act="inv-view" data-id="${esc(s.id)}">${esc(ui('open'))}</button></div></div>`,
    change: (rows) => `<div class="ai-card ai-change"><ul class="ai-rows">${rows.map((r) => `<li><span class="n">${esc(r.name)}</span><b>${esc(r.from)} <i>→</i> ${esc(r.to)}</b></li>`).join('')}</ul></div>`,
    sheet: () => {
      const lines = ctx.pos.lines();
      if (!lines.length) return null;
      return `<div class="ai-card ai-sheet"><table class="ai-lines"><tbody>${lines.map((l) => `<tr><td>${NUM(l.qty)}×</td><td>${esc(l.name)}</td><td>${esc(M(l.qty * l.unit_price))}</td></tr>`).join('')}</tbody></table><div class="ai-inv-foot"><span>${esc(ui('total'))} <b>${esc(M(ctx.pos.total()))}</b></span></div></div>`;
    },
  };

  /* ------------------------------------------------------------------
     pending questions: yes/no, pick one, or fill a gap
  ------------------------------------------------------------------ */
  function confirm(r, { onYes, onNo, onEdit, again }) {
    r.confirm = true;
    S.pending = { type: 'confirm', onYes, onNo, onEdit, again: again || (() => { const x = new Reply(); x.lines = r.lines.slice(-1); x.card = r.card; x.confirm = true; return x; }) };
    return r;
  }
  function choose(r, options, onPick, again) {
    r.choices = options.map((o, i) => ({ label: o.label, value: i }));
    S.pending = { type: 'choose', options, onPick, again: again || (() => { const x = R('pickAgain'); x.choices = r.choices; return x; }) };
    return r;
  }
  function gap(r, onFill, again) {
    S.pending = { type: 'slot', onFill, again: again || (() => { const x = new Reply(); x.lines = r.lines.slice(-1); x.chips = r.chips; return x; }) };
    return r;
  }

  function pickOption(a, options) {
    const t = a.tokens;
    for (let i = 0; i < t.length; i++) {
      const o = N.ordinalOf(t[i]);
      if (o && o <= options.length) return options[o - 1];
      if (['last', 'akhri', 'aakhri'].includes(t[i].r) && t.length <= 4) return options[options.length - 1];
    }
    if (t.length <= 3) {
      const n = t.find((x) => x.num != null && Number.isInteger(x.num) && x.num >= 1 && x.num <= options.length);
      if (n && (t.length === 1 || /number|option|no|nambar|numbar/.test(a.roman))) return options[n.num - 1];
    }
    if (options.length === 1 && N.isYes(t) && !N.isNo(t)) return options[0];
    // by name / keyword
    const idx = N.buildIndex(options, (o) => o.match || o.label);
    const d = N.decide(N.matchIndex(idx, t), { sure: 0.6, floor: 0.5, gap: 0.08 });
    if (d.kind === 'one') return d.best.rec;
    for (const o of options) if (o.test && o.test(a)) return o;
    return null;
  }

  async function resolvePending(a, E) {
    const P = S.pending;
    if (!P) return null;
    if (P.type === 'confirm') {
      if (P.onEdit) { const r = await P.onEdit(a); if (r) return r; }
      // yes/no words that are really part of a name ("card" in Memory Card) don't count
      const taken = new Set([...(E?.item ? E.item.used : []), ...(E?.person ? E.person.used : [])]);
      const free = a.tokens.filter((t, i) => !taken.has(i));
      const no = N.isNo(free), yes = N.isYes(free) && !(E?.item && E.nums.length && free.length > 3);
      if (no) { S.pending = null; return P.onNo ? P.onNo() : R('cancelled'); }
      if (yes) { S.pending = null; return await P.onYes(); }
      return null;
    }
    if (P.type === 'choose') {
      const o = pickOption(a, P.options);
      if (o) { S.pending = null; return await P.onPick(o); }
      if (N.isNo(a.tokens) && a.tokens.length <= 3) { S.pending = null; return R('cancelled'); }
      return null;
    }
    if (P.type === 'slot') {
      const r = await P.onFill(a);
      if (r) return r;
      if ((N.isNo(a.tokens) || has(a, 'CANCEL')) && a.tokens.length <= 3) { S.pending = null; S.checkout = null; return R('cancelled'); }
      return null;
    }
    return null;
  }

  /* ------------------------------------------------------------------
     understanding: what does the person want?
  ------------------------------------------------------------------ */
  function understand(a, E) {
    const n = a.tokens.filter((t) => !t.sep).length;
    const ro = ` ${a.roman} `;
    const posOpen = ctx.pos.isOpen(), step = ctx.pos.step();
    if (has(a, 'THANKS') && n <= 5 && posOpen) return { intent: 'thanks' };
    const question = has(a, 'HOWMUCH') || /\?/.test(a.raw) || (/^(is|are|does|did|have|has|any) |^do (you|we|i|they) /.test(a.raw.toLowerCase()) && a.tokens[0]?.num == null);
    const strong = ['SALES', 'STOCK', 'OWE', 'PAY', 'INVOICE', 'SUMMARY', 'REPORT', 'LOW', 'OUTOF'].some((k) => has(a, k)) || E.item || E.person;

    if (!n) return { intent: 'none' };
    // teaching: "when I say black charger, I mean the Samsung 25W charger"
    const tm = a.raw.match(/^\s*(?:when|if|whenever)\s+i\s+say\s+["“']?(.+?)["”']?\s*,?\s+(?:i\s+mean|it\s+means|that\s+means|that\s+is|i\s+am\s+talking\s+about)\s+(?:the\s+)?(.+?)\s*[.!]?$/i)
      || a.raw.match(/^\s*jab\s+(?:main|mai|mein|me)\s+(.+?)\s+(?:kahun|kahoon|bolun|boloon|kahu)\s+(?:to|tou)\s+(?:matlab|mera matlab)\s+(?:hai\s+)?(.+?)\s*$/i)
      || a.raw.match(/^\s*جب\s+میں\s+(.+?)\s+(?:کہوں|بولوں)\s+تو\s+(?:میرا\s+)?مطلب\s+(?:ہے\s+)?(.+?)\s*۔?$/)
      || a.raw.match(/^\s*जब\s+मैं\s+(.+?)\s+(?:कहूँ|कहूं|बोलूँ|बोलूं)\s+तो\s+(?:मेरा\s+)?मतलब\s+(?:है\s+)?(.+?)\s*।?$/);
    if (tm) return { intent: 'teach', phrase: tm[1].trim(), target: tm[2].trim() };
    if (/how (do|can) i teach you|teach you (a )?word|sikha sakta|سکھا سکتا|सिखा सकता/.test(ro + a.raw)) return { intent: 'teach_how' };
    if ((has(a, 'EN') || has(a, 'URDU') || has(a, 'HINDI')) && (has(a, 'LANGUAGE') || n <= 4 || /speak|talk|switch|change|reply|baat|bolo|mein|me |main /.test(ro)) && !E.item) {
      return { intent: 'lang', to: has(a, 'URDU') ? 'ur' : has(a, 'HINDI') ? 'hi' : 'en' };
    }
    if (/\bunmute\b|voice on|sound on|awaz (on|chalu|kholo)|turn (the )?voice on/.test(ro)) return { intent: 'unmute' };
    if ((has(a, 'MUTE') && !strong) || /^\s*(stop talking|shh+|be quiet|quiet please|chup|chup karo|khamosh)\s*$/.test(a.roman)) return { intent: 'mute' };
    if (/^\s*(stop|ruko|enough|bas karo)\s*$/.test(a.roman)) return { intent: 'stop' };
    if ((has(a, 'ITEMS') || has(a, 'REPEAT')) && S.last?.intent === 'invoice' && S.last.sale && E.people.kind === 'none' && !has(a, 'SALES')) return { intent: 'invoice' };
    if (has(a, 'REPEAT') && n <= 5 && !strong) return { intent: 'repeat' };
    if (has(a, 'HELP') || /what can (you|u) do|what do you do|how do (i|you) use|kya kar sakte|کیا کر سکتے|क्या कर सकते/.test(ro + a.raw)) return { intent: 'help' };
    if (has(a, 'THANKS') && n <= 5 && !strong) return { intent: 'thanks' };
    if (has(a, 'BYE') && n <= 4 && !strong) return { intent: 'bye' };
    const greetTok = (a.concepts.GREET || []).some((i) => !(a.tokens[i].r === 'hi' && (a.tokens[i].native || N.hindustani(a.tokens, a.raw))));
    if (greetTok && n <= 4 && !strong && !(posOpen && /bas|بس|बस/.test(ro + a.raw))) return { intent: 'greet' };

    // ----- live sales counter
    const inSheet = (it) => ctx.pos.lines().some((l) => l.item_id === it.id);
    if (posOpen && step === 'done' && (E.items.kind !== 'none' || /new sale|next (sale|customer)|nayi|agla|اگلی|नई|अगली/.test(ro + a.raw))) return { intent: 'pos_new' };
    if (posOpen && step !== 'done') {
      const done = has(a, 'DONE') || /that(s| is) (all|it)|thats (all|it)|nothing else|no more|ring (it )?up|check ?out|bas itna|itna hi|bas yahi|ho gaya|بس اتنا|بس یہی|بس|बस इतना|बस/.test(ro + a.raw);
      if (done && (E.items.kind === 'none' || (E.items.kind === 'one' && E.items.soft)) && !has(a, 'REMOVE') && !(E.qty && E.items.kind !== 'none')) return { intent: 'pos_checkout' };
      if (has(a, 'UNDO') || /take (that|it) back|wapas lo|واپس لو|वापस लो/.test(ro + a.raw)) return { intent: 'pos_undo' };
      if (has(a, 'CLEAR') && (!E.item || /sheet|cart|everything|all|order|sab|saaf|saf/.test(ro))) return { intent: 'pos_clear' };
      if (/read( it| that| the order)? (back|out)|what(s| is) (in|on) the (sheet|cart|order|bill)|repeat the order|order (parh|padh|sunao)|آرڈر پڑھ|ऑर्डर पढ़|whats the total|what is the total|total kitna|کل کتنا|कुल कितना/.test(ro + a.raw)
        || (has(a, 'TOTAL') && !E.item && !has(a, 'OWE') && !E.nums.length)) return { intent: 'pos_read' };
      if ((has(a, 'REMOVE') || /take (off|out)/.test(ro)) && !has(a, 'ADD')) return { intent: 'pos_remove' };
      const priceTalk = has(a, 'PRICE') || E.money;
      const setTalk = has(a, 'SETTO') || /make (it|that|them|the)|change (it|that|the)|should be|kar do|karo/.test(ro);
      const onSheet = E.sheet || (E.items.kind === 'none');
      if (priceTalk && E.nums.length && onSheet && !has(a, 'ADD') && !(setTalk === false && E.qty && !E.money)) return { intent: 'pos_price' };
      if (setTalk && E.nums.length && onSheet && !has(a, 'ADD')) return { intent: 'pos_qty' };
      if (E.items.kind !== 'none' && !question) return { intent: 'pos_add' };
      if (E.items.kind === 'none' && has(a, 'ADD') && leftoverText(E)) return { intent: 'pos_add' };
      if (!E.items.kind || E.items.kind === 'none') {
        if (E.nums.length === 1 && n <= 3 && ctx.pos.lines().length) return { intent: priceTalk ? 'pos_price' : 'pos_qty' };
      }
    }
    if (posOpen && (has(a, 'CLEAR') || has(a, 'CANCEL')) && /counter|sale|sheet/.test(ro) && /close|band/.test(ro)) return { intent: 'pos_close' };
    if (posOpen && /close (the )?(counter|till)|counter band|کاؤنٹر بند|काउंटर बंद/.test(ro + a.raw)) return { intent: 'pos_close' };

    const startSale = (has(a, 'START') && (has(a, 'SALES') || has(a, 'COUNTER'))) || /new sale|start (a |the )?sale|open (the )?(sales |live )?(counter|till)|ring up|sale shuru|nayi sale|نئی سیل|سیل شروع|नई सेल|सेल शुरू/.test(ro + a.raw);
    if (startSale && !question && !has(a, 'REPORT')) return { intent: 'pos_open' };
    if (!posOpen && E.items.kind !== 'none' && E.nums.length && !question && !a.date && /\bsell\b|\bselling\b|bech|بیچ|बेच|wants|chahiye|چاہیے|चाहिए|customer (wants|needs)/.test(ro + a.raw)) return { intent: 'pos_open' };

    // ----- navigation
    if (has(a, 'SHOW') && !question && !E.person && E.inv == null) {
      if (/not fully paid|unpaid|udhar list|credit list|owing list/.test(ro) || (has(a, 'OWE') && /list|tab|page/.test(ro))) return { intent: 'nav', to: 'unpaid' };
      if (has(a, 'TRACKER')) return { intent: 'nav', to: 'tracker' };
      if (has(a, 'DASHBOARD') && !has(a, 'SALES')) return { intent: 'nav', to: 'dashboard' };
      if (/\binvoices\b|all (the )?(invoices|bills)|bills? (tab|page|list)|invoice tab/.test(ro)) return { intent: 'nav', to: 'invoices' };
      if (E.brand && !E.item && !has(a, 'STOCK')) return { intent: 'nav', to: 'brand', brand: E.brand.rec };
    }

    // ----- reports
    if (has(a, 'REPORT') || (has(a, 'GENERATE') && has(a, 'SALES') && /pdf|statement/.test(ro))) {
      if ((has(a, 'STOCK') || /inventory/.test(ro)) && !has(a, 'SALES')) return { intent: 'inv_report' };
      return { intent: 'report' };
    }

    // ----- payments
    const money = E.money || E.qty;
    const itemTalk = E.item && (has(a, 'STOCK') || has(a, 'ADD') || has(a, 'STOCKIN') || E.loc.shop >= 0 || E.loc.warehouse >= 0);
    if (has(a, 'PAY') && (E.person || E.inv != null || E.people.kind !== 'none') && !(question && !money) && !has(a, 'WHO') && !itemTalk) return { intent: 'payment' };
    if (has(a, 'PAY') && money && !E.item && !question && !has(a, 'WHO')) return { intent: 'payment' };
    if (/received|got/.test(ro) && E.person && money && !E.item) return { intent: 'payment' };

    // ----- money owed
    const oweTalk = has(a, 'OWE') || (has(a, 'WHO') && (has(a, 'MOST') || has(a, 'LONGEST')) && !has(a, 'SALES') && !E.item);
    if (oweTalk && !(has(a, 'PAY') && money)) {
      if (has(a, 'LONGEST')) return { intent: 'oldest_debtor' };
      if ((has(a, 'MOST') || /\btop\b|biggest|highest/.test(ro)) && !E.person) return { intent: 'top_debtor' };
      if (E.person || E.people.kind !== 'none') return { intent: 'balance' };
      return { intent: 'debts' };
    }

    // ----- invoices
    if (E.inv != null) return { intent: 'invoice' };
    if ((has(a, 'INVOICE') || has(a, 'ITEMS')) && (E.person || E.people.kind !== 'none')) return { intent: 'invoice' };
    if (E.person && /what did|kya liya|kya khareed|kya kharid|کیا لیا|کیا خرید|क्या लिया|क्या खरीद/.test(ro + a.raw)) return { intent: 'invoice' };
    if (!E.person && S.last?.person && /what did (he|she|they|him|her) (buy|get|take)|(he|she|they) bought|(us|unhon) ne kya|اس نے کیا|انہوں نے کیا|उसने क्या|उन्होंने क्या/.test(ro + a.raw)) return { intent: 'invoice' };
    if (has(a, 'INVOICE') && has(a, 'LAST') && !E.item) return { intent: 'invoice' };

    // ----- day summary / best sellers, phrased loosely
    const sureItem = E.items.kind === 'one' && !E.items.soft && E.items.best.score >= 0.7;
    const summaryTalk = has(a, 'SUMMARY') || /how(s| is| was| did| has)\b.*\b(day|yesterday|today|week|business|going|we do|we doing|things|shop doing|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|kaisa (raha|chal)|kaisi (rahi|chal)|کیسا (رہا|چل)|کیسی رہی|कैसा (रहा|चल)|कैसी रही/.test(ro + a.raw);
    if (summaryTalk && !sureItem && !has(a, 'SALES')) return { intent: 'summary' };
    if ((has(a, 'BEST') || has(a, 'MOST')) && (has(a, 'SALES') || /selling|seller|popular|sells/.test(ro)) && !sureItem && !oweTalk) return { intent: 'best' };
    if (/(want|like) to sell|sell something|make a sale|new bill|naya bill|nayi rasid|bill banao|bill bana do|بل بناؤ|نیا بل|नया बिल|बिल बनाओ/.test(ro + a.raw) && !question) return { intent: 'pos_open' };

    // ----- stock changes
    const itemAny = E.items.kind !== 'none';
    if (itemAny && has(a, 'FLAG')) return { intent: /back in stock|unflag|remove (the )?flag|hata/.test(ro) ? 'unflag' : 'flag' };
    if (itemAny && /back in stock|available again|unflag/.test(ro) && !E.nums.length) return { intent: 'unflag' };
    if (itemAny && /mark .*(out of stock|finished|khatam)|out of stock (mark|kar)/.test(ro) && !question) return { intent: 'flag' };
    if (itemAny && !question) {
      const both = E.loc.shop >= 0 && E.loc.warehouse >= 0;
      if (has(a, 'MOVE') || (both && !has(a, 'STOCKOUT'))) return { intent: 'move' };
      if (/\bset\b|should be|correct(ion)?|actually|count is|recount|it is actually/.test(ro) && E.nums.length) return { intent: 'stock_set' };
      if (has(a, 'STOCKOUT') || (has(a, 'REMOVE') && !posOpen)) return { intent: 'stock_out' };
      if (has(a, 'STOCKIN') || (has(a, 'ADD') && (has(a, 'STOCK') || E.loc.shop >= 0 || E.loc.warehouse >= 0))) return { intent: 'stock_in' };
      if (has(a, 'ADD') && !posOpen) return { intent: 'add_which' };
    }

    // ----- item questions
    if (itemAny || (E.items.kind === 'none' && false)) {
      if ((has(a, 'PRICE') || /how much (is|are|does|do|for) |what do (we|you|i) charge/.test(ro)) && !has(a, 'STOCK') && !has(a, 'SALES') && !/many/.test(ro)) return { intent: 'price' };
      if (has(a, 'SALES') && !has(a, 'STOCK') && !/\b(left|remaining)\b/.test(ro)) return { intent: 'item_sold' };
      return { intent: 'stock' };
    }
    if (E.brand && (has(a, 'STOCK') || question)) return { intent: 'brand_stock', brand: E.brand.rec };

    // ----- lists
    if (/reorder|order more|need to (buy|order)|restock|running low|kam ho|کم ہو|कम हो/.test(ro + a.raw) || (has(a, 'LOW') && (has(a, 'STOCK') || question || n <= 3))) return { intent: 'low' };
    if ((has(a, 'OUTOF') && (has(a, 'STOCK') || question || n <= 4)) || /sold out|out of stock/.test(ro)) return { intent: 'out' };
    if ((has(a, 'BEST') || has(a, 'MOST')) && (has(a, 'SALES') || has(a, 'ITEMS') || /selling|seller|popular/.test(ro))) return { intent: 'best' };
    if (has(a, 'VALUE') && (has(a, 'STOCK') || /inventory|stock|maal/.test(ro))) return { intent: 'value' };
    if (/how many (items|products|things|brands)|kitni cheezen|کتنی چیزیں|कितनी चीज़ें/.test(ro + a.raw)) return { intent: 'count' };

    // ----- summary and sales
    if (has(a, 'SUMMARY') || /how(s| is| was| did| has)\b.*\b(day|yesterday|today|week|business|going|we do|we doing|things|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|kaisa (raha|chal)|کیسا (رہا|چل)|कैसा (रहा|चल)/.test(ro + a.raw)) return { intent: 'summary' };
    if (has(a, 'SALES') || /takings|money (in|came)|cash in/.test(ro) || (has(a, 'HOWMUCH') && a.date)) return { intent: 'sales' };

    // ----- follow-ups that lean on the last question
    const L = S.last?.intent;
    if (a.date && ['sales', 'summary', 'report', 'item_sold', 'best'].includes(L)) return { intent: L, follow: true };
    if ((E.loc.shop >= 0 || E.loc.warehouse >= 0) && S.last?.item && n <= 6) return { intent: 'stock', follow: true };
    if ((E.person || E.people.kind !== 'none') && n <= 6) return { intent: ['balance', 'invoice'].includes(L) ? L : 'balance', follow: true };
    if (a.date && n <= 5) return { intent: 'sales' };
    if (has(a, 'STOCK') && question) return { intent: 'count' };
    return { intent: 'unknown' };
  }

  /* ------------------------------------------------------------------
     entity resolution helpers that ask when unsure
  ------------------------------------------------------------------ */
  /** resolve an item: returns item or a Reply asking which one */
  function needItem(E, then, { group = false } = {}) {
    const d = E.items;
    if (d.kind === 'one' && !d.soft) return then(d.best.rec, d.best);
    if (d.kind === 'one' && d.soft) {
      return confirm(R('maybeItem', { name: d.best.rec.name }), {
        onYes: () => { learn('item', E.a.tokens, d.best.used, d.best.rec.id); return then(d.best.rec, d.best); },
      });
    }
    if (d.kind === 'many' || d.kind === 'maybe') {
      const list = d.list;
      if (group && d.group) return null;
      if (group && list.length > 1) {
        // everything shares the same word ("chargers") — answer for the group
        const shared = [...list[0].used].filter((x) => list.every((c) => c.used.has(x)));
        if (shared.length) return null;
      }
      const opts = list.map((c) => ({ label: c.rec.name, match: c.rec.name, c }));
      return choose(R('whichItem', { names: opts.map((o) => o.label) }), opts, (o) => {
        learn('item', E.a.tokens, o.c.used, o.c.rec.id);
        return then(o.c.rec, o.c);
      });
    }
    const q = E.a.tokens.filter((t, i) => !t.sep && t.num == null && !N.STOP.has(t.r) && !E.used.has(i) && !Object.values(E.a.concepts).flat().includes(i)).map((t) => t.raw).join(' ');
    return q ? R('noItem', { q }) : R('noItemAny');
  }

  function needPerson(E, then, onlyCustomers = false) {
    const d = onlyCustomers ? findPeople(E.a, { skip: E.used }, true) : E.people;
    const id = (r) => r.key || r.id;
    if (d.kind === 'one' && !d.soft) return then(d.best.rec, d.best);
    if (d.kind === 'one' && d.soft) {
      return confirm(R('maybeCustomer', { name: d.best.rec.name }), {
        onYes: () => { learn(onlyCustomers ? 'cust' : 'person', E.a.tokens, d.best.used, id(d.best.rec)); return then(d.best.rec, d.best); },
      });
    }
    if (d.kind === 'many' || d.kind === 'maybe') {
      const opts = d.list.map((c) => ({ label: c.rec.name, match: c.rec.name, c }));
      return choose(R('whichCustomer', { names: opts.map((o) => o.label) }), opts, (o) => {
        learn(onlyCustomers ? 'cust' : 'person', E.a.tokens, o.c.used, id(o.c.rec));
        return then(o.c.rec, o.c);
      });
    }
    return null;
  }
  const leftoverText = (E) => E.a.tokens.filter((t, i) => !t.sep && t.num == null && !N.STOP.has(t.r) && !E.used.has(i) && !Object.values(E.a.concepts).flat().includes(i)).map((t) => t.raw).join(' ');

  /* ------------------------------------------------------------------
     handlers: questions
  ------------------------------------------------------------------ */
  function salesFigures(r) {
    const pays = paysIn(r);
    const totalIn = r2(pays.reduce((s, p) => s + p.amount, 0));
    const issued = salesIn(r);
    const credit = r2(issued.reduce((s, x) => s + Math.max(0, x.total - x.payments.filter((p) => atSale(p, x)).reduce((a, p) => a + p.amount, 0)), 0));
    const old = r2(pays.filter((p) => !inRange(p.sale.created_at, r)).reduce((s, p) => s + p.amount, 0));
    return { pays, total: totalIn, count: pays.length, issued, invoices: issued.length, units: issued.reduce((s, x) => s + unitsOf(x), 0), credit, old };
  }

  function hSales(a) {
    if (!D().salesReady) return R('needData');
    const r = a.date || rangeOf('today');
    const f = salesFigures(r);
    const days = Math.round((r.end - r.start) / 864e5) + 1;
    let rep;
    if (days === 1) {
      rep = f.count ? R('salesOne', { r, ...f }) : R('salesNone', { r, past: r.end < today() });
      if (f.count && f.invoices === 0) rep.lines[0] = T('salesOne', { r, ...f, invoices: 0 });
      if (r.kind === 'today') {
        const y = salesFigures({ start: addD(r.start, -1), end: addD(r.start, -1) });
        if (y.total > 0 && f.total > 0) rep.add('salesCompare', { diff: r2(f.total - y.total), prevLabel: T('prevDay').text });
      }
      rep.card = card.stats([{ label: ui('total'), value: M(f.total) }, { label: ui('payments'), value: NUM(f.count) }, { label: ui('invoices'), value: NUM(f.invoices) }, { label: ui('units'), value: NUM(f.units) }]);
    } else {
      const byDay = new Map();
      for (let d = new Date(r.start); d <= r.end; d = addD(d, 1)) byDay.set(ymd(d), 0);
      for (const p of f.pays) { const k = ymd(new Date(p.created_at)); byDay.set(k, r2((byDay.get(k) || 0) + p.amount)); }
      let best = null;
      for (const [k, v] of byDay) if (v > 0 && (!best || v > best.amount)) best = { day: new Date(k + 'T00:00:00'), amount: v };
      rep = f.count ? R('salesRange', { r, ...f, best, days, avg: r2(f.total / days) }) : R('salesNone', { r, past: r.end < today() });
      const prevR = { start: addD(r.start, -days), end: addD(r.start, -1) };
      const prev = salesFigures(prevR);
      if (f.count && prev.total > 0 && days <= 400) rep.add('salesCompare', { diff: r2(f.total - prev.total), prevLabel: T('prevPeriod').text });
      const series = [...byDay.entries()].slice(-62).map(([k, v]) => ({ label: k, v, hot: best && ymd(best.day) === k }));
      rep.card = card.stats([{ label: ui('total'), value: M(f.total) }, { label: ui('payments'), value: NUM(f.count) }, { label: ui('invoices'), value: NUM(f.invoices) }], series.length > 1 ? card.bars(series) : '');
    }
    S.last = { intent: 'sales', date: r };
    return rep;
  }

  function hSummary(a) {
    const r = a.date || rangeOf('today');
    const rep = R('summaryHead', { r });
    if (D().salesReady) {
      const f = salesFigures(r);
      rep.add('summarySales', f);
      const counts = {};
      for (const s of f.issued) for (const l of s.items) counts[l.item_name] = (counts[l.item_name] || 0) + l.qty;
      const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
      rep.add('summaryInvoices', { ...f, top: top ? top[0] : null });
      if (f.credit > 0) rep.add('summaryCredit', f);
      if (f.old > 0) rep.add('summaryOld', f);
      const ppl = people().filter((p) => p.owed > 0);
      if (ppl.length) rep.add('summaryOwed', { people: ppl.length, owed: r2(ppl.reduce((s, p) => s + p.owed, 0)) });
      rep.card = card.stats([{ label: ui('total'), value: M(f.total) }, { label: ui('invoices'), value: NUM(f.invoices) }, { label: ui('units'), value: NUM(f.units) }, { label: ui('owed'), value: M(ppl.reduce((s, p) => s + p.owed, 0)), tone: ppl.length ? 'warn' : '' }]);
    }
    const items = D().items;
    const out = items.filter((i) => statusOf(i) === 'out').length, low = items.filter((i) => statusOf(i) === 'low').length;
    rep.add('summaryStock', { out, low });
    const inUnits = D().movements.filter((m) => m.change > 0 && inRange(m.created_at, r) && !/transfer|moved/i.test(m.reason || '')).reduce((s, m) => s + m.change, 0);
    if (inUnits > 0) rep.add('summaryIn', { units: inUnits });
    S.last = { intent: 'summary', date: r };
    return rep;
  }

  function hStock(a, E, follow) {
    let target = null;
    if (follow && S.last?.item && E.items.kind === 'none') target = D().items.find((i) => i.id === S.last.item);
    const answer = (it) => {
      it = D().items.find((i) => i.id === it.id) || it;
      const wantShop = E.loc.shop >= 0 && E.loc.warehouse < 0, wantWh = E.loc.warehouse >= 0 && E.loc.shop < 0;
      let rep;
      if (total(it) === 0) rep = R('stockNone', { name: it.name });
      else if (wantShop) rep = R('stockShop', { name: it.name, qty: it.shop_qty, other: it.warehouse_qty });
      else if (wantWh) rep = R('stockWh', { name: it.name, qty: it.warehouse_qty, other: it.shop_qty });
      else rep = R('stockOne', { name: it.name, total: total(it), shop: it.shop_qty, wh: it.warehouse_qty });
      if (it.flagged_out_of_stock && total(it) > 0) rep.add('stockFlagged');
      else if (statusOf(it) === 'low') rep.add('stockLowNote', { min: it.low_stock_threshold });
      if (it.shop_qty === 0 && it.warehouse_qty > 0 && !it.flagged_out_of_stock) rep.add('stockShelfNote');
      rep.card = card.item(it);
      S.last = { intent: 'stock', item: it.id };
      return rep;
    };
    if (target) return answer(target);
    const ask = needItem(E, answer, { group: true });
    if (ask) return ask;
    // a group of similar items ("how many chargers", "how many crisps")
    const list = E.items.list;
    let items, word;
    if (E.items.groupName) { items = list.map((c) => c.rec); word = E.items.groupName; }
    else {
      const shared = [...list[0].used].filter((x) => list.every((c) => c.used.has(x)));
      word = shared.map((i) => E.a.tokens[i].raw).join(' ');
      const all = E.items.all.filter((c) => shared.every((x) => c.used.has(x)) && c.score >= 0.3).map((c) => c.rec);
      items = all.length ? all : list.map((c) => c.rec);
    }
    const rep = R('stockGroup', { word, kinds: items.length, total: items.reduce((s, i) => s + total(i), 0), shop: items.reduce((s, i) => s + i.shop_qty, 0), wh: items.reduce((s, i) => s + i.warehouse_qty, 0) });
    rep.card = card.rows(items.slice(0, 12).map((i) => ({ name: i.name, sub: `${ui('shop')} ${NUM(i.shop_qty)} · ${ui('warehouse')} ${NUM(i.warehouse_qty)}`, value: NUM(total(i)), tone: statusOf(i) })));
    S.last = { intent: 'stock' };
    return rep;
  }

  function hPrice(a, E) {
    return needItem(E, (it) => { const rep = R('priceOf', { name: it.name, price: it.unit_price }); rep.card = card.item(it); S.last = { intent: 'stock', item: it.id }; return rep; });
  }

  function hItemSold(a, E) {
    const r = a.date || (S.last?.intent === 'item_sold' && S.last.date) || rangeOf('thismonth');
    return needItem(E, (it) => {
      let units = 0, amount = 0;
      const inv = new Set();
      let lastAt = null;
      for (const s of D().sales) for (const l of s.items) if (l.item_id === it.id) {
        if (!lastAt || new Date(s.created_at) > lastAt) lastAt = new Date(s.created_at);
        if (inRange(s.created_at, r)) { units += l.qty; amount += l.line_total; inv.add(s.id); }
      }
      const rep = units ? R('itemSold', { r, name: it.name, units, amount: r2(amount), invoices: inv.size }) : R('itemNotSold', { r, name: it.name });
      if (!units && lastAt) rep.add('itemLastSold', { at: lastAt });
      S.last = { intent: 'item_sold', item: it.id, date: r };
      return rep;
    });
  }

  function hLow(kind) {
    const items = D().items;
    const out = items.filter((i) => statusOf(i) === 'out'), low = items.filter((i) => statusOf(i) === 'low');
    let rep;
    if (kind === 'out') rep = out.length ? R('outList', { n: out.length, names: out.slice(0, 8).map((i) => i.name) }) : R('noOut');
    else if (!out.length && !low.length) rep = R('allStocked');
    else {
      rep = new Reply();
      if (low.length) rep.add('lowList', { n: low.length, names: low.slice(0, 8).map((i) => i.name) }); else rep.add('noLow');
      if (out.length) rep.add('outList', { n: out.length, names: out.slice(0, 8).map((i) => i.name) });
    }
    const rows = [...out, ...(kind === 'out' ? [] : low)].slice(0, 14).map((i) => ({ name: i.name, sub: `${ui('shop')} ${NUM(i.shop_qty)} · ${ui('warehouse')} ${NUM(i.warehouse_qty)}`, value: NUM(total(i)), tone: statusOf(i) }));
    if (rows.length) rep.card = card.rows(rows);
    S.last = { intent: 'low' };
    return rep;
  }

  function hBest(a) {
    const r = a.date || rangeOf('thismonth');
    const counts = {};
    for (const s of salesIn(r)) for (const l of s.items) { const c = (counts[l.item_name] ||= { name: l.item_name, units: 0, value: 0 }); c.units += l.qty; c.value += l.line_total; }
    const list = Object.values(counts).sort((x, y) => y.units - x.units || y.value - x.value).slice(0, 5);
    const rep = list.length ? R('bestSellers', { r, list: list.slice(0, 3) }) : R('noBest', { r });
    if (list.length) rep.card = card.rows(list.map((x) => ({ name: x.name, sub: M(r2(x.value)), value: `${NUM(x.units)} ${ui('units')}` })));
    S.last = { intent: 'best', date: r };
    return rep;
  }

  function hValue() {
    const items = D().items;
    return R('stockValue', { units: items.reduce((s, i) => s + total(i), 0), kinds: items.length, value: r2(items.reduce((s, i) => s + total(i) * i.unit_price, 0)) });
  }
  const hCount = () => R('stockCount', { kinds: D().items.length, brands: D().brands.length, units: D().items.reduce((s, i) => s + total(i), 0) });

  function hBrandStock(b) {
    const items = D().items.filter((i) => i.brand_id === b.id);
    const rep = R('brandStock', { name: b.name, kinds: items.length, shop: items.reduce((s, i) => s + i.shop_qty, 0), wh: items.reduce((s, i) => s + i.warehouse_qty, 0), low: items.filter((i) => statusOf(i) !== 'ok').length });
    rep.card = card.rows(items.slice(0, 12).map((i) => ({ name: i.name, sub: `${ui('shop')} ${NUM(i.shop_qty)} · ${ui('warehouse')} ${NUM(i.warehouse_qty)}`, value: NUM(total(i)), tone: statusOf(i) })));
    return rep;
  }

  /* ----- money owed ----- */
  const debtors = () => people().filter((p) => p.owed > 0);
  function hTopDebtor() {
    if (!D().salesReady) return R('needData');
    const list = debtors().sort((x, y) => y.owed - x.owed);
    if (!list.length) return R('noDebts');
    const p = list[0];
    const rep = R('topDebtor', { name: p.name, amount: p.owed, count: p.unpaid.length });
    rep.card = card.rows(list.slice(0, 5).map((x) => ({ name: x.name, sub: `${NUM(x.unpaid.length)} ${ui('invoices')}`, value: M(x.owed), tone: 'low' })));
    S.last = { intent: 'balance', person: p.key };
    return rep;
  }
  function hOldestDebtor() {
    if (!D().salesReady) return R('needData');
    const list = debtors().sort((x, y) => x.since - y.since);
    if (!list.length) return R('noDebts');
    const p = list[0];
    const days = Math.max(0, Math.round((today() - sod(p.since)) / 864e5));
    const rep = R('oldestDebtor', { name: p.name, since: p.since, days, amount: p.owed });
    rep.card = card.rows(list.slice(0, 5).map((x) => ({ name: x.name, sub: `${ui('since')} ${x.since.toLocaleDateString(lang() === 'en' ? settings().locale : lang() === 'ur' ? 'ur-PK' : 'hi-IN', { day: 'numeric', month: 'short' })} · ${NUM(Math.round((today() - sod(x.since)) / 864e5))} ${ui('days')}`, value: M(x.owed), tone: 'low' })));
    S.last = { intent: 'balance', person: p.key };
    return rep;
  }
  function hDebts() {
    if (!D().salesReady) return R('needData');
    const list = debtors().sort((x, y) => y.owed - x.owed);
    if (!list.length) return R('noDebts');
    const rep = R('debtList', { n: list.length, total: r2(list.reduce((s, p) => s + p.owed, 0)), top: list.slice(0, 3).map((p) => ({ name: p.name, amount: p.owed })) });
    rep.card = card.rows(list.slice(0, 8).map((x) => ({ name: x.name, sub: `${NUM(x.unpaid.length)} ${ui('invoices')}`, value: M(x.owed), tone: 'low' })));
    rep.chips = [ui('suggestions')[2]];
    S.last = { intent: 'debts' };
    return rep;
  }
  function personFromLast() { return S.last?.person ? people().find((p) => p.key === S.last.person) : null; }
  function hBalance(a, E) {
    if (!D().salesReady) return R('needData');
    const answer = (p) => {
      p = people().find((x) => x.key === (p.key || p.id)) || p;
      S.last = { intent: 'balance', person: p.key };
      if (!p.sales?.length) return R('balanceNew', { name: p.name });
      if (p.owed <= 0) return R('balanceZero', { name: p.name });
      const rep = R('balance', { name: p.name, amount: p.owed, count: p.unpaid.length, since: p.since });
      rep.card = card.rows(p.unpaid.map((s) => ({ name: s.invoice_no, sub: new Date(s.created_at).toLocaleDateString(lang() === 'en' ? settings().locale : lang() === 'ur' ? 'ur-PK' : 'hi-IN', { day: 'numeric', month: 'short', year: 'numeric' }), value: M(owed(s)), tone: 'low', act: 'inv-view', id: s.id })));
      return rep;
    };
    if (E.people.kind === 'none' && personFromLast() && /\b(he|she|they|him|her|them|his|their|unka|uska|unhon|اس|ان|उस|उन)\b/.test(` ${a.roman} ${a.raw} `)) return answer(personFromLast());
    const r = needPerson(E, answer);
    if (r) return r;
    const q = leftoverText(E);
    return q ? R('noCustomer', { q }) : (personFromLast() ? answer(personFromLast()) : R('payWho'));
  }

  /* ----- invoices ----- */
  function hInvoice(a, E) {
    if (!D().salesReady) return R('needData');
    const read = (s, extra) => {
      const rep = extra || new Reply();
      rep.add('invoiceRead', { no: s.invoice_no, date: new Date(s.created_at), name: s.customer_name, lines: s.items.map((l) => ({ qty: l.qty, name: l.item_name, price: l.unit_price })), total: s.total, paid: s.amount_paid, owed: owed(s) });
      rep.card = card.invoice(s);
      S.last = { intent: 'invoice', sale: s.id, person: ownerKey(s) };
      return rep;
    };
    if (E.inv != null) {
      const s = D().sales.find((x) => Number(String(x.invoice_no).replace(/\D/g, '').replace(/^1/, '')) === E.inv || Number(String(x.invoice_no).split('-')[1]) === E.inv);
      return s ? read(s) : R('invoiceNotFound', { no: `C1-${String(E.inv).padStart(5, '0')}` });
    }
    // "read the items again" right after an invoice
    if (E.people.kind === 'none' && S.last?.sale) {
      const s = D().sales.find((x) => x.id === S.last.sale);
      if (s && (has(a, 'ITEMS') || has(a, 'REPEAT'))) {
        const rep = R('invoiceItems', { lines: s.items.map((l) => ({ qty: l.qty, name: l.item_name })) });
        rep.card = card.invoice(s);
        return rep;
      }
    }
    const answer = (p) => {
      p = people().find((x) => x.key === (p.key || p.id)) || p;
      if (!p.sales?.length) return R('invoiceNone', { name: p.name });
      // "the second last invoice" / "invoice from monday"
      let list = p.sales;
      if (a.date) list = list.filter((s) => inRange(s.created_at, a.date));
      const ord = a.tokens.map((t) => N.ordinalOf(t)).find(Boolean);
      const s = (ord && list[ord - 1]) || list[0] || p.sales[0];
      const rep = p.sales.length > 1 ? R('invoiceCount', { name: p.name, count: p.sales.length }) : new Reply();
      return read(s, rep);
    };
    if (E.people.kind === 'none' && personFromLast() && !leftoverText(E)) return answer(personFromLast());
    const r = needPerson(E, answer);
    if (r) return r;
    const q = leftoverText(E);
    return q ? R('noCustomer', { q }) : R('payWho');
  }

  /* ------------------------------------------------------------------
     handlers: actions (all confirmed first)
  ------------------------------------------------------------------ */
  const methodWord = (a) => N.methodIn(a.tokens);
  const isFull = (a) => has(a, 'FULL') && !/half|aadha|adha/.test(a.roman);
  const isNothing = (a) => /\b(nothing|zero|nil|none|on credit|credit|udh?a+r|kuch nahi|kuch nahin)\b/.test(` ${a.roman} `) || /کچھ نہیں|ادھار|कुछ नहीं|उधार/.test(a.raw) || (a.tokens.length <= 2 && a.tokens.some((t) => t.num === 0));

  function hPayment(a, E) {
    if (!D().salesReady) return R('needData');
    const go = (p, preset = {}) => {
      p = people().find((x) => x.key === (p.key || p.id)) || p;
      if (!(p.owed > 0)) return R('payNothingOwed', { name: p.name });
      const amtFrom = (A, EE) => {
        if (isFull(A)) return p.owed;
        const m = (EE?.money || EE?.qty || numbersIn(A.tokens, EE?.used || new Set())[0]);
        return m ? r2(m.v) : null;
      };
      let amount = preset.amount ?? amtFrom(a, E);
      let method = preset.method || methodWord(a) || 'Cash';
      const methodGiven = !!(preset.method || methodWord(a));
      const ask = () => gap(R('payAskAmount', { name: p.name, owed: p.owed }), (A) => {
        const v = isFull(A) ? p.owed : (numbersIn(A.tokens)[0]?.v ?? null);
        if (v == null || !(v > 0)) return null;
        S.pending = null;
        return go(p, { amount: r2(v), method: methodWord(A) || method });
      });
      if (amount == null || !(amount > 0)) return ask();
      if (amount > p.owed + 0.004) {
        return confirm(R('payTooMuch', { name: p.name, owed: p.owed }), { onYes: () => go(p, { amount: p.owed, method }) });
      }
      const after = r2(p.owed - amount);
      const rep = R('payConfirm', { name: p.name, amount, method, after });
      if (!methodGiven) rep.add('payMethodNote');
      const invFirst = E.inv != null ? p.unpaid.find((s) => String(s.invoice_no).endsWith(String(E.inv))) : null;
      const order = invFirst ? [invFirst, ...p.unpaid.filter((s) => s !== invFirst)] : p.unpaid;
      const plan = []; let left = amount;
      for (const s of order) { if (left <= 0) break; const part = r2(Math.min(left, owed(s))); plan.push({ s, part }); left = r2(left - part); }
      rep.card = card.change(plan.map((x) => ({ name: x.s.invoice_no, from: M(owed(x.s)), to: M(r2(owed(x.s) - x.part)) })));
      return confirm(rep, {
        onEdit: (A) => {
          const m = methodWord(A); const EE = entities(A);
          const nv = isFull(A) ? p.owed : (EE.money || EE.qty)?.v;
          if ((m && m !== method) || (nv && nv !== amount)) { S.pending = null; return go(p, { amount: nv || amount, method: m || method }); }
          return null;
        },
        onYes: async () => {
          for (const x of plan) {
            const res = await ctx.act.addPayment(x.s.id, x.part, method, 'Recorded by AI Shop Assistant');
            if (res?.error) return R('noPermission', { msg: res.error });
          }
          await ctx.act.refresh();
          const np = people().find((x) => x.key === p.key);
          S.last = { intent: 'balance', person: p.key };
          return R('payDone', { name: p.name, amount, after: np ? np.owed : after });
        },
      });
    };
    if (E.inv != null) {
      const s = D().sales.find((x) => String(x.invoice_no).endsWith(String(E.inv).padStart(5, '0')) || Number(String(x.invoice_no).split('-')[1]) === E.inv);
      if (!s) return R('invoiceNotFound', { no: `C1-${String(E.inv).padStart(5, '0')}` });
      const p = people().find((x) => x.key === ownerKey(s));
      return go(p);
    }
    const r = needPerson(E, (p) => go(p));
    if (r) return r;
    if (personFromLast() && /\b(he|she|they|him|her|them|unhon|usne|اس|ان|उस|उन)\b/.test(` ${a.roman} ${a.raw} `)) return go(personFromLast());
    return gap(R('payWho'), (A) => {
      const EE = entities(A);
      if (EE.people.kind === 'none') return null;
      S.pending = null;
      return needPerson(EE, (p) => go(p, { amount: (E.money || E.qty)?.v, method: methodWord(a) }));
    });
  }

  function reasonFrom(a, dir) {
    const ro = ` ${a.roman} `;
    if (dir === 'out') {
      if (/damag|broke|tut|toot|kharab|faulty|defect/.test(ro)) return 'Damaged';
      if (/expir/.test(ro)) return 'Expired';
      if (/lost|stolen|missing|chori|gum/.test(ro)) return 'Lost';
      if (/return/.test(ro)) return 'Returned to supplier';
      return 'Stock out · AI Assistant';
    }
    if (/deliver|supplier|arriv|came|aya|ay|mangw/.test(ro) || has(a, 'STOCKIN')) return 'Delivery from supplier';
    if (/return/.test(ro)) return 'Customer return';
    return 'Stock in · AI Assistant';
  }

  function hStockChange(kind, a, E) {
    return needItem(E, (it, cand) => {
      it = D().items.find((i) => i.id === it.id) || it;
      const used = new Set([...E.used, ...cand.used]);
      const nums = numbersIn(a.tokens, used);
      const qn = nums.find((x) => Number.isInteger(x.v) && x.v >= 0);
      const run = (qty, loc, dir, assumed) => {
        it = D().items.find((i) => i.id === it.id) || it;
        let shop = it.shop_qty, wh = it.warehouse_qty, rep;
        if (kind === 'set') {
          const from = loc === 'shop' ? it.shop_qty : it.warehouse_qty;
          if (from === qty) return R('sameAlready', { name: it.name, qty });
          if (loc === 'shop') shop = qty; else wh = qty;
          rep = R('setConfirm', { name: it.name, loc, to: qty, from });
        } else if (kind === 'move') {
          const have = dir === 'to_shop' ? it.warehouse_qty : it.shop_qty;
          if (qty > have) return R('notEnough', { name: it.name, have, loc: dir === 'to_shop' ? 'warehouse' : 'shop' });
          shop += dir === 'to_shop' ? qty : -qty; wh += dir === 'to_shop' ? -qty : qty;
          rep = R('moveConfirm', { name: it.name, qty, dir, shop, wh });
        } else {
          const have = loc === 'shop' ? it.shop_qty : it.warehouse_qty;
          if (kind === 'out' && qty > have) return R('notEnough', { name: it.name, have, loc });
          const d = kind === 'in' ? qty : -qty;
          if (loc === 'shop') shop += d; else wh += d;
          rep = R(kind === 'in' ? 'adjConfirmIn' : 'adjConfirmOut', { name: it.name, qty, loc, shop, wh, reason: kind === 'out' ? reasonFrom(a, 'out') : null });
          if (assumed) rep.add('locNote', { loc });
        }
        rep.card = card.change([{ name: ui('shop'), from: NUM(it.shop_qty), to: NUM(shop) }, { name: ui('warehouse'), from: NUM(it.warehouse_qty), to: NUM(wh) }]);
        return confirm(rep, {
          onEdit: (A) => {
            const L = N.locationIn(A.tokens);
            const nloc = L.shop >= 0 && L.warehouse < 0 ? 'shop' : L.warehouse >= 0 && L.shop < 0 ? 'warehouse' : null;
            const nn = numbersIn(A.tokens).find((x) => Number.isInteger(x.v) && x.v > 0);
            if ((nloc && nloc !== loc && kind !== 'move') || (nn && nn.v !== qty)) { S.pending = null; return run(nn ? nn.v : qty, nloc || loc, dir, false); }
            return null;
          },
          onYes: async () => {
            let res;
            if (kind === 'move') res = await ctx.act.transferStock(it.id, qty, dir);
            else if (kind === 'set') {
              const from = loc === 'shop' ? it.shop_qty : it.warehouse_qty;
              res = await ctx.act.adjustStock(it.id, loc, qty - from, 'Stock count correction');
            } else res = await ctx.act.adjustStock(it.id, loc, kind === 'in' ? qty : -qty, reasonFrom(a, kind));
            if (res?.error) return R('noPermission', { msg: res.error });
            await ctx.act.refresh();
            const n2 = D().items.find((i) => i.id === it.id) || it;
            S.last = { intent: 'stock', item: it.id };
            const done = R('adjDone', { name: n2.name, shop: n2.shop_qty, wh: n2.warehouse_qty });
            done.card = card.item(n2);
            return done;
          },
        });
      };
      // location
      const L = E.loc;
      let loc = null, assumed = false, dir = null;
      if (kind === 'move') {
        const ro = a.tokens.map((t) => t.r);
        const before = (i) => ro[i - 1];
        const toWords = new Set(['to', 'into', 'in', 'onto', 'mein', 'me', 'main', 'par', 'pe', 'tak', 'men'].map(N.toRoman));
        const fromWords = new Set(['from', 'out', 'se', 'sy'].map(N.toRoman));
        const after = (i) => ro[i + 1];
        if (L.shop >= 0 && L.warehouse >= 0) dir = L.warehouse < L.shop ? 'to_shop' : 'to_warehouse';
        else if (L.shop >= 0) dir = fromWords.has(before(L.shop)) || fromWords.has(after(L.shop)) ? 'to_warehouse' : 'to_shop';
        else if (L.warehouse >= 0) dir = fromWords.has(before(L.warehouse)) || fromWords.has(after(L.warehouse)) ? 'to_shop' : 'to_warehouse';
        else dir = /bring|lao|la do|le aao/.test(a.roman) ? 'to_shop' : it.shop_qty === 0 || it.warehouse_qty > 0 ? 'to_shop' : 'to_warehouse';
        // "send 5 to the warehouse" — to-word before warehouse
        if (L.shop >= 0 && L.warehouse >= 0) {
          if (toWords.has(before(L.shop)) || fromWords.has(before(L.warehouse)) || fromWords.has(after(L.warehouse))) dir = 'to_shop';
          if (toWords.has(before(L.warehouse)) && !toWords.has(before(L.shop)) || fromWords.has(before(L.shop)) || fromWords.has(after(L.shop))) dir = 'to_warehouse';
        }
      } else {
        if (L.shop >= 0 && L.warehouse < 0) loc = 'shop';
        else if (L.warehouse >= 0 && L.shop < 0) loc = 'warehouse';
        else if (kind === 'set') loc = null;
        else { loc = kind === 'in' ? 'warehouse' : 'shop'; assumed = true; }
      }
      const withQty = (q) => {
        if (kind === 'set' && !loc) {
          return gap(R('askWhere'), (A) => {
            const L2 = N.locationIn(A.tokens);
            const l2 = L2.shop >= 0 ? 'shop' : L2.warehouse >= 0 ? 'warehouse' : null;
            if (!l2) return null;
            S.pending = null; return run(q, l2, dir, false);
          });
        }
        return run(q, loc, dir, assumed);
      };
      if (qn && (qn.v > 0 || kind === 'set')) return withQty(qn.v);
      return gap(R('askQty', { name: it.name }), (A) => {
        const q = numbersIn(A.tokens).find((x) => Number.isInteger(x.v) && x.v >= 0);
        if (!q) return null;
        S.pending = null; return withQty(q.v);
      });
    });
  }

  function hFlag(on, a, E) {
    return needItem(E, (it) => confirm(R(on ? 'flagConfirm' : 'unflagConfirm', { name: it.name }), {
      onYes: async () => {
        const res = await ctx.act.flag(it.id, on);
        if (res?.error) return R('noPermission', { msg: res.error });
        await ctx.act.refresh();
        return R('flagDone', { name: it.name, on });
      },
    }));
  }

  function hAddWhich(a, E) {
    return needItem(E, (it) => {
      const q = (E.qty?.v) || 1;
      const opts = [
        { label: T('optStock').text, match: 'stock inventory add stock warehouse', test: (A) => has(A, 'STOCK') || has(A, 'WAREHOUSE') || has(A, 'SHOP') || has(A, 'STOCKIN'), go: () => hStockChange('in', a, E) },
        { label: T('optSale').text, match: 'sale sell counter customer', test: (A) => has(A, 'SALES') || has(A, 'COUNTER') || has(A, 'START'), go: () => posOpenAndAdd(a, E) },
      ];
      return choose(R('stockOrSale', { qty: q, name: it.name }), opts, (o) => o.go());
    });
  }

  function hTeach(phrase, target) {
    const pa = N.analyse(phrase), ta = N.analyse(target);
    const keyIdx = new Set(pa.tokens.map((t, i) => i).filter((i) => !pa.tokens[i].sep && pa.tokens[i].num == null && !ALIAS_SKIP.has(pa.tokens[i].r)));
    if (!keyIdx.size) return R('teachHow');
    const TE = entities(ta);
    const teachItem = (it) => { learn('item', pa.tokens, keyIdx, it.id); return R('taught', { phrase, name: it.name }); };
    if (TE.items.kind !== 'none' && (!TE.person || TE.items.best?.score >= TE.person.score)) return needItem(TE, teachItem);
    if (TE.people.kind !== 'none') return needPerson(TE, (p) => { learn('person', pa.tokens, keyIdx, p.key || p.id); if (p.customerId || p.id) learn('cust', pa.tokens, keyIdx, p.customerId || p.id); return R('taught', { phrase, name: p.name }); });
    return R('noItem', { q: target });
  }

  function hReport(a) {
    if (!D().salesReady) return R('needData');
    const r = a.date || rangeOf('thismonth');
    const res = ctx.act.report(ymd(r.start), ymd(r.end));
    S.last = { intent: 'report', date: r };
    return R('reportDone', { r, total: res?.total || 0, count: res?.count || 0 });
  }

  /* ------------------------------------------------------------------
     live sales counter by voice
  ------------------------------------------------------------------ */
  function posEnsure() {
    if (ctx.pos.isOpen()) return null;
    const res = ctx.pos.open();
    if (res !== true) return res === 'sales' ? R('needData') : R('posNoStock', { name: lang() === 'en' ? 'Every item' : '—' });
    S.undo = [];
    return 'opened';
  }

  /** split "2 chargers and 3 cases at 5 pounds" into lines */
  function parseCart(a) {
    const toks = a.tokens;
    const segs = [];
    let cur = [];
    toks.forEach((t, i) => {
      const conj = t.sep || N.VOCAB.CONJ.some((e) => e.r === t.r);
      if (conj) { if (cur.length) segs.push(cur); cur = []; } else cur.push(i);
    });
    if (cur.length) segs.push(cur);
    const lines = [], unsure = [];
    for (const seg of segs) {
      const from = seg[0], to = seg[seg.length + -1] + 1;
      let skip = new Set();
      for (let guard = 0; guard < 4; guard++) {
        const c = N.matchIndex(indexes().items, toks, { from, to, skip, aliasHits: aliasHits('item', toks.slice(0), D().items, (i) => i.id).filter((h) => h.used.every((u) => u >= from && u < to && !skip.has(u))) });
        let d = N.decide(c, { prior: (it) => indexes().pop[it.id] || 0 });
        if (d.kind === 'none' || (d.kind === 'one' && d.soft)) { const g = groupMatch(a, { from, to, skip }); if (g) d = g.kind === 'one' ? { kind: 'one', best: g.best } : g; }
        if (d.kind === 'none') break;
        const pick = d.kind === 'one' ? d.best : d.list[0];
        if (guard > 0 && pick.score < 0.7) break;
        const used = new Set(pick.used);
        if (d.kind !== 'one' || d.soft) unsure.push({ d, used, seg: { from, to } });
        else lines.push({ item: pick.rec, used, seg: { from, to }, cand: pick });
        used.forEach((u) => skip.add(u));
        // stop if nothing meaningful is left in this segment
        const rest = seg.filter((i) => !skip.has(i) && toks[i].num == null && !N.STOP.has(toks[i].r) && !Object.values(a.concepts).flat().includes(i));
        if (!rest.length) break;
      }
    }
    // quantities and prices: nearest free number in the same segment
    const taken = new Set([...lines, ...unsure].flatMap((l) => [...l.used]));
    const all = [...lines, ...unsure];
    for (const l of all) {
      const nums = numbersIn(toks, taken).filter((n) => n.i >= l.seg.from && n.i < l.seg.to);
      const span = [...l.used];
      const lo = Math.min(...span), hi = Math.max(...span);
      const near = (n) => (n.i < lo ? lo - n.i : n.i - hi);
      const q = nums.filter((n) => !n.money && Number.isInteger(n.v) && n.v > 0).sort((x, y) => near(x) - near(y) || x.i - y.i)[0];
      const p = nums.filter((n) => n !== q && (n.money || (q && n.i > hi))).sort((x, y) => near(x) - near(y))[0];
      l.qty = q ? q.v : 1;
      l.price = p ? p.v : null;
      if (q) taken.add(q.i);
      if (p) taken.add(p.i);
    }
    return { lines, unsure };
  }

  function addLines(lines, rep = new Reply()) {
    const added = [];
    for (const l of lines) {
      const it = D().items.find((i) => i.id === l.item.id) || l.item;
      const avail = ctx.pos.avail(it);
      if (avail <= 0) { rep.add('posNoStock', { name: it.name }); continue; }
      const before = ctx.pos.lines().find((x) => x.item_id === it.id);
      const q = Math.min(l.qty, avail);
      S.undo.push({ id: it.id, name: it.name, prevQty: before ? before.qty : 0, prevPrice: before ? before.unit_price : null });
      ctx.pos.add(it.id, q, l.price);
      if (q < l.qty) rep.add('posLimited', { name: it.name, avail });
      added.push({ qty: q, name: it.name, price: l.price });
    }
    if (added.length) rep.lines.unshift(T('posAdded', { lines: added, total: ctx.pos.total() }));
    rep.card = card.sheet();
    rep.chips = ui('posSuggestions');
    return rep;
  }

  function hPosAdd(a, E, rep = new Reply()) {
    if (ctx.pos.step() !== 'items') ctx.pos.toItems();
    const { lines, unsure } = parseCart(a);
    if (!lines.length && !unsure.length) { const q = leftoverText(E); return q ? R('noItem', { q }) : R('noItemAny'); }
    addLines(lines, rep);
    if (unsure.length) {
      S.queue = unsure.slice(1);
      return askUnsure(unsure[0], rep, a);
    }
    S.last = { intent: 'pos' };
    return rep;
  }
  function askUnsure(u, rep, a) {
    let list = u.d.kind === 'one' ? [u.d.best] : u.d.list;
    // only offer what can actually be sold from the shop
    const sellable = list.filter((c) => ctx.pos.avail(c.rec) > 0);
    if (sellable.length) list = sellable;
    const opts = list.map((c) => ({ label: c.rec.name, match: c.rec.name, c }));
    const next = (picked) => {
      learn('item', a.tokens, picked.used, picked.rec.id);
      const r = addLines([{ item: picked.rec, qty: u.qty || 1, price: u.price }]);
      if (S.queue.length) { const nu = S.queue.shift(); return askUnsure(nu, r, a); }
      return r;
    };
    if (list.length === 1) {
      rep.add('maybeItem', { name: list[0].rec.name });
      return confirm(rep, { onYes: () => next(list[0]), onNo: () => { S.queue = []; return R('noItemAny'); } });
    }
    rep.add('whichItem', { names: opts.map((o) => o.label) });
    return choose(rep, opts, (o) => next(o.c));
  }

  function posOpenAndAdd(a, E) {
    const was = ctx.pos.isOpen();
    const o = posEnsure();
    if (o instanceof Reply) return o;
    const rep = new Reply();
    if (!was) rep.add('posOpened');
    const { lines, unsure } = parseCart(a);
    if (lines.length || unsure.length) { rep.lines = []; return hPosAdd(a, E, rep); }
    if (was) rep.add('posAlready');
    rep.chips = ui('posSuggestions');
    S.last = { intent: 'pos' };
    return rep;
  }

  function lineTarget(E) {
    const lines = ctx.pos.lines();
    if (E.sheet) return E.sheet;
    if (E.items.kind !== 'none') {
      const ids = (E.items.kind === 'one' ? [E.items.best] : E.items.list).map((c) => c.rec.id);
      const l = lines.find((x) => ids.includes(x.item_id));
      if (l) return l;
      return E.items.kind === 'one' ? { missing: E.items.best.rec } : null;
    }
    const lastId = S.undo[S.undo.length - 1]?.id;
    return lines.find((x) => x.item_id === lastId) || lines[lines.length - 1] || null;
  }

  function hPosPrice(a, E) {
    const l = lineTarget(E);
    if (!l) return R('posEmpty');
    if (l.missing) return R('posNotInSheet', { name: l.missing.name });
    const n = (E.money || E.nums[E.nums.length - 1]);
    if (!n) return R('sorry');
    S.undo.push({ id: l.item_id, name: l.name, prevQty: l.qty, prevPrice: l.unit_price });
    ctx.pos.setPrice(l.item_id, r2(n.v));
    const rep = R('posPrice', { name: l.name, price: r2(n.v), total: ctx.pos.total() });
    rep.card = card.sheet();
    return rep;
  }
  function hPosQty(a, E) {
    const l = lineTarget(E);
    if (!l) return R('posEmpty');
    if (l.missing) return hPosAdd(a, E);
    const n = E.qty || E.nums[0];
    if (!n) return R('sorry');
    const it = D().items.find((i) => i.id === l.item_id);
    S.undo.push({ id: l.item_id, name: l.name, prevQty: l.qty, prevPrice: l.unit_price });
    const q = ctx.pos.setQty(l.item_id, Math.max(1, Math.round(n.v)));
    const rep = R('posQty', { name: l.name, qty: q, total: ctx.pos.total() });
    if (it && q < n.v) rep.add('posLimited', { name: l.name, avail: q });
    rep.card = card.sheet();
    return rep;
  }
  function hPosRemove(a, E) {
    const l = lineTarget(E);
    if (!l) return R('posEmpty');
    if (l.missing) return R('posNotInSheet', { name: l.missing.name });
    const q = E.qty?.v;
    S.undo.push({ id: l.item_id, name: l.name, prevQty: l.qty, prevPrice: l.unit_price });
    let rep;
    if (q && q < l.qty) { ctx.pos.setQty(l.item_id, l.qty - q); rep = R('posQty', { name: l.name, qty: l.qty - q, total: ctx.pos.total() }); }
    else { ctx.pos.remove(l.item_id); rep = R('posRemoved', { name: l.name, total: ctx.pos.total() }); }
    rep.card = card.sheet();
    return rep;
  }
  function hPosRead() {
    const lines = ctx.pos.lines();
    if (!lines.length) return R('posEmpty');
    const rep = R('posRead', { lines: lines.map((l) => ({ qty: l.qty, name: l.name, price: l.unit_price })), total: ctx.pos.total() });
    rep.card = card.sheet();
    rep.chips = ui('posSuggestions');
    return rep;
  }
  function hPosUndo() {
    const u = S.undo.pop();
    if (!u) return R('posNothingUndo');
    const line = ctx.pos.lines().find((l) => l.item_id === u.id);
    if (!u.prevQty) ctx.pos.remove(u.id);
    else if (!line) ctx.pos.add(u.id, u.prevQty, u.prevPrice);
    else { ctx.pos.setQty(u.id, u.prevQty); if (u.prevPrice != null) ctx.pos.setPrice(u.id, u.prevPrice); }
    const rep = R('posUndone', { name: u.name });
    rep.card = card.sheet();
    return rep;
  }
  function hPosClear() {
    if (!ctx.pos.lines().length) return R('posEmpty');
    return confirm(R('posClearQ'), { onYes: () => { ctx.pos.clear(); S.undo = []; return R('posCleared'); } });
  }

  /* ----- checkout conversation ----- */
  function parseCustomer(a, E) {
    if (has(a, 'PRIVATE') || /walk ?in|no name|nobody|koi nahi|کوئی نہیں|कोई नहीं|private/.test(` ${a.roman} ${a.raw} `)) return { mode: 'private' };
    const phone = (a.raw.match(/(\+?\d[\d\s-]{6,}\d)/) || [])[1]?.replace(/[\s-]/g, '') || '';
    const d = findPeople(a, { skip: new Set(a.date ? a.date.used : []) }, true);
    if (d.kind === 'one' && !d.soft && d.best.score >= 0.7) return { mode: 'frequent', id: d.best.rec.id, name: d.best.rec.name, phone: d.best.rec.phone || phone };
    if (d.kind === 'many' || d.kind === 'maybe' || (d.kind === 'one')) return { ask: d };
    // a new name: the words that aren't part of the sentence around it
    const filler = new Set(['customer', 'customers', 'name', 'naam', 'is', 'its', 'it', 'the', 'for', 'from', 'called', 'mr', 'mrs', 'ms', 'he', 'she', 'this', 'that', 'sale', 'to', 'buyer', 'client', 'gahak', 'grahak', 'hai', 'he', 'ka', 'ki', 'ke', 'ji', 'sahab', 'sahib', 'bhai', 'my', 'number', 'phone', 'mobile', 'and', 'aur', 'with'].map(N.toRoman));
    const stopAt = (t) => ['PAY', 'FULL', 'CASH', 'CARD', 'BANK', 'NOTHING', 'DONE', 'YES', 'NO'].some((k) => N.VOCAB[k].some((e) => e.r === t.r));
    const words = [];
    for (const t of a.tokens) {
      if (t.sep) { if (words.length) break; continue; }
      if (t.num != null || t.cur) { if (words.length) break; continue; }
      if (stopAt(t)) { if (words.length) break; continue; }
      if (filler.has(t.r)) continue;
      words.push(t.raw);
    }
    const name = words.join(' ').trim().slice(0, 80).replace(/\b([a-z])/g, (m) => m.toUpperCase());
    if (!name || name.length < 2) return null;
    return { mode: 'new', name, phone };
  }
  function parsePay(a, tot) {
    const method = N.methodIn(a.tokens);
    const n = numbersIn(a.tokens).find((x) => x.v > 0);
    if (n) return { paid: Math.min(tot, r2(n.v)), method };
    if (isFull(a)) return { paid: tot, method };
    if (isNothing(a)) return { paid: 0, method };
    if (method) return { paid: null, method };
    return null;
  }

  function hCheckout(a, E) {
    if (!ctx.pos.lines().length) return R('posEmpty');
    const tot = ctx.pos.total();
    S.checkout = S.checkout || { customer: null, pay: null };
    const C = S.checkout;
    // details given in the same breath: "that's all, it's for Ravi, paid in full by card"
    if (!C.customer && a) { const c = parseCustomerQuick(a, E); if (c) C.customer = c; }
    if (!C.pay && a && (has(a, 'PAY') || N.methodIn(a.tokens))) { const p = parsePay(a, tot); if (p && p.paid != null) C.pay = { paid: p.paid, method: p.method || 'Cash' }; }
    return checkoutNext();
  }
  /** only take a customer from the "that's all" sentence when it's clearly named */
  function parseCustomerQuick(a, E) {
    if (has(a, 'PRIVATE')) return { mode: 'private' };
    const d = findPeople(a, { skip: new Set(a.date ? a.date.used : []) }, true);
    if (d.kind === 'one' && !d.soft && d.best.score >= 0.85) return { mode: 'frequent', id: d.best.rec.id, name: d.best.rec.name, phone: d.best.rec.phone || '' };
    const m = a.raw.match(/\b(?:for|customer(?: is| name is)?|name is|naam)\s+([A-Za-z][A-Za-z .'-]{1,40})/i);
    if (m) {
      const nm = m[1].replace(/\b(paid|in full|full|cash|card|bank|nothing|on credit|and|aur)\b.*$/i, '').trim();
      if (nm.length >= 2) return { mode: 'new', name: nm.replace(/\b([a-z])/g, (x) => x.toUpperCase()), phone: '' };
    }
    return null;
  }
  function checkoutNext() {
    const C = S.checkout, tot = ctx.pos.total(), n = ctx.pos.lines().length;
    if (!C.customer) {
      ctx.pos.toCustomer?.();
      const rep = R('posAskCustomer', { n, total: tot });
      rep.card = card.sheet();
      rep.chips = [lang() === 'ur' ? 'پرائیویٹ' : lang() === 'hi' ? 'प्राइवेट' : 'Private', ...D().customers.slice(0, 4).map((c) => c.name)];
      return gap(rep, (A) => {
        const EE = entities(A);
        const c = parseCustomer(A, EE);
        if (!c) return null;
        if (c.mode === 'new') {
          // "how many screen protectors are left" is a question, not somebody's name
          const u = understand(A, EE);
          if (has(A, 'HOWMUCH') || has(A, 'WHO') || /\?/.test(A.raw) || !['unknown', 'balance', 'invoice', 'greet', 'none'].includes(u.intent)) return null;
        }
        if (c.ask) {
          S.pending = null;
          const d = c.ask;
          const list = d.kind === 'one' ? [d.best] : d.list;
          const fresh = parseCustomer({ ...A, concepts: A.concepts }, { ...EE, used: new Set(list.flatMap((x) => [...x.used])) });
          if (list.length === 1) {
            return confirm(R('maybeCustomer', { name: list[0].rec.name }), {
              onYes: () => { learn('cust', A.tokens, list[0].used, list[0].rec.id); C.customer = { mode: 'frequent', id: list[0].rec.id, name: list[0].rec.name, phone: list[0].rec.phone || '' }; return checkoutNext(); },
              onNo: () => { const nm = A.tokens.filter((t) => !t.sep && t.num == null).map((t) => t.raw).join(' ').replace(/\b([a-z])/g, (x) => x.toUpperCase()); C.customer = { mode: 'new', name: nm, phone: '' }; return checkoutNext(); },
            });
          }
          const opts = list.map((x) => ({ label: x.rec.name, match: x.rec.name, x }));
          return choose(R('whichCustomer', { names: opts.map((o) => o.label) }), opts, (o) => {
            learn('cust', A.tokens, o.x.used, o.x.rec.id);
            C.customer = { mode: 'frequent', id: o.x.rec.id, name: o.x.rec.name, phone: o.x.rec.phone || '' };
            return checkoutNext();
          });
        }
        S.pending = null;
        C.customer = c;
        if (!C.pay && (has(A, 'PAY') || N.methodIn(A.tokens))) { const p = parsePay(A, tot); if (p && p.paid != null) C.pay = { paid: p.paid, method: p.method || 'Cash' }; }
        const r = checkoutNext();
        r.lines.unshift(T('posCustomer', { mode: c.mode, name: c.name }));
        return r;
      });
    }
    ctx.pos.setCustomer(C.customer);
    if (!C.pay) {
      const rep = R('posAskPay', { total: tot });
      rep.chips = lang() === 'ur' ? ['پورے نقد', 'پورے کارڈ سے', 'کچھ نہیں — ادھار'] : lang() === 'hi' ? ['पूरे नकद', 'पूरे कार्ड से', 'कुछ नहीं — उधार'] : ['Paid in full, cash', 'Paid in full by card', 'Nothing — on credit'];
      return gap(rep, (A) => {
        const p = parsePay(A, tot);
        if (!p || p.paid == null) return null;
        S.pending = null;
        C.pay = { paid: p.paid, method: p.method || 'Cash' };
        return checkoutNext();
      });
    }
    ctx.pos.setPayment({ full: C.pay.paid >= tot, amount: C.pay.paid, method: C.pay.method });
    const name = C.customer.mode === 'private' ? (lang() === 'ur' ? 'پرائیویٹ گاہک' : lang() === 'hi' ? 'प्राइवेट ग्राहक' : 'a private customer') : C.customer.name;
    const rep = R('posConfirm', { name, total: tot, paid: C.pay.paid, method: C.pay.method });
    if (C.customer.mode === 'private' && C.pay.paid < tot && !C.customer.phone) rep.add('posPrivateCredit');
    rep.card = card.sheet();
    return confirm(rep, {
      onEdit: (A) => {
        const p = parsePay(A, tot);
        const EE = entities(A);
        const named = !N.isYes(A.tokens) && !N.isNo(A.tokens) && (EE.people.kind !== 'none' || /customer|name|naam/.test(A.roman)) ? parseCustomer(A, EE) : null;
        if ((p && (p.method && p.method !== C.pay.method || p.paid != null && p.paid !== C.pay.paid)) || (named && !named.ask)) {
          if (p) C.pay = { paid: p.paid ?? C.pay.paid, method: p.method || C.pay.method };
          if (named && !named.ask) C.customer = named;
          S.pending = null;
          return checkoutNext();
        }
        return null;
      },
      onNo: () => { S.checkout = null; ctx.pos.toItems(); return R('posBackToSale'); },
      onYes: async () => {
        const res = await ctx.pos.record();
        if (res?.error) return R('noPermission', { msg: res.error });
        S.checkout = null; S.undo = [];
        const s = res.sale;
        const r = R('posRecorded', { no: s.invoice_no, owed: owed(s) });
        r.card = card.invoice(s);
        r.chips = [lang() === 'ur' ? 'نئی سیل' : lang() === 'hi' ? 'नई सेल' : 'New sale', lang() === 'ur' ? 'کاؤنٹر بند کرو' : lang() === 'hi' ? 'काउंटर बंद करो' : 'Close the counter'];
        S.last = { intent: 'invoice', sale: s.id, person: ownerKey(s) };
        return r;
      },
    });
  }

  /* ------------------------------------------------------------------
     fallbacks
  ------------------------------------------------------------------ */
  function guess(a) {
    const sk = a.tokens.map((t) => t.k).filter((x) => x.length >= 2);
    if (!sk.length) return null;
    let best = null;
    for (const [k, exs] of Object.entries(EX_SK)) {
      for (const ex of exs) {
        const hit = ex.filter((x) => sk.includes(x)).length;
        const s = hit / Math.max(ex.length, 2);
        if (hit && (!best || s > best.s)) best = { k, s };
      }
    }
    return best && best.s >= 0.34 ? best.k : null;
  }
  const GUESS_RUN = { sales: 'sales', summary: 'summary', stock: 'count', low: 'low', debts: 'debts', balance: 'debts', invoice: 'debts', payment: 'help', adjust: 'help', pos: 'pos_open', report: 'report', help: 'help' };

  /* ------------------------------------------------------------------
     main entry
  ------------------------------------------------------------------ */
  async function run(intent, a, E, extra = {}) {
    switch (intent) {
      case 'none': return null;
      case 'lang': ctx.setLang(extra.to); return R('langSet');
      case 'mute': ctx.setMuted(true); return R('muted');
      case 'unmute': ctx.setMuted(false); return R('unmuted');
      case 'stop': ctx.stopSpeaking(); return null;
      case 'repeat': return S.lastReply || R('noRepeat');
      case 'help': { const r = R('help'); r.chips = ui('suggestions'); return r; }
      case 'thanks': return R('thanks');
      case 'bye': return R('bye');
      case 'greet': { const r = R('greetBack'); r.chips = ui('suggestions'); return r; }
      case 'sales': return hSales(a);
      case 'summary': return hSummary(a);
      case 'stock': return hStock(a, E, extra.follow);
      case 'price': return hPrice(a, E);
      case 'item_sold': return hItemSold(a, E);
      case 'low': return hLow('low');
      case 'out': return hLow('out');
      case 'best': return hBest(a);
      case 'value': return hValue();
      case 'count': return hCount();
      case 'brand_stock': return hBrandStock(extra.brand);
      case 'top_debtor': return hTopDebtor();
      case 'oldest_debtor': return hOldestDebtor();
      case 'debts': return hDebts();
      case 'balance': return hBalance(a, E);
      case 'invoice': return hInvoice(a, E);
      case 'payment': return hPayment(a, E);
      case 'stock_in': return hStockChange('in', a, E);
      case 'stock_out': return hStockChange('out', a, E);
      case 'move': return hStockChange('move', a, E);
      case 'stock_set': return hStockChange('set', a, E);
      case 'flag': return hFlag(true, a, E);
      case 'unflag': return hFlag(false, a, E);
      case 'add_which': return hAddWhich(a, E);
      case 'report': return hReport(a);
      case 'teach': return hTeach(extra.phrase, extra.target);
      case 'teach_how': return R('teachHow');
      case 'inv_report': ctx.act.inventoryPdf(); return R('invReport');
      case 'nav': {
        const where = extra.to === 'brand' ? extra.brand.name : (pack().where || PACKS.en.where)[extra.to];
        ctx.act.go(extra.to === 'brand' ? `#/brand/${encodeURIComponent(extra.brand.id)}` : `#/${extra.to}`);
        return R('nav', { where });
      }
      case 'pos_open': return posOpenAndAdd(a, E);
      case 'pos_new': { ctx.pos.newSale(); S.undo = []; S.checkout = null; const { lines, unsure } = parseCart(a); return lines.length || unsure.length ? hPosAdd(a, E) : R('posNewSale'); }
      case 'pos_add': return hPosAdd(a, E);
      case 'pos_price': return hPosPrice(a, E);
      case 'pos_qty': return hPosQty(a, E);
      case 'pos_remove': return hPosRemove(a, E);
      case 'pos_read': return hPosRead();
      case 'pos_undo': return hPosUndo();
      case 'pos_clear': return hPosClear();
      case 'pos_checkout': return hCheckout(a, E);
      case 'pos_close': ctx.pos.close(); S.checkout = null; return R('posClosed');
      default: {
        const g = guess(a);
        // hands-free: chatter in the shop that isn't meant for the assistant is quietly ignored
        const shopWords = ['SALES', 'STOCK', 'SHOP', 'WAREHOUSE', 'OWE', 'PAY', 'INVOICE', 'SUMMARY', 'REPORT', 'LOW', 'OUTOF', 'PRICE', 'COUNTER', 'STOCKIN', 'STOCKOUT', 'MOVE', 'CUSTOMER', 'HELP'].some((k) => has(a, k));
        if (extra.voice && !g && !shopWords && E.items.kind === 'none' && E.people.kind === 'none') {
          const q = new Reply(); q.quiet = true; return q;
        }
        const rep = R('sorry');
        if (g && GUESS_RUN[g]) {
          rep.add('didYouMean', { what: (pack().intents || PACKS.en.intents)[g] });
          const target = GUESS_RUN[g];
          return confirm(rep, { onYes: () => run(target, a, E, {}) });
        }
        rep.add('sorryHint');
        rep.chips = ctx.pos.isOpen() ? ui('posSuggestions') : ui('suggestions');
        return rep;
      }
    }
  }

  async function handle(text, opts = {}) {
    const a = N.analyse(text, ctx.now ? ctx.now() : new Date());
    if (!a.tokens.length) return null;
    const E = entities(a);
    const P = S.pending;
    let rep = null;
    if (P) {
      rep = await resolvePending(a, E);
      if (!rep) {
        const u = understand(a, E);
        const readOnly = ['sales', 'summary', 'stock', 'price', 'item_sold', 'low', 'out', 'best', 'value', 'count', 'top_debtor', 'oldest_debtor', 'debts', 'balance', 'invoice', 'help', 'repeat', 'mute', 'unmute', 'lang', 'pos_read', 'brand_stock'].includes(u.intent);
        if (u.intent === 'unknown' || u.intent === 'none' || (P.type === 'confirm' && !readOnly && u.intent.startsWith('pos_') && ctx.pos.isOpen() && false)) {
          rep = P.again();
          if (P.type === 'confirm') rep.lines.unshift(T('sayYesNo'));
        } else if (readOnly && P.type !== 'confirm') {
          // answer the side question, then come back once to what we were doing
          S.pending = null;
          rep = await run(u.intent, a, E, u);
          if (S.pending === null && (P.nag || 0) < 1) {
            S.pending = P; P.nag = (P.nag || 0) + 1;
            const back = P.again();
            if (rep) { rep.lines.push(...back.lines); rep.choices = back.choices || rep.choices; rep.confirm = back.confirm || rep.confirm; } else rep = back;
          } else if (S.pending === null) S.checkout = null;
        } else {
          S.pending = null;
          if (P.type !== 'confirm' || u.intent !== 'unknown') S.checkout = u.intent === 'pos_checkout' ? S.checkout : (u.intent.startsWith('pos_') ? S.checkout : null);
          rep = await run(u.intent, a, E, u);
        }
      }
    } else {
      const u = understand(a, E);
      rep = await run(u.intent, a, E, { ...u, voice: !!opts.voice });
      if (rep) rep.intent = u.intent;
    }
    if (rep && rep.lines.length) S.lastReply = rep;
    return rep;
  }

  function greet() {
    const h = (ctx.now ? ctx.now() : new Date()).getHours();
    const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    const rep = R('hello', { part, shop: settings().shopName || 'your shop' }).add('ask');
    rep.chips = ctx.pos.isOpen() ? ui('posSuggestions') : ui('suggestions');
    return rep;
  }

  /** a typed/tapped yes/no/choice from the UI buttons */
  async function answer(kind, value) {
    const P = S.pending;
    if (!P) return null;
    if (P.type === 'choose' && kind === 'choice') { S.pending = null; return P.onPick(P.options[value]); }
    if (P.type === 'confirm' && kind === 'yes') { S.pending = null; return P.onYes(); }
    if (kind === 'no') { S.pending = null; S.checkout = P.type === 'confirm' ? S.checkout : null; return P.onNo ? P.onNo() : R('cancelled'); }
    return null;
  }

  return {
    handle, greet, answer,
    get pending() { return S.pending ? S.pending.type : null; },
    reset() { S.pending = null; S.checkout = null; S.queue = []; },
    ui, T,
    /** for tests and a future cloud engine */
    _understand: (text) => { const a = N.analyse(text, ctx.now ? ctx.now() : new Date()); return understand(a, entities(a)); },
  };
}
