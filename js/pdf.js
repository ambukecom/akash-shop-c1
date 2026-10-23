// =====================================================================
//  AKASH SHOP C1 · Invoice PDF builder
//  Writes the PDF directly (no outside libraries), so invoices always
//  generate even if a CDN is down. Uses the built-in Helvetica fonts.
// =====================================================================

/* ---------- Helvetica metrics (Windows-1252 codes 32–255, per 1000 em) ---------- */
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

// Unicode → Windows-1252 for the characters that live in 0x80–0x9F
const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };

/** Convert text to single-byte Windows-1252; unknown characters become '?'. */
export function toWinAnsi(str) {
  let out = '';
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if (c === 0x202f || c === 0x2009 || c === 0x2007) out += ' ';
    else if ((c >= 32 && c < 127) || (c >= 0xa0 && c <= 0xff)) out += ch;
    else if (CP1252[ch]) out += String.fromCharCode(CP1252[ch]);
    else if (c === 10 || c === 9) out += ' ';
    else out += '?';
  }
  return out;
}
/** True when every character can be printed with the built-in fonts. */
export const winAnsiSafe = (s) => !toWinAnsi(s).includes('?') || String(s).includes('?');

function widthOf(str, size, bold, spacing = 0) {
  const t = bold ? W_BOLD : W_REG;
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    w += (c >= 32 && c <= 255 ? t[c - 32] || 556 : 556);
  }
  return (w * size) / 1000 + spacing * Math.max(0, str.length - 1);
}

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => +v.toFixed(3)).join(' ');
};
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const f = (n) => +n.toFixed(2);

/* ---------- tiny PDF canvas (top-left origin, points) ---------- */
class Doc {
  constructor(w = 595.28, h = 841.89) { this.W = w; this.H = h; this.pages = []; }
  page() { this.ops = []; this.pages.push(this.ops); return this; }
  y(v) { return f(this.H - v); }

  rect(x, y, w, h, fill) { this.ops.push(`${hex(fill)} rg ${f(x)} ${this.y(y + h)} ${f(w)} ${f(h)} re f`); }
  round(x, y, w, h, r, fill, stroke, lw = 1) {
    const k = 0.5523 * r, X = f(x), Y = this.H - y, R = f(x + w), B = this.H - (y + h);
    const p = [
      `${f(x + r)} ${f(Y)} m`, `${f(x + w - r)} ${f(Y)} l`,
      `${f(x + w - r + k)} ${f(Y)} ${R} ${f(Y - r + k)} ${R} ${f(Y - r)} c`, `${R} ${f(B + r)} l`,
      `${R} ${f(B + r - k)} ${f(x + w - r + k)} ${f(B)} ${f(x + w - r)} ${f(B)} c`, `${f(x + r)} ${f(B)} l`,
      `${f(x + r - k)} ${f(B)} ${X} ${f(B + r - k)} ${X} ${f(B + r)} c`, `${X} ${f(Y - r)} l`,
      `${X} ${f(Y - r + k)} ${f(x + r - k)} ${f(Y)} ${f(x + r)} ${f(Y)} c`, 'h',
    ].join(' ');
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.ops.push(`${fill ? hex(fill) + ' rg ' : ''}${stroke ? hex(stroke) + ' RG ' + lw + ' w ' : ''}${p} ${paint}`);
  }
  circle(cx, cy, r, fill) {
    const k = 0.5523 * r, X = cx, Y = this.H - cy;
    this.ops.push(`${hex(fill)} rg ${f(X + r)} ${f(Y)} m ${f(X + r)} ${f(Y + k)} ${f(X + k)} ${f(Y + r)} ${f(X)} ${f(Y + r)} c `
      + `${f(X - k)} ${f(Y + r)} ${f(X - r)} ${f(Y + k)} ${f(X - r)} ${f(Y)} c ${f(X - r)} ${f(Y - k)} ${f(X - k)} ${f(Y - r)} ${f(X)} ${f(Y - r)} c `
      + `${f(X + k)} ${f(Y - r)} ${f(X + r)} ${f(Y - k)} ${f(X + r)} ${f(Y)} c f`);
  }
  line(x1, y1, x2, y2, color, lw = 0.75) { this.ops.push(`${hex(color)} RG ${lw} w ${f(x1)} ${this.y(y1)} m ${f(x2)} ${this.y(y2)} l S`); }

  /** y is the text baseline. align: left | right | center. */
  text(str, x, y, { size = 10, bold = false, color = '#0f1b2d', align = 'left', spacing = 0 } = {}) {
    const s = toWinAnsi(str);
    if (!s) return 0;
    const w = widthOf(s, size, bold, spacing);
    const tx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${spacing ? spacing + ' Tc ' : ''}${hex(color)} rg ${f(tx)} ${this.y(y)} Td (${esc(s)}) Tj${spacing ? ' 0 Tc' : ''} ET`);
    return w;
  }
  measure(str, size, bold, spacing = 0) { return widthOf(toWinAnsi(str), size, bold, spacing); }
  fit(str, maxW, size, bold) {
    let s = toWinAnsi(str);
    if (widthOf(s, size, bold) <= maxW) return s;
    while (s.length > 1 && widthOf(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  wrap(str, maxW, size, bold, maxLines = 3) {
    const lines = [];
    for (const para of String(str ?? '').split(/\r?\n/)) {
      let cur = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = cur ? cur + ' ' + word : word;
        if (widthOf(toWinAnsi(t), size, bold) <= maxW || !cur) cur = t; else { lines.push(cur); cur = word; }
      }
      if (cur) lines.push(cur);
    }
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = this.fit(lines[maxLines - 1] + ' …', maxW, size, bold); }
    return lines.map((l) => this.fit(l, maxW, size, bold));
  }

  bytes(title = 'Invoice') {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const body = ops.join('\n');
      const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title (${esc(toWinAnsi(title))}) /Producer (AKASH SHOP C1 Inventory Tracker) >>`);

    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const u8 = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
    return u8;
  }
}

/* ---------- invoice layout ---------- */
const C = {
  navy: '#0a1a33', navy2: '#0f2f57', sky: '#0b84d6', saffron: '#f59e0b', ink: '#0f1b2d', muted: '#5c6b80', faint: '#8a97a9',
  line: '#e2e8f0', soft: '#f3f6fa', zebra: '#f8fafc', ok: '#16a34a', okSoft: '#e7f6ec', warn: '#d97706', warnSoft: '#fff3df', bad: '#dc2626', badSoft: '#fdeaea',
};

/**
 * data = { shop, sale, lines, payments, money(n) → string, date(iso) → string, dateTime(iso) → string }
 * Returns a Uint8Array containing the PDF.
 */
export function buildInvoicePdf(data) {
  const { shop, sale, lines, payments = [], money, date, dateTime } = data;
  const d = new Doc();
  const W = d.W, H = d.H, L = 40, R = W - 40;
  const total = Number(sale.total), paid = Number(sale.amount_paid), due = Math.max(0, +(total - paid).toFixed(2));
  const status = due <= 0 ? ['PAID IN FULL', C.ok, C.okSoft] : paid > 0 ? ['PART PAID', C.warn, C.warnSoft] : ['UNPAID', C.bad, C.badSoft];
  const shopName = shop.shop_name || 'AKASH SHOP C1';
  const contact = [shop.phone, shop.email].filter(Boolean).join('  ·  ');

  const cols = { n: L + 12, item: L + 36, qty: 372, price: 462, amt: R - 12 };

  function fullHeader() {
    d.rect(0, 0, W, 150, C.navy);
    d.circle(W - 30, 10, 170, C.navy2);
    d.circle(W - 10, 150, 70, '#12406e');
    d.rect(0, 150, W, H - 150, '#ffffff');
    d.rect(0, 150, W, 4, C.saffron);
    d.round(L, 38, 48, 48, 11, C.saffron);
    d.text('C1', L + 24, 69, { size: 19, bold: true, color: C.navy, align: 'center' });
    d.text(d.fit(shopName, 250, 20, true), L + 62, 58, { size: 20, bold: true, color: '#ffffff' });
    let y = 76;
    for (const l of d.wrap(shop.address || '', 250, 9, false, 2)) { d.text(l, L + 62, y, { size: 9, color: '#b8c7dc' }); y += 12; }
    if (contact) d.text(d.fit(contact, 260, 9, false), L + 62, y, { size: 9, color: '#b8c7dc' });
    d.text('INVOICE', R, 66, { size: 30, bold: true, color: '#ffffff', align: 'right', spacing: 2 });
    d.text(sale.invoice_no, R, 88, { size: 13, bold: true, color: C.saffron, align: 'right' });
    d.text(dateTime(sale.created_at), R, 105, { size: 9, color: '#b8c7dc', align: 'right' });
  }
  function slimHeader() {
    d.rect(0, 0, W, 56, C.navy);
    d.rect(0, 56, W, 3, C.saffron);
    d.text(shopName, L, 34, { size: 13, bold: true, color: '#ffffff' });
    d.text(`Invoice ${sale.invoice_no} (continued)`, R, 34, { size: 10, bold: true, color: C.saffron, align: 'right' });
  }
  function tableHead(y) {
    d.round(L, y, R - L, 26, 6, C.navy);
    const o = { size: 8, bold: true, color: '#ffffff', spacing: 0.8 };
    d.text('#', cols.n, y + 17, { ...o, align: 'center' });
    d.text('ITEM', cols.item, y + 17, o);
    d.text('QTY', cols.qty, y + 17, { ...o, align: 'right' });
    d.text('UNIT PRICE', cols.price, y + 17, { ...o, align: 'right' });
    d.text('AMOUNT', cols.amt, y + 17, { ...o, align: 'right' });
    return y + 26;
  }

  d.page(); fullHeader();

  // ---- billed to / summary ----
  let y = 186;
  d.text('BILLED TO', L, y, { size: 8, bold: true, color: C.faint, spacing: 1 });
  d.text(d.fit(sale.customer_name || 'Private customer', 260, 15, true), L, y + 20, { size: 15, bold: true, color: C.ink });
  let by = y + 36;
  for (const l of d.wrap(sale.customer_address || '', 260, 9.5, false, 3)) { d.text(l, L, by, { size: 9.5, color: C.muted }); by += 13; }
  if (sale.customer_phone) { d.text(`Tel: ${sale.customer_phone}`, L, by, { size: 9.5, color: C.muted }); by += 13; }
  if (sale.is_private && !sale.customer_address && !sale.customer_phone) { d.text('Walk-in customer', L, by, { size: 9.5, color: C.muted }); by += 13; }

  const bx = 330, bw = R - bx;
  d.round(bx, y - 14, bw, 92, 10, C.soft);
  const row = (label, value, yy) => {
    d.text(label, bx + 14, yy, { size: 9, color: C.muted });
    d.text(d.fit(value, 120, 9.5, true), R - 14, yy, { size: 9.5, bold: true, color: C.ink, align: 'right' });
  };
  row('Invoice number', sale.invoice_no, y + 6);
  row('Invoice date', date(sale.created_at), y + 24);
  row('Payment method', sale.payment_method, y + 42);
  d.text('Status', bx + 14, y + 61, { size: 9, color: C.muted });
  const sw = d.measure(status[0], 8, true, 0.6) + 18;
  d.round(R - 14 - sw, y + 50, sw, 16, 8, status[2]);
  d.text(status[0], R - 14 - sw / 2, y + 61, { size: 8, bold: true, color: status[1], align: 'center', spacing: 0.6 });

  // ---- items ----
  y = Math.max(by, y + 80) + 22;
  y = tableHead(y);
  const BOTTOM = H - 60;
  lines.forEach((ln, i) => {
    const rh = ln.sku ? 34 : 26;
    if (y + rh > BOTTOM) { d.page(); slimHeader(); y = tableHead(84); }
    if (i % 2) d.rect(L, y, R - L, rh, C.zebra);
    const base = y + (ln.sku ? 15 : 17);
    d.text(String(i + 1), cols.n, base, { size: 9, color: C.faint, align: 'center' });
    d.text(d.fit(ln.item_name, cols.qty - cols.item - 50, 10, true), cols.item, base, { size: 10, bold: true, color: C.ink });
    if (ln.sku) d.text(d.fit(`SKU ${ln.sku}`, 200, 8, false), cols.item, base + 12, { size: 8, color: C.faint });
    d.text(String(ln.qty), cols.qty, base, { size: 10, color: C.ink, align: 'right' });
    d.text(money(ln.unit_price), cols.price, base, { size: 10, color: C.muted, align: 'right' });
    d.text(money(ln.line_total), cols.amt, base, { size: 10, bold: true, color: C.ink, align: 'right' });
    y += rh;
    d.line(L, y, R, y, C.line, 0.6);
  });

  // ---- totals + payments ----
  const units = lines.reduce((a, l) => a + Number(l.qty), 0);
  const payH = payments.length ? 30 + payments.length * 16 : 0;
  const blockH = Math.max(150, payH + 20);
  const FOOTER_TOP = H - 118;
  if (y + 20 + blockH > FOOTER_TOP) { d.page(); slimHeader(); y = 84; } else y += 20;

  const tx = 330, tw = R - tx;
  const trow = (label, value, yy, o = {}) => {
    d.text(label, tx + 14, yy, { size: 10, color: o.lc || C.muted, bold: !!o.bold });
    d.text(value, R - 14, yy, { size: o.size || 10, bold: o.bold !== false, color: o.color || C.ink, align: 'right' });
  };
  trow(`Subtotal (${units} item${units === 1 ? '' : 's'})`, money(total), y + 14);
  d.round(tx, y + 26, tw, 36, 8, C.navy);
  d.text('TOTAL', tx + 14, y + 49, { size: 10, bold: true, color: '#ffffff', spacing: 1 });
  d.text(money(total), R - 14, y + 50, { size: 15, bold: true, color: C.saffron, align: 'right' });
  trow('Amount paid', money(paid), y + 82, { color: C.ok });
  d.line(tx + 14, y + 92, R - 14, y + 92, C.line);
  trow('Balance due', money(due), y + 110, { bold: true, lc: C.ink, size: 12, color: due > 0 ? C.bad : C.ok });

  // payment history (left)
  if (payments.length) {
    d.text('PAYMENTS RECEIVED', L, y + 14, { size: 8, bold: true, color: C.faint, spacing: 1 });
    let py = y + 32;
    for (const p of payments) {
      d.circle(L + 4, py - 3, 2.5, C.ok);
      d.text(`${date(p.created_at)} · ${p.method}`, L + 14, py, { size: 9, color: C.muted });
      d.text(money(p.amount), 300, py, { size: 9, bold: true, color: C.ink, align: 'right' });
      py += 16;
    }
  } else if (due > 0) {
    d.text('PAYMENTS RECEIVED', L, y + 14, { size: 8, bold: true, color: C.faint, spacing: 1 });
    d.text('No payment received yet', L, y + 32, { size: 9, color: C.muted });
  }
  // stamp
  if (due <= 0) {
    const sy = y + 26 + (payments.length ? payments.length * 16 + 20 : 0);
    if (sy + 40 < FOOTER_TOP) {
      d.round(L, sy, 150, 36, 8, null, C.ok, 2);
      d.text('PAID IN FULL', L + 75, sy + 23, { size: 13, bold: true, color: C.ok, align: 'center', spacing: 1.2 });
    }
  }

  // ---- footer (last page) ----
  const fy = H - 104;
  d.rect(L, fy, R - L, 1.2, C.saffron);
  d.text(shop.footer_note || 'Thanks For Shopping With Us', W / 2, fy + 34, { size: 18, bold: true, color: C.navy, align: 'center' });
  const fl = [shopName, contact].filter(Boolean).join('  ·  ');
  d.text(d.fit(fl, R - L, 8.5, false), W / 2, fy + 54, { size: 8.5, color: C.faint, align: 'center' });

  // page numbers
  const n = d.pages.length;
  d.pages.forEach((ops, i) => {
    d.ops = ops;
    d.text(`${sale.invoice_no}  ·  Page ${i + 1} of ${n}`, R, H - 22, { size: 7.5, color: C.faint, align: 'right' });
  });

  return d.bytes(`Invoice ${sale.invoice_no}`);
}
