// =====================================================================
//  AKASH SHOP C1 · Inventory and Sales Report PDFs
//  Built on the same dependency-free PDF writer as the invoices.
// =====================================================================
import { Doc, C } from './pdf.js';

const STATUS_PILL = { ok: ['IN STOCK', C.ok, C.okSoft], low: ['LOW STOCK', C.warn, C.warnSoft], out: ['OUT OF STOCK', C.bad, C.badSoft] };

/* ---------- shared pieces ---------- */
function bigHeader(d, { shop, title, sub, meta, height = 132 }) {
  const W = d.W, L = 36, R = W - 36;
  d.rect(0, 0, W, height, C.navy);
  d.circle(W - 40, 0, height + 30, C.navy2);
  d.circle(W - 10, height, 60, '#12406e');
  d.rect(0, height, W, d.H - height, '#ffffff');
  d.rect(0, height, W, 4, C.saffron);
  d.round(L, 34, 46, 46, 11, C.saffron);
  d.text('C1', L + 23, 64, { size: 18, bold: true, color: C.navy, align: 'center' });
  d.text(d.fit(shop.shop_name || 'AKASH SHOP C1', 260, 19, true), L + 60, 54, { size: 19, bold: true, color: '#ffffff' });
  const line = [shop.address, shop.phone].filter(Boolean).join('  ·  ');
  if (line) d.text(d.fit(line, 280, 8.5, false), L + 60, 70, { size: 8.5, color: '#b8c7dc' });
  d.text(title, R, 60, { size: 25, bold: true, color: '#ffffff', align: 'right', spacing: 1.5 });
  d.text(sub, R, 82, { size: 12, bold: true, color: C.saffron, align: 'right' });
  if (meta) d.text(meta, R, 98, { size: 8.5, color: '#b8c7dc', align: 'right' });
}
function slimHeader(d, shopName, label) {
  const W = d.W;
  d.rect(0, 0, W, 50, C.navy);
  d.rect(0, 50, W, 3, C.saffron);
  d.text(shopName || 'AKASH SHOP C1', 36, 31, { size: 12, bold: true, color: '#ffffff' });
  d.text(label, W - 36, 31, { size: 9.5, bold: true, color: C.saffron, align: 'right' });
}
function pageNumbers(d, label) {
  const n = d.pages.length;
  d.pages.forEach((ops, i) => {
    d.ops = ops;
    d.text(`${label}  ·  Page ${i + 1} of ${n}`, d.W - 36, d.H - 16, { size: 7.5, color: C.faint, align: 'right' });
  });
}
function tile(d, x, y, w, h, label, value, opts = {}) {
  d.round(x, y, w, h, 9, opts.bg || C.soft);
  d.text(label.toUpperCase(), x + 12, y + 17, { size: 7, bold: true, color: opts.lc || C.faint, spacing: 0.7 });
  d.text(d.fit(value, w - 24, opts.size || 17, true), x + 12, y + 17 + (opts.size || 17) + 4, { size: opts.size || 17, bold: true, color: opts.color || C.ink });
  if (opts.sub) d.text(d.fit(opts.sub, w - 24, 7.5, false), x + 12, y + h - 9, { size: 7.5, color: opts.sc || C.muted });
}
/** Horizontal stacked bar with legend underneath. parts: [{label, value, color, text}] */
function stackBar(d, x, y, w, title, parts) {
  d.text(title.toUpperCase(), x, y, { size: 7, bold: true, color: C.faint, spacing: 0.7 });
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  d.round(x, y + 7, w, 10, 5, C.line);
  let cx = x;
  parts.forEach((p) => { const pw = (p.value / total) * w; if (pw > 0.5) d.rect(cx, y + 7, pw, 10, p.color); cx += pw; });
  let lx = x;
  parts.forEach((p) => {
    d.circle(lx + 3, y + 29, 3, p.color);
    const t = `${p.label} ${p.text}`;
    d.text(t, lx + 10, y + 32, { size: 8, color: C.muted });
    lx += d.measure(t, 8, false) + 26;
  });
}

/* =====================================================================
   INVENTORY REPORT (landscape)
   data = { shop, groups:[{name,color,items:[…],count,units,value}], summary, money, generated }
   item = { name, sku, category, notes, shop_qty, warehouse_qty, total, threshold, price, value, status, flagged, refill }
===================================================================== */
export function buildInventoryPdf(data) {
  const { shop, groups, summary: s, money, generated } = data;
  const d = new Doc(841.89, 595.28);
  const W = d.W, H = d.H, L = 36, R = W - 36;
  const X = { n: L + 12, item: L + 28, shop: 418, wh: 488, tot: 548, alert: 606, price: 676, val: 750, st: 760 };

  d.page();
  bigHeader(d, { shop, title: 'INVENTORY REPORT', sub: generated, meta: `${s.count} products  ·  ${s.brands} brands`, height: 118 });

  // summary tiles
  const tiles = [
    ['Products', String(s.count), { sub: `${s.brands} brand tab${s.brands === 1 ? '' : 's'}` }],
    ['Units in shop', s.shopTxt, { sub: `${s.shopPct}% of all stock` }],
    ['Units in warehouse', s.whTxt, { sub: `${100 - s.shopPct}% of all stock` }],
    ['Stock value', money(s.value), { color: C.ok, sub: `${s.unitsTxt} units in total` }],
    ['Low stock', String(s.low), { color: s.low ? C.warn : C.ok, bg: s.low ? C.warnSoft : C.soft, sub: 'At or below alert level' }],
    ['Out of stock', String(s.out), { color: s.out ? C.bad : C.ok, bg: s.out ? C.badSoft : C.soft, sub: 'Includes flagged items' }],
  ];
  const tw = (R - L - 5 * 10) / 6;
  tiles.forEach(([l, v, o], i) => tile(d, L + i * (tw + 10), 138, tw, 62, l, v, o));

  stackBar(d, L, 222, (R - L) / 2 - 20, 'Stock health', [
    { label: 'In stock', value: s.ok, color: C.ok, text: String(s.ok) },
    { label: 'Low', value: s.low, color: C.warn, text: String(s.low) },
    { label: 'Out', value: s.out, color: C.bad, text: String(s.out) },
  ]);
  stackBar(d, L + (R - L) / 2 + 20, 222, (R - L) / 2 - 20, 'Where the stock is', [
    { label: 'Shop', value: s.shop, color: C.sky, text: s.shopTxt },
    { label: 'Warehouse', value: s.wh, color: '#1e3a5f', text: s.whTxt },
  ]);

  const head = (y) => {
    d.round(L, y, R - L, 24, 6, C.navy);
    const o = { size: 7.5, bold: true, color: '#ffffff', spacing: 0.6 };
    d.text('#', X.n, y + 15.5, { ...o, align: 'center' });
    d.text('ITEM', X.item, y + 15.5, o);
    d.text('SHOP', X.shop, y + 15.5, { ...o, align: 'right' });
    d.text('WAREHOUSE', X.wh, y + 15.5, { ...o, align: 'right' });
    d.text('TOTAL', X.tot, y + 15.5, { ...o, align: 'right' });
    d.text('ALERT AT', X.alert, y + 15.5, { ...o, align: 'right' });
    d.text('UNIT PRICE', X.price, y + 15.5, { ...o, align: 'right' });
    d.text('STOCK VALUE', X.val, y + 15.5, { ...o, align: 'right' });
    d.text('STATUS', X.st + 6, y + 15.5, o);
    return y + 24;
  };
  const BOTTOM = H - 34;
  const newPage = () => { d.page(); slimHeader(d, shop.shop_name, `Inventory report · ${generated}`); return head(70); };

  let y = head(262);
  let n = 0;
  for (const g of groups) {
    if (y + 24 + 28 > BOTTOM) y = newPage();
    d.rect(L, y, R - L, 24, '#eef3f9');
    d.circle(L + 12, y + 12, 4, g.color);
    d.text(d.fit(g.name, 300, 10.5, true), L + 24, y + 16, { size: 10.5, bold: true, color: C.ink });
    d.text(`${g.count} item${g.count === 1 ? '' : 's'}  ·  ${g.unitsTxt} units  ·  ${money(g.value)}`, R - 10, y + 16, { size: 8.5, bold: true, color: C.muted, align: 'right' });
    y += 24;
    g.items.forEach((it, i) => {
      if (y + 28 > BOTTOM) { y = newPage(); }
      n++;
      if (i % 2) d.rect(L, y, R - L, 28, C.zebra);
      const sub = [it.sku, it.category, it.notes].filter(Boolean).join('  ·  ');
      const base = sub ? y + 12 : y + 17;
      d.text(String(n), X.n, base, { size: 8, color: C.faint, align: 'center' });
      d.text(d.fit(it.name, X.shop - X.item - 70, 9.5, true), X.item, base, { size: 9.5, bold: true, color: C.ink });
      if (sub) d.text(d.fit(sub, X.shop - X.item - 60, 7.5, false), X.item, base + 11, { size: 7.5, color: C.faint });
      const qc = (v) => (v === 0 ? C.bad : C.ink);
      d.text(it.shopTxt, X.shop, y + 17, { size: 9.5, color: qc(it.shop_qty), bold: it.shop_qty === 0, align: 'right' });
      d.text(it.whTxt, X.wh, y + 17, { size: 9.5, color: qc(it.warehouse_qty), bold: it.warehouse_qty === 0, align: 'right' });
      d.text(it.totalTxt, X.tot, y + 17, { size: 9.5, bold: true, color: C.ink, align: 'right' });
      d.text(String(it.threshold), X.alert, y + 17, { size: 9, color: C.muted, align: 'right' });
      d.text(money(it.price), X.price, y + 17, { size: 9, color: C.muted, align: 'right' });
      d.text(money(it.value), X.val, y + 17, { size: 9.5, bold: true, color: C.ink, align: 'right' });
      const [pl, pc, pb] = it.flagged ? ['FLAGGED OUT', C.bad, C.badSoft] : STATUS_PILL[it.status];
      const pw = d.measure(pl, 6.5, true, 0.4) + 12;
      d.round(X.st + 6, y + 8, pw, 13, 6.5, pb);
      d.text(pl, X.st + 6 + pw / 2, y + 17, { size: 6.5, bold: true, color: pc, align: 'center', spacing: 0.4 });
      y += 28;
      d.line(L, y, R, y, C.line, 0.5);
    });
  }
  if (!groups.length) { d.text('No items in the inventory yet.', W / 2, y + 30, { size: 11, color: C.muted, align: 'center' }); y += 50; }

  // grand total
  if (y + 34 > BOTTOM) y = newPage();
  y += 6;
  d.round(L, y, R - L, 28, 7, C.navy);
  d.text(`ALL ITEMS  ·  ${s.count} products`, L + 14, y + 18, { size: 8.5, bold: true, color: '#ffffff', spacing: 0.6 });
  d.text(s.shopTxt, X.shop, y + 18, { size: 9.5, bold: true, color: '#ffffff', align: 'right' });
  d.text(s.whTxt, X.wh, y + 18, { size: 9.5, bold: true, color: '#ffffff', align: 'right' });
  d.text(s.unitsTxt, X.tot, y + 18, { size: 9.5, bold: true, color: '#ffffff', align: 'right' });
  d.text(money(s.value), X.val, y + 18, { size: 10.5, bold: true, color: C.saffron, align: 'right' });

  pageNumbers(d, `Inventory report · ${generated}`);
  return d.bytes('Inventory report');
}

/* =====================================================================
   SALES REPORT (portrait)
   r = see salesReportData() in app.js
===================================================================== */
export function buildSalesReportPdf(r) {
  const { shop, money, moneyShort } = r;
  const d = new Doc();
  const W = d.W, H = d.H, L = 40, R = W - 40;

  /* ---------------- page 1: summary ---------------- */
  d.page();
  bigHeader(d, { shop, title: 'SALES REPORT', sub: r.label, meta: `Generated ${r.generated}`, height: 136 });

  // hero
  let y = 160;
  d.round(L, y, R - L, 104, 14, C.navy);
  d.text(r.days === 1 ? 'TOTAL SALES FOR THE DAY' : 'TOTAL SALES FOR THE PERIOD', L + 20, y + 26, { size: 8, bold: true, color: '#9fb3cf', spacing: 1 });
  d.text(money(r.total), L + 20, y + 64, { size: 32, bold: true, color: C.saffron });
  d.text(`Money received  ·  ${r.rangeText}`, L + 20, y + 86, { size: 8.5, color: '#b8c7dc' });
  const mini = [
    ['TRANSACTIONS', String(r.count)],
    [r.days === 1 ? 'AVERAGE SALE' : 'AVERAGE PER DAY', money(r.days === 1 ? (r.count ? r.total / r.count : 0) : r.avgPerDay)],
    [r.bestTitle, r.best ? r.best.label : '—'],
  ];
  mini.forEach(([l, v], i) => {
    const mx = 300 + i * 85, my = y + 30;
    if (i) d.rect(mx - 10, y + 22, 0.6, 58, '#2a4466');
    d.text(l, mx, my, { size: 6.5, bold: true, color: '#9fb3cf', spacing: 0.6 });
    d.text(d.fit(v, 78, 12, true), mx, my + 20, { size: 12, bold: true, color: '#ffffff' });
    if (i === 2 && r.best) d.text(money(r.best.amount), mx, my + 34, { size: 8, color: C.saffron, bold: true });
  });

  // tiles
  y += 120;
  const tw = (R - L - 30) / 4;
  [
    ['Invoices issued', String(r.issuedCount), { sub: `${money(r.issuedValue)} invoiced` }],
    ['Units sold', String(r.units), { sub: `${r.lineCount} item line${r.lineCount === 1 ? '' : 's'}` }],
    ['From earlier invoices', money(r.earlier), { color: C.ok, sub: `${r.earlierCount} payment${r.earlierCount === 1 ? '' : 's'} on old balances`, size: 15 }],
    ['Still owed', money(r.stillOwed), { color: r.stillOwed > 0 ? C.bad : C.ok, bg: r.stillOwed > 0 ? C.badSoft : C.soft, sub: 'On invoices from this period', size: 15 }],
  ].forEach(([l, v, o], i) => tile(d, L + i * (tw + 10), y, tw, 62, l, v, o));

  // chart
  y += 80;
  const ch = { x: L, y, w: R - L, h: 210 };
  d.round(ch.x, ch.y, ch.w, ch.h, 10, null, C.line, 0.8);
  d.text(r.unit === 'hour' ? 'Sales by hour' : r.unit === 'month' ? 'Sales by month' : 'Sales by day', ch.x + 16, ch.y + 22, { size: 11, bold: true, color: C.ink });
  d.text('Money received', ch.x + ch.w - 16, ch.y + 22, { size: 8, color: C.faint, align: 'right' });
  const pa = { x: ch.x + 58, y: ch.y + 40, w: ch.w - 74, h: ch.h - 72 };
  const max = Math.max(...r.series.map((p) => p.value), 0);
  const step = niceStep(max / 4);
  const top = Math.max(step * 4, step);
  for (let g = 0; g <= 4; g++) {
    const gy = pa.y + pa.h - (g / 4) * pa.h;
    d.line(pa.x, gy, pa.x + pa.w, gy, g ? '#edf1f6' : C.line, g ? 0.5 : 0.8);
    d.text(moneyShort(step * g), pa.x - 6, gy + 3, { size: 7, color: C.faint, align: 'right' });
  }
  const n = r.series.length || 1;
  const slot = pa.w / n, bw = Math.max(1.5, Math.min(26, slot * 0.68));
  const labelEvery = Math.ceil(n / 12);
  r.series.forEach((p, i) => {
    const bh = top ? (p.value / top) * pa.h : 0;
    const bx = pa.x + i * slot + (slot - bw) / 2;
    if (bh > 0) d.round(bx, pa.y + pa.h - bh, bw, bh, Math.min(3, bw / 2, bh / 2), p.best ? C.saffron : C.sky);
    const lastFar = i === n - 1 && (n - 1) % labelEvery >= Math.ceil(labelEvery * 0.7);
    if (i % labelEvery === 0 || lastFar) d.text(p.short, pa.x + i * slot + slot / 2, pa.y + pa.h + 13, { size: 6.5, color: C.muted, align: 'center' });
  });
  if (!max) d.text('No money received in this period', pa.x + pa.w / 2, pa.y + pa.h / 2, { size: 10, color: C.faint, align: 'center' });

  // methods + best sellers
  y = ch.y + ch.h + 18;
  const colW = (R - L - 20) / 2;
  d.round(L, y, colW, 168, 10, C.soft);
  d.text('How customers paid', L + 14, y + 22, { size: 11, bold: true, color: C.ink });
  const mColors = { Cash: C.ok, Card: C.sky, 'Bank transfer': '#8b5cf6' };
  let my = y + 46;
  if (!r.total) d.text('No payments in this period', L + 14, my, { size: 9, color: C.muted });
  for (const m of r.methods) {
    const pct = r.total ? m.amount / r.total : 0;
    d.text(m.name, L + 14, my, { size: 9, bold: true, color: C.ink });
    d.text(`${money(m.amount)}  ·  ${Math.round(pct * 100)}%`, L + colW - 14, my, { size: 9, color: C.muted, align: 'right' });
    d.round(L + 14, my + 6, colW - 28, 7, 3.5, C.line);
    if (pct > 0) d.round(L + 14, my + 6, Math.max(7, (colW - 28) * pct), 7, 3.5, mColors[m.name] || C.sky);
    d.text(`${m.count} payment${m.count === 1 ? '' : 's'}`, L + 14, my + 24, { size: 7.5, color: C.faint });
    my += 40;
  }

  const bx = L + colW + 20;
  d.round(bx, y, colW, 168, 10, C.soft);
  d.text('Best sellers', bx + 14, y + 22, { size: 11, bold: true, color: C.ink });
  d.text('UNITS', bx + colW - 84, y + 22, { size: 6.5, bold: true, color: C.faint, align: 'right', spacing: 0.5 });
  d.text('VALUE', bx + colW - 14, y + 22, { size: 6.5, bold: true, color: C.faint, align: 'right', spacing: 0.5 });
  let by = y + 44;
  if (!r.topItems.length) d.text('No items sold in this period', bx + 14, by, { size: 9, color: C.muted });
  r.topItems.slice(0, 6).forEach((t, i) => {
    d.round(bx + 14, by - 9, 14, 13, 4, i === 0 ? C.saffron : '#ffffff');
    d.text(String(i + 1), bx + 21, by + 0.5, { size: 7, bold: true, color: C.navy, align: 'center' });
    d.text(d.fit(t.name, colW - 150, 9, false), bx + 34, by, { size: 9, color: C.ink });
    d.text(String(t.units), bx + colW - 84, by, { size: 9, bold: true, color: C.ink, align: 'right' });
    d.text(money(t.value), bx + colW - 14, by, { size: 9, bold: true, color: C.ink, align: 'right' });
    by += 20;
  });

  // how it's counted
  y += 184;
  d.round(L, y, R - L, 40, 8, '#eef6fd');
  d.rect(L, y, 3, 40, C.sky);
  d.text('How sales are counted', L + 14, y + 16, { size: 8.5, bold: true, color: C.sky });
  d.text('Sales are counted on the day the money is received. Unpaid balances count only when the customer pays.', L + 14, y + 30, { size: 8, color: C.muted });

  /* ---------------- page 2+: statement ---------------- */
  const label = `Sales statement · ${r.label}`;
  d.page(); slimHeader(d, shop.shop_name, label);
  y = 80;
  d.text('Sales statement', L, y, { size: 20, bold: true, color: C.ink });
  d.text(r.rangeText, L, y + 18, { size: 9, color: C.muted });
  y += 34;
  const sw = (R - L - 20) / 3;
  [['Opening balance', money(0), C.ink], ['Money in', money(r.total), C.ok], ['Closing total', money(r.total), C.navy]].forEach(([l, v, c], i) => {
    d.round(L + i * (sw + 10), y, sw, 44, 8, i === 2 ? '#eef3f9' : C.soft);
    d.text(l.toUpperCase(), L + i * (sw + 10) + 12, y + 16, { size: 7, bold: true, color: C.faint, spacing: 0.6 });
    d.text(v, L + i * (sw + 10) + 12, y + 35, { size: 13, bold: true, color: c });
  });
  y += 60;

  const T = { time: L + 10, ref: L + 52, det: L + 116, meth: 392, inn: 480, bal: R - 10 };
  const thead = (yy) => {
    d.round(L, yy, R - L, 22, 6, C.navy);
    const o = { size: 7, bold: true, color: '#ffffff', spacing: 0.6 };
    d.text('TIME', T.time, yy + 14.5, o);
    d.text('REFERENCE', T.ref, yy + 14.5, o);
    d.text('DETAILS', T.det, yy + 14.5, o);
    d.text('METHOD', T.meth, yy + 14.5, o);
    d.text('MONEY IN', T.inn, yy + 14.5, { ...o, align: 'right' });
    d.text('BALANCE', T.bal, yy + 14.5, { ...o, align: 'right' });
    return yy + 22;
  };
  const BOTTOM = H - 36;
  const more = () => { d.page(); slimHeader(d, shop.shop_name, label); return thead(70); };
  y = thead(y);
  let run = 0;
  if (!r.timeline.length) {
    d.text('No sales in this period.', W / 2, y + 30, { size: 10, color: C.muted, align: 'center' });
    y += 50;
  }
  for (const day of r.timeline) {
    if (y + 22 + 22 > BOTTOM) y = more();
    d.rect(L, y, R - L, 22, '#eef3f9');
    d.text(day.label, L + 10, y + 14.5, { size: 9, bold: true, color: C.ink });
    d.text(`Day total ${money(day.total)}`, R - 10, y + 14.5, { size: 8.5, bold: true, color: day.total ? C.ok : C.faint, align: 'right' });
    y += 22;
    day.rows.forEach((row, i) => {
      if (y + 22 > BOTTOM) { y = more(); }
      if (i % 2) d.rect(L, y, R - L, 22, C.zebra);
      const grey = row.amount == null;
      if (!grey) run += row.amount;
      const col = grey ? C.faint : C.ink;
      d.text(row.time, T.time, y + 14.5, { size: 8, color: C.muted });
      d.text(row.ref, T.ref, y + 14.5, { size: 8, bold: true, color: col });
      d.text(d.fit(row.details, T.meth - T.det - 10, 8, false), T.det, y + 14.5, { size: 8, color: grey ? C.faint : C.ink });
      d.text(row.method || '—', T.meth, y + 14.5, { size: 8, color: C.muted });
      d.text(grey ? '—' : money(row.amount), T.inn, y + 14.5, { size: 8.5, bold: !grey, color: grey ? C.faint : C.ok, align: 'right' });
      d.text(money(run), T.bal, y + 14.5, { size: 8.5, color: C.ink, align: 'right' });
      y += 22;
      d.line(L, y, R, y, C.line, 0.4);
    });
  }
  if (y + 40 > BOTTOM) y = more();
  y += 8;
  d.round(L, y, R - L, 30, 7, C.navy);
  d.text(`CLOSING TOTAL  ·  ${r.count} transaction${r.count === 1 ? '' : 's'}`, L + 14, y + 19, { size: 8.5, bold: true, color: '#ffffff', spacing: 0.6 });
  d.text(money(r.total), R - 14, y + 20, { size: 12, bold: true, color: C.saffron, align: 'right' });
  y += 44;
  if (r.creditRows && y + 20 < BOTTOM) {
    d.text('Grey lines are sales given on credit: they count as sales only when the money is received.', L, y, { size: 7.5, color: C.faint });
  }

  pageNumbers(d, `Sales report · ${r.label}`);
  return d.bytes(`Sales report ${r.label}`);
}

function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
