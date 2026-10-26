/* =====================================================================
   AI Shop Assistant · language understanding engine (built-in)
   ---------------------------------------------------------------------
   Runs entirely in the browser — no data leaves the shop.
   Understands English, Roman Urdu/Hindi, Urdu script and Devanagari:
   every word is transliterated to a common Roman form and a "sound
   skeleton", so "charger", "چارجر" and "चार्जर" all match the same item.
   Item, brand and customer names are read live from the shop's data,
   so new stock and new customers are understood the moment they exist.
===================================================================== */

/* ---------------------------------------------------------------------
   Transliteration
--------------------------------------------------------------------- */
const UR = {
  'ا': 'a', 'آ': 'aa', 'أ': 'a', 'إ': 'i', 'ٱ': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ڈ': 'd', 'ذ': 'z', 'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ک': 'k', 'ك': 'k', 'گ': 'g',
  'ل': 'l', 'م': 'm', 'ن': 'n', 'ں': 'n', 'و': 'o', 'ہ': 'h', 'ه': 'h', 'ھ': 'h', 'ۂ': 'h', 'ۃ': 't', 'ة': 't', 'ء': '',
  'ی': 'i', 'ي': 'i', 'ى': 'i', 'ے': 'e', 'ۓ': 'e', 'ئ': 'i', 'ؤ': 'o',
  'َ': 'a', 'ِ': 'i', 'ُ': 'u', 'ّ': '', 'ْ': '', 'ٔ': '', 'ً': 'an', 'ٰ': 'a',
};
const DEV_C = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
};
const DEV_NUKTA = { 'k': 'q', 'kh': 'kh', 'g': 'gh', 'j': 'z', 'd': 'r', 'dh': 'rh', 'ph': 'f', 'y': 'y' };
const DEV_V = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ii', 'उ': 'u', 'ऊ': 'uu', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' };
const DEV_M = { 'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };
const DEV_X = { 'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': '', 'ॐ': 'om', '।': ' ', '॥': ' ' };

const isUrdu = (s) => /[؀-ۿ]/.test(s);
const isDev = (s) => /[ऀ-ॿ]/.test(s);

function urduToRoman(w) {
  let out = '';
  const ch = [...w];
  ch.forEach((c, i) => {
    if (i === 0 && c === 'و') { out += 'v'; return; }
    if (i === 0 && (c === 'ی' || c === 'ي')) { out += 'y'; return; }
    if ((c === 'ی' || c === 'ي') && i < ch.length - 1 && i > 0) { out += 'e'; return; }   // medial ی: کیس = kes (case), not kis
    if (c === 'ہ' && i === ch.length - 1 && i > 0) { out += 'a'; return; }   // final ہ is usually a vowel
    out += UR[c] ?? c;
  });
  return out;
}

function devToRoman(w) {
  let out = '';
  const ch = [...w];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (DEV_C[c] != null) {
      let r = DEV_C[c];
      let j = i + 1;
      if (ch[j] === '़') { r = DEV_NUKTA[r] ?? r; j++; }
      out += r;
      const n = ch[j];
      // inherent vowel unless a matra/virama follows, or at the end of the word
      if (n != null && DEV_M[n] == null && n !== '्' && (DEV_C[n] != null || DEV_X[n] != null || DEV_V[n] != null)) {
        if (!(n === 'ं' || n === 'ँ') || true) out += 'a';
      }
      i = j - 1;
    } else if (DEV_V[c] != null) out += DEV_V[c];
    else if (DEV_M[c] != null) out += DEV_M[c];
    else if (DEV_X[c] != null) out += DEV_X[c];
    else out += c;
  }
  return out;
}

const DIGITS = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '०': 0, '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9 };

/** Roman normalisation shared by typed text and transliterations. */
export function romNorm(s) {
  return s.toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/'s$/, '').replace(/'/g, '')
    .replace(/aa+/g, 'a').replace(/ii+|ee+/g, 'i').replace(/uu+|oo+/g, 'u')
    .replace(/[^a-z0-9.]/g, '');
}

export function toRoman(word) {
  if (isUrdu(word)) return romNorm(urduToRoman(word));
  if (isDev(word)) return romNorm(devToRoman(word));
  return romNorm(word);
}

/** Sound skeleton: consonant classes only, so spelling and script stop mattering. */
export function skel(r) {
  let s = String(r).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(s)) return s;
  s = s.replace(/chh|ch/g, 'C').replace(/sh/g, 'S').replace(/ph/g, 'f').replace(/kh/g, 'k').replace(/gh/g, 'g')
    .replace(/bh/g, 'b').replace(/dh/g, 'd').replace(/th/g, 't').replace(/jh/g, 'j').replace(/rh/g, 'r').replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/g(?=[eiy])/g, 'j')
    .replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 'j').replace(/w/g, 'v')
    .replace(/(?!^)y/g, '').replace(/h/g, '').replace(/[aeiou]/g, '')
    .replace(/C/g, 'c').replace(/S/g, 's')
    .replace(/(.)\1+/g, '$1');
  return s;
}

export function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/* ---------------------------------------------------------------------
   Tokenising
--------------------------------------------------------------------- */
const mkTok = (raw) => {
  const r = toRoman(raw);
  const t = { raw, r, k: skel(r), num: /^\d+(\.\d+)?$/.test(r) ? Number(r) : null, native: isUrdu(raw) || isDev(raw) };
  // Urdu writes v/w and o/u with the same letter (و): keep the "v" reading too, so روی = Ravi, پاور = power
  if (isUrdu(raw) && /و/.test(raw.slice(1))) {
    const v = romNorm(urduToRoman(raw[0]) + urduToRoman(raw.slice(1)).replace(/o/g, 'v'));
    const v2 = romNorm([...raw].map((c, i) => (i > 0 && c === 'و' ? 'v' : i === 0 && c === 'و' ? 'v' : (c === 'ہ' && i === raw.length - 1 && i > 0) ? 'a' : (UR[c] ?? c))).join(''));
    t.alts = [...new Set([v, v2])].filter((x) => x && x !== r).map((x) => ({ r: x, k: skel(x) }));
  }
  return t;
};
const SYM = new Set(['slash', 'ordsuffix']);

export function tokenize(text) {
  let s = String(text || '').normalize('NFC').replace(/[’`´]/g, "'");
  s = s.replace(/[۰-۹٠-٩०-९]/g, (d) => DIGITS[d]);
  s = s.replace(/\b(that|it|what|there|he|she|who|here|where|how)'s\b/gi, '$1 is').replace(/\blet's\b/gi, 'let us')
    .replace(/\b(\w+)n't\b/gi, (m, w) => (w.toLowerCase() === 'won' ? 'will not' : w.toLowerCase() === 'can' ? 'can not' : `${w} not`))
    .replace(/\b(\w+)'re\b/gi, '$1 are').replace(/\b(\w+)'ll\b/gi, '$1 will').replace(/\bi'm\b/gi, 'i am').replace(/\b(\w+)'ve\b/gi, '$1 have').replace(/\b(\w+)'d\b/gi, '$1 would');
  s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d{3})(?!\d)/g, '$1$2');   // 1,250 -> 1250
  s = s.replace(/[£$€₹]\s*(\d)/g, ' £ $1').replace(/\b(rs|pkr|inr|gbp)\.?\s*(\d)/gi, ' £ $2');
  s = s.replace(/(\d)\s*(?:\/-|-\/)/g, '$1');
  s = s.replace(/\b(c1)\s*[-–]?\s*(\d{3,6})\b/gi, ' invno$2 ');
  s = s.replace(/(\d)(st|nd|rd|th)\b/gi, '$1 ordsuffix');
  s = s.replace(/(\d+)\s*[.:]\s*(\d{1,2})\s*(am|pm)/gi, '$1 $3');
  s = s.replace(/(\d)[/](\d)/g, '$1 slash $2');
  s = s.replace(/[،؟۔?!,;:"“”()[\]{}|]+/g, ' , ').replace(/(^|\s)[.]+|[.]+(\s|$)/g, ' , ').replace(/[-–—]+/g, ' ');
  s = s.replace(/(\d)([a-z؀-ۿऀ-ॿ])/gi, '$1 $2').replace(/([a-z])(\d)/gi, (m, a, d, off, str) => {
    // keep model codes like a15 / s23 together, split "x2"
    return m;
  });
  const parts = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (p === ',') { out.push({ raw: ',', r: ',', k: ',', num: null, sep: true }); continue; }
    if (p === '£') { out.push({ raw: '£', r: 'currency', k: 'currency', num: null, cur: true }); continue; }
    if (/^invno\d+$/i.test(p)) { const n = Number(p.slice(5)); out.push({ raw: p, r: 'invno', k: 'invno', num: n, inv: n }); continue; }
    const t = mkTok(p);
    if (SYM.has(t.r)) t.sym = true;
    out.push(t);
  }
  return out;
}

/* ---------------------------------------------------------------------
   Vocabulary (one concept = many ways of saying it)
--------------------------------------------------------------------- */
const V = {
  SALES: ['sales', 'sale', 'sold', 'sell', 'selling', 'takings', 'taking', 'revenue', 'income', 'earned', 'earnings', 'earning', 'turnover', 'collection', 'business', 'made', 'make', 'bikri', 'bikti', 'bika', 'biki', 'bike', 'becha', 'bechi', 'beche', 'farokht', 'farukht', 'kamai', 'kamaya', 'kamaai', 'amdani', 'aamdan', 'galla', 'sail', 'sel', 'سیل', 'سیلز', 'فروخت', 'بکری', 'بکا', 'بکی', 'بکے', 'بیچا', 'بیچی', 'بیچے', 'کمائی', 'کمایا', 'آمدنی', 'بکری', 'बिक्री', 'बिकी', 'बिका', 'बिके', 'बेचा', 'बेची', 'बेचे', 'सेल', 'कमाई', 'कमाया', 'आमदनी'],
  HOWMUCH: ['how', 'kitna', 'kitni', 'kitne', 'kitany', 'kitny', 'کتنا', 'کتنی', 'کتنے', 'कितना', 'कितनी', 'कितने', 'whats', 'what'],
  STOCK: ['stock', 'stocks', 'inventory', 'left', 'remaining', 'available', 'availability', 'units', 'pieces', 'piece', 'pcs', 'qty', 'quantity', 'maal', 'mal', 'bacha', 'bache', 'bachi', 'baqi', 'baki', 'pada', 'pade', 'pari', 'pare', 'سٹاک', 'اسٹاک', 'سٹوک', 'مال', 'بچا', 'بچے', 'بچی', 'باقی', 'پڑا', 'پڑے', 'स्टॉक', 'माल', 'बचा', 'बचे', 'बची', 'बाकी', 'बाक़ी', 'पड़ा', 'पड़े', 'उपलब्ध'],
  SHOP: ['shop', 'store', 'shelf', 'shelves', 'front', 'floor', 'dukan', 'dokan', 'dukaan', 'دکان', 'دوکان', 'شاپ', 'दुकान', 'शॉप'],
  WAREHOUSE: ['warehouse', 'warehous', 'wearhouse', 'godown', 'godam', 'gudam', 'stockroom', 'storeroom', 'storage', 'backroom', 'back', 'گودام', 'ویئرہاؤس', 'گوداموں', 'गोदाम', 'वेयरहाउस', 'वेयरहाउस'],
  LOW: ['low', 'short', 'reorder', 'restock', 'running', 'finishing', 'kam', 'thoda', 'thora', 'کم', 'तھوड़ा', 'कम'],
  OUTOF: ['out', 'finished', 'empty', 'none', 'khatam', 'khatm', 'ختم', 'खत्म', 'ख़त्म'],
  OWE: ['owe', 'owes', 'owed', 'owing', 'debt', 'debts', 'debtor', 'debtors', 'credit', 'balance', 'balances', 'due', 'dues', 'outstanding', 'unpaid', 'pending', 'arrears', 'udhar', 'udhaar', 'udhari', 'baqaya', 'bakaya', 'qarz', 'karz', 'qarza', 'karza', 'lena', 'lene', 'ادھار', 'بقایا', 'قرض', 'قرضہ', 'واجب', 'بیلنس', 'लेना', 'उधार', 'बकाया', 'क़र्ज़', 'कर्ज', 'कर्ज़', 'बैलेंस'],
  MOST: ['most', 'highest', 'biggest', 'largest', 'maximum', 'max', 'top', 'zyada', 'ziada', 'jyada', 'zada', 'ziyada', 'زیادہ', 'ज़्यादा', 'ज्यादा', 'सबसे'],
  LONGEST: ['longest', 'oldest', 'earliest', 'long', 'longer', 'purana', 'purani', 'purane', 'arsa', 'arse', 'der', 'پرانا', 'پرانی', 'پرانے', 'عرصہ', 'عرصے', 'دیر', 'पुराना', 'पुरानी', 'पुराने', 'अरसा', 'देर'],
  WHO: ['who', 'whom', 'whose', 'which', 'customer', 'customers', 'kaun', 'kon', 'kis', 'kisne', 'کون', 'کس', 'کسی', 'कौन', 'किस'],
  PAY: ['paid', 'pay', 'pays', 'paying', 'payment', 'payments', 'received', 'receive', 'gave', 'given', 'deposit', 'deposited', 'settle', 'settled', 'cleared', 'collected', 'jama', 'diya', 'diye', 'di', 'de', 'adaigi', 'ada', 'raqam', 'rakam', 'paise', 'paisa', 'adayegi', 'ادائیگی', 'ادا', 'دیا', 'دیے', 'دیئے', 'دی', 'جمع', 'رقم', 'پیسے', 'भुगतान', 'अदा', 'दिया', 'दिए', 'दिये', 'दी', 'जमा', 'रकम', 'पैसे'],
  INVOICE: ['invoice', 'invoices', 'bill', 'bills', 'receipt', 'receipts', 'order', 'orders', 'purchase', 'purchases', 'bought', 'buy', 'buys', 'purchased', 'khareeda', 'kharida', 'kharidi', 'khareedi', 'kharide', 'bil', 'raseed', 'rasid', 'بل', 'رسید', 'انوائس', 'خریدا', 'خریدی', 'خریدے', 'آرڈر', 'बिल', 'रसीद', 'इनवॉइस', 'खरीदा', 'खरीदी', 'खरीदे', 'ख़रीदा', 'ऑर्डर'],
  ITEMS: ['items', 'products', 'things', 'stuff', 'list', 'read', 'repeat', 'cheezen', 'cheezein', 'chizen', 'saman', 'samaan', 'چیزیں', 'چیز', 'سامان', 'آئٹم', 'آئٹمز', 'चीज़ें', 'चीजें', 'सामान', 'आइटम'],
  SUMMARY: ['summary', 'summarise', 'summarize', 'overview', 'brief', 'briefing', 'recap', 'rundown', 'update', 'situation', 'status', 'khulasa', 'jaiza', 'hisab', 'hisaab', 'halat', 'haal', 'خلاصہ', 'جائزہ', 'حساب', 'حال', 'سمری', 'सारांश', 'खुलासा', 'हिसाब', 'जायज़ा', 'हाल', 'समरी'],
  REPORT: ['report', 'reports', 'pdf', 'statement', 'riport', 'رپورٹ', 'ریپورٹ', 'रिपोर्ट'],
  GENERATE: ['generate', 'create', 'make', 'download', 'print', 'produce', 'prepare', 'export', 'banao', 'bana', 'banado', 'nikalo', 'بناؤ', 'بنا', 'بنادو', 'ڈاؤنلوڈ', 'بनाओ', 'बनाओ', 'बना', 'डाउनलोड'],
  START: ['start', 'begin', 'new', 'open', 'launch', 'ring', 'shuru', 'shoro', 'kholo', 'khol', 'nayi', 'nai', 'naya', 'شروع', 'کھولو', 'کھول', 'نئی', 'نیا', 'शुरू', 'खोलो', 'खोल', 'नई', 'नया'],
  COUNTER: ['counter', 'till', 'pos', 'register', 'checkout', 'cart', 'sheet', 'basket', 'کاؤنٹر', 'काउंटर'],
  ADD: ['add', 'put', 'plus', 'include', 'append', 'insert', 'enter', 'dalo', 'daalo', 'daal', 'dal', 'jodo', 'jod', 'shamil', 'likho', 'ڈالو', 'ڈال', 'جوڑو', 'شامل', 'لکھو', 'डालो', 'डाल', 'जोड़ो', 'जोड़', 'शामिल', 'लिखो'],
  REMOVE: ['remove', 'delete', 'drop', 'minus', 'take', 'nikalo', 'nikal', 'hatao', 'hata', 'hatado', 'نکالو', 'نکال', 'ہٹاؤ', 'ہٹا', 'ہٹادو', 'निकालो', 'निकाल', 'हटाओ', 'हटा', 'हटादो'],
  PRICE: ['price', 'prices', 'cost', 'costs', 'rate', 'each', 'per', 'apiece', 'daam', 'dam', 'qeemat', 'qimat', 'keemat', 'kimat', 'bhao', 'bhav', 'wala', 'wali', 'vala', 'قیمت', 'دام', 'ریٹ', 'والا', 'والی', 'कीमत', 'क़ीमत', 'दाम', 'रेट', 'वाला', 'वाली'],
  DONE: ['done', 'finish', 'finished', 'complete', 'completed', 'checkout', 'submit', 'bas', 'mukammal', 'khatam', 'بس', 'مکمل', 'बस', 'पूरा', 'हो'],
  TOTAL: ['total', 'sum', 'altogether', 'overall', 'kul', 'totl', 'ٹوٹل', 'کُل', 'टोटल', 'कुल'],
  STOCKIN: ['received', 'receive', 'delivery', 'delivered', 'arrived', 'arrive', 'came', 'got', 'restocked', 'restock', 'bought', 'aya', 'aaya', 'aye', 'aaye', 'ai', 'aai', 'mangwaya', 'آیا', 'آئے', 'آئی', 'منگوایا', 'आया', 'आए', 'आये', 'आई', 'मंगवाया'],
  STOCKOUT: ['damaged', 'damage', 'broken', 'broke', 'expired', 'lost', 'stolen', 'faulty', 'defective', 'returned', 'writeoff', 'toot', 'tuta', 'tute', 'tuti', 'kharab', 'zaya', 'ٹوٹا', 'ٹوٹے', 'ٹوٹی', 'خراب', 'ضائع', 'टूटा', 'टूटे', 'टूटी', 'खराब', 'ख़राब'],
  MOVE: ['move', 'moved', 'transfer', 'transferred', 'shift', 'shifted', 'bring', 'brought', 'send', 'sent', 'carry', 'lao', 'le', 'bhejo', 'bhej', 'muntaqil', 'منتقل', 'لاؤ', 'لے', 'بھیجو', 'بھیج', 'شفٹ', 'भेजो', 'भेज', 'लाओ', 'ले', 'शिफ्ट'],
  SETTO: ['set', 'change', 'update', 'correct', 'correction', 'should', 'actually', 'exactly', 'make'],
  YES: ['yes', 'yeah', 'yea', 'yep', 'yup', 'ya', 'sure', 'ok', 'okay', 'okey', 'correct', 'right', 'confirm', 'confirmed', 'proceed', 'absolutely', 'definitely', 'ahead', 'do it', 'haan', 'han', 'ha', 'ji', 'jee', 'theek', 'thik', 'tik', 'sahi', 'bilkul', 'hanji', 'kardo', 'karo', 'ہاں', 'ہا', 'جی', 'ٹھیک', 'صحیح', 'بالکل', 'کرو', 'کردو', 'हाँ', 'हां', 'हा', 'जी', 'ठीक', 'सही', 'बिल्कुल', 'बिलकुल', 'करो', 'करदो'],
  NO: ['no', 'nope', 'nah', 'not', 'dont', 'cancel', 'stop', 'wrong', 'never', 'nahi', 'nahin', 'nai', 'nahee', 'mat', 'ruko', 'galat', 'ghalat', 'chhodo', 'chodo', 'نہیں', 'مت', 'غلط', 'رکو', 'چھوڑو', 'नहीं', 'नही', 'मत', 'गलत', 'ग़लत', 'रुको', 'छोड़ो'],
  HELP: ['help', 'commands', 'options', 'capabilities', 'features', 'madad', 'مدد', 'मदद'],
  GREET: ['hi', 'hello', 'hey', 'hiya', 'morning', 'afternoon', 'evening', 'salam', 'salaam', 'assalam', 'assalamualaikum', 'aoa', 'namaste', 'namaskar', 'adab', 'سلام', 'السلام', 'اسلام', 'آداب', 'नमस्ते', 'नमस्कार', 'हेलो', 'ہیلو'],
  THANKS: ['thanks', 'thank', 'cheers', 'ta', 'shukriya', 'shukria', 'meherbani', 'dhanyavad', 'dhanyawad', 'jazakallah', 'شکریہ', 'مہربانی', 'जزاک', 'धन्यवाद', 'शुक्रिया', 'मेहरबानी'],
  BYE: ['bye', 'goodbye', 'later', 'goodnight', 'khudahafiz', 'hafiz', 'alvida', 'خدا', 'حافظ', 'اللہ', 'अलविदा', 'हाफ़िज़', 'हाफिज'],
  MUTE: ['mute', 'quiet', 'silence', 'silent', 'shush', 'shh', 'chup', 'khamosh', 'خاموش', 'چپ', 'चुप', 'ख़ामोश', 'खामोश'],
  UNMUTE: ['unmute', 'speak', 'talk', 'voice', 'sound', 'loud', 'bolo', 'bol', 'awaz', 'aawaz', 'بولو', 'بول', 'آواز', 'बोलो', 'बोल', 'आवाज़', 'आवाज'],
  REPEAT: ['repeat', 'again', 'pardon', 'dobara', 'phir', 'دوبارہ', 'پھر', 'दोबारा', 'फिर'],
  SHOW: ['show', 'open', 'go', 'take', 'navigate', 'display', 'see', 'view', 'dikhao', 'dikha', 'dekho', 'kholo', 'chalo', 'دکھاؤ', 'دکھا', 'دیکھو', 'کھولو', 'چلو', 'दिखाओ', 'दिखा', 'देखो', 'खोलो', 'चलो'],
  DASHBOARD: ['dashboard', 'home', 'main', 'overview', 'ڈیش', 'ڈیشبورڈ', 'डैशबोर्ड'],
  TRACKER: ['tracker', 'calendar', 'graph', 'chart', 'ٹریکر', 'ٹریکر', 'ट्रैकर'],
  BEST: ['best', 'popular', 'top', 'fastest', 'bestseller', 'bestselling', 'behtareen', 'بہترین', 'सबसे', 'बेहतरीन'],
  VALUE: ['value', 'worth', 'valuation', 'qeemat', 'مالیت', 'मूल्य'],
  CASH: ['cash', 'naqad', 'naqd', 'nakad', 'nakd', 'notes', 'نقد', 'کیش', 'नकद', 'नक़द', 'कैश'],
  CARD: ['card', 'debit', 'visa', 'mastercard', 'contactless', 'tap', 'کارڈ', 'कार्ड'],
  BANK: ['bank', 'transfer', 'online', 'jazzcash', 'easypaisa', 'banktransfer', 'bacs', 'upi', 'بینک', 'ٹرانسفر', 'آن', 'बैंक', 'ट्रांसफर', 'ऑनलाइन'],
  PRIVATE: ['private', 'walkin', 'walk', 'anonymous', 'unknown', 'guest', 'nobody', 'aam', 'پرائیویٹ', 'عام', 'प्राइवेट', 'आम'],
  FULL: ['full', 'fully', 'whole', 'everything', 'entire', 'all', 'poora', 'pura', 'puri', 'poori', 'sara', 'saara', 'sari', 'mukammal', 'poore', 'pure', 'sare', 'saare', 'پورا', 'پوری', 'پورے', 'سارا', 'ساری', 'سارے', 'مکمل', 'पूरा', 'पूरी', 'पूरे', 'सारा', 'सारी', 'सारे'],
  NOTHING: ['nothing', 'zero', 'nil', 'none', 'credit', 'udhar', 'udhaar', 'kuch', 'ادھار', 'کچھ', 'उधार', 'कुछ'],
  LAST: ['last', 'latest', 'recent', 'previous', 'newest', 'akhri', 'aakhri', 'pichla', 'pichli', 'pichle', 'آخری', 'پچھلا', 'پچھلی', 'پچھلے', 'आखिरी', 'आख़िरी', 'पिछला', 'पिछली', 'पिछले'],
  UNDO: ['undo', 'oops', 'mistake', 'galti', 'غلطی', 'गलती'],
  CLEAR: ['clear', 'empty', 'reset', 'wipe', 'saaf', 'saf', 'صاف', 'साफ', 'साफ़'],
  FLAG: ['flag', 'mark', 'nishan', 'نشان', 'निशान'],
  WHEN: ['when', 'kab', 'کب', 'कब'],
  CANCEL: ['cancel', 'abort', 'forget', 'discard', 'nevermind', 'chhodo', 'chodo', 'chhoro', 'choro', 'رہنے', 'چھوڑو', 'चھोड़ो', 'रहने'],
  CUSTOMER: ['customer', 'client', 'buyer', 'name', 'gahak', 'grahak', 'گاہک', 'کسٹمر', 'नाम', 'ग्राहक', 'कस्टमर', 'نام'],
  CURRENCY: ['pound', 'pounds', 'quid', 'gbp', 'rupee', 'rupees', 'rupay', 'rupaye', 'rupey', 'rupiya', 'rupiye', 'rs', 'pkr', 'inr', 'pence', 'paise', 'روپے', 'روپیہ', 'روپیے', 'پاؤنڈ', 'پاونڈ', 'रुपये', 'रुपए', 'रुपया', 'रूपए', 'पाउंड', 'currency'],
  CONJ: ['and', 'plus', 'also', 'then', 'aur', 'or', 'phir', 'n', '&', 'اور', 'پھر', 'और', 'फिर', 'साथ'],
  LANGUAGE: ['language', 'zaban', 'zuban', 'bhasha', 'زبان', 'भाषा'],
  EN: ['english', 'angrezi', 'angrezee', 'انگریزی', 'अंग्रेज़ी', 'अंग्रेजी', 'इंग्लिश'],
  URDU: ['urdu', 'اردو', 'उर्दू'],
  HINDI: ['hindi', 'ہندی', 'हिंदी', 'हिन्दी'],
};

const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'in', 'at', 'to', 'is', 'are', 'am', 'was', 'were', 'be', 'my', 'me', 'i', 'we', 'our', 'us', 'you', 'your', 'do', 'does', 'did', 'have', 'has', 'had', 'what', 'whats', 'how', 'many', 'much', 'there', 'please', 'can', 'could', 'would', 'will', 'tell', 'and', 'or', 'it', 'its', 'this', 'that', 'these', 'those', 'on', 'with', 'by', 'from', 'about', 'any', 'some', 'just', 'now', 'right', 'okay', 'ok', 'so', 'then', 'also', 'currently', 'still', 'got', 'left', 'let', 'lets', 'know', 'give', 'check', 'find', 'look', 'up', 'one', 'ones',
  'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'men', 'mai', 'hai', 'hain', 'kaisa', 'kaisi', 'kaise', 'raha', 'rahi', 'rahe', 'din', 'hua', 'hui', 'hue', 'gaya', 'gayi', 'gaye', 'sab', 'jo', 'jab', 'tab', 'itna', 'itni', 'itne', 'bas', 'yahan', 'wahan', 'koi', 'kuch', 'kis', 'kisi', 'bhai', 'yaar', 'acha', 'achha', 'he', 'hy', 'ha', 'tha', 'thi', 'the', 'kya', 'kia', 'ye', 'yeh', 'wo', 'woh', 'vo', 'aur', 'or', 'bhi', 'to', 'tu', 'tum', 'aap', 'ap', 'mera', 'meri', 'mere', 'humara', 'hamara', 'hum', 'ham', 'batao', 'bataen', 'bataiye', 'bata', 'bataye', 'zara', 'jara', 'abhi', 'par', 'pe', 'wala', 'wali', 'wale', 'kar', 'karo', 'kardo', 'do', 'dena', 'den', 'dein',
  'کا', 'کی', 'کے', 'کو', 'سے', 'میں', 'ہے', 'ہیں', 'تھا', 'تھی', 'کیا', 'یہ', 'وہ', 'اور', 'بھی', 'تو', 'آپ', 'میرا', 'میری', 'میرے', 'ہمارا', 'ہم', 'بتاؤ', 'بتائیں', 'بتا', 'ذرا', 'ابھی', 'پر', 'پہ', 'والا', 'والی', 'والے', 'کر', 'دو', 'دیں',
  'का', 'की', 'के', 'को', 'से', 'में', 'है', 'हैं', 'था', 'थी', 'क्या', 'यह', 'ये', 'वह', 'वो', 'और', 'भी', 'तो', 'आप', 'मेरा', 'मेरी', 'मेरे', 'हमारा', 'हम', 'बताओ', 'बताएं', 'बताइए', 'बता', 'ज़रा', 'जरा', 'अभी', 'पर', 'पे', 'वाले', 'कर', 'दो', 'दें'].map(toRoman));

// precompute normalised vocab
const VN = {};
const CONCEPT_WORDS_INIT = [];
for (const [k, list] of Object.entries(V)) {
  const seen = new Map();
  for (const w of list) { const r = toRoman(w); if (!r) continue; const nat = isUrdu(w) || isDev(w); if (!seen.has(r) || nat) seen.set(r, { r, k: skel(r), native: nat || seen.get(r)?.native }); }
  VN[k] = [...seen.values()];
}
for (const k of Object.keys(VN)) if (!['STOCK', 'ITEMS'].includes(k)) VN[k].forEach((e) => CONCEPT_WORDS_INIT.push(e.r));

/** does token match a vocabulary entry */
function vocabHit(t, e) {
  if (!t.r || t.sep || t.cur || t.sym || t.inv) return false;
  if (t.r === e.r) return true;
  if (e.r.length >= 6 && t.r.length >= 6 && lev(t.r, e.r) <= 1) return true;
  if (e.k.length >= 3 && t.k === e.k && Math.abs(t.r.length - e.r.length) <= 2) {
    // sound-alike matching is for other scripts and loose Roman Urdu spelling, not English look-alikes (last/lost/list)
    if ((t.native || e.native) && t.r[0] === e.r[0] && (e.k.length >= 4 || lev(t.r, e.r) <= 2)) return true;
    if (t.r.length >= 5 && e.r.length >= 5 && t.r[0] === e.r[0] && lev(t.r, e.r) <= 2) return true;
  }
  if (e.r.length >= 4 && (t.r === e.r + 's' || t.r === e.r + 'es' || t.r === e.r + 'ing' || t.r === e.r + 'ed' || t.r === e.r + 'd')) return true;
  return false;
}
const CONCEPT_WORDS = new Set(CONCEPT_WORDS_INIT);
export const isConceptWord = (r) => CONCEPT_WORDS.has(r);
export function hasConcept(tokens, name, from = 0, to = tokens.length) {
  const list = VN[name];
  for (let i = from; i < to; i++) for (const e of list) if (vocabHit(tokens[i], e)) return i;
  return -1;
}
export function explainHits(tokens) {
  const o = [];
  for (const name of Object.keys(VN)) tokens.forEach((t) => { const e = VN[name].find((x) => vocabHit(t, x)); if (e) o.push(`${name}:${t.r}~${e.r}`); });
  return o;
}
export function conceptsIn(tokens) {
  const hits = {};
  for (const name of Object.keys(VN)) {
    const at = [];
    tokens.forEach((t, i) => { if (VN[name].some((e) => vocabHit(t, e))) at.push(i); });
    if (at.length) hits[name] = at;
  }
  return hits;
}

/* ---------------------------------------------------------------------
   Numbers (English, Roman Urdu/Hindi, Urdu, Hindi)
--------------------------------------------------------------------- */
const NUMW = {};
const addNum = (n, words) => words.forEach((w) => { NUMW[toRoman(w)] = n; });
addNum(0, ['zero', 'nil', 'sifar', 'صفر', 'शून्य']);
addNum(1, ['one', 'ek', 'aik', 'ایک', 'एक']);
addNum(2, ['two', 'do', 'دو', 'दो', 'couple', 'pair']);
addNum(3, ['three', 'teen', 'tin', 'تین', 'तीन']);
addNum(4, ['four', 'char', 'chaar', 'چار', 'चार']);
addNum(5, ['five', 'panch', 'paanch', 'pansh', 'پانچ', 'पांच', 'पाँच']);
addNum(6, ['six', 'chhe', 'che', 'chay', 'chhah', 'چھ', 'छह', 'छः', 'छे']);
addNum(7, ['seven', 'saat', 'sat', 'سات', 'सात']);
addNum(8, ['eight', 'aath', 'ath', 'آٹھ', 'आठ']);
addNum(9, ['nine', 'nau', 'नौ']);
addNum(10, ['ten', 'das', 'dus', 'دس', 'दस']);
addNum(11, ['eleven', 'gyarah', 'gyara', 'giyara', 'گیارہ', 'ग्यारह']);
addNum(12, ['twelve', 'barah', 'bara', 'dozen', 'درجن', 'darjan', 'بارہ', 'बारह', 'दर्जन']);
addNum(13, ['thirteen', 'terah', 'tera', 'تیرہ', 'तेरह']);
addNum(14, ['fourteen', 'chaudah', 'chauda', 'chodah', 'چودہ', 'चौदह']);
addNum(15, ['fifteen', 'pandrah', 'pandra', 'پندرہ', 'पंद्रह']);
addNum(16, ['sixteen', 'solah', 'sola', 'سولہ', 'सोलह']);
addNum(17, ['seventeen', 'satrah', 'satra', 'سترہ', 'सत्रह']);
addNum(18, ['eighteen', 'atharah', 'athara', 'اٹھارہ', 'अठारह']);
addNum(19, ['nineteen', 'unnis', 'unees', 'انیس', 'उन्नीस']);
addNum(20, ['twenty', 'bees', 'bis', 'بیس', 'बीस']);
addNum(25, ['pachees', 'pachis', 'پچیس', 'पच्चीस']);
addNum(30, ['thirty', 'tees', 'tis', 'تیس', 'तीस']);
addNum(35, ['paintees', 'paintis', 'پینتیس', 'पैंतीस']);
addNum(40, ['forty', 'fourty', 'chalees', 'chalis', 'چالیس', 'चालीस']);
addNum(45, ['paintalees', 'paintalis', 'پینتالیس', 'पैंतालीस']);
addNum(50, ['fifty', 'pachas', 'pachaas', 'پچاس', 'पचास']);
addNum(60, ['sixty', 'साठ']);
addNum(70, ['seventy', 'sattar', 'ستر', 'सत्तर']);
addNum(75, ['pachattar', 'pichattar', 'پچھتر', 'पचहत्तर']);
addNum(80, ['eighty', 'assi', 'assee', 'اسی', 'अस्सी']);
addNum(90, ['ninety', 'nabbe', 'nabbay', 'نوے', 'नब्बे']);
const MULW = {};
const addMul = (n, words) => words.forEach((w) => { MULW[toRoman(w)] = n; });
addMul(100, ['hundred', 'sau', 'سو', 'सौ']);
addMul(1000, ['thousand', 'k', 'hazar', 'hazaar', 'hajar', 'ہزار', 'हज़ार', 'हजार']);
addMul(100000, ['lakh', 'lac', 'lakh', 'لاکھ', 'लाख']);
addMul(1000000, ['million', 'mn']);
const FRACW = {};
[['half', 0.5], ['adha', 0.5], ['aadha', 0.5], ['آدھا', 0.5], ['आधा', 0.5]].forEach(([w, v]) => { FRACW[toRoman(w)] = { abs: v }; });
[['derh', 1.5], ['dedh', 1.5], ['ڈیڑھ', 1.5], ['डेढ़', 1.5], ['dhai', 2.5], ['dhaai', 2.5], ['اڑھائی', 2.5], ['ڈھائی', 2.5], ['ढाई', 2.5]].forEach(([w, v]) => { FRACW[toRoman(w)] = { abs: v }; });
[['sade', 0.5], ['saade', 0.5], ['sarhe', 0.5], ['ساڑھے', 0.5], ['साढ़े', 0.5], ['sawa', 0.25], ['سوا', 0.25], ['सवा', 0.25], ['paune', -0.25], ['پونے', -0.25], ['पौने', -0.25]].forEach(([w, v]) => { FRACW[toRoman(w)] = { add: v }; });
const ORD = {};
[[1, ['first', '1st', 'pehla', 'pehli', 'pehle', 'pahla', 'pahli', 'پہلا', 'پہلی', 'پہلے', 'पहला', 'पहली', 'पहले']],
  [2, ['second', '2nd', 'dusra', 'doosra', 'dusri', 'doosri', 'دوسرا', 'دوسری', 'दूसरा', 'दूसरी']],
  [3, ['third', '3rd', 'teesra', 'tisra', 'teesri', 'tisri', 'تیسرا', 'تیسری', 'तीसरा', 'तीसरी']],
  [4, ['fourth', '4th', 'chautha', 'chotha', 'chauthi', 'چوتھا', 'چوتھی', 'चौथा', 'चौथी']],
  [5, ['fifth', '5th', 'panchwa', 'panchvan', 'پانچواں', 'पांचवा', 'पाँचवाँ']]].forEach(([n, ws]) => ws.forEach((w) => { ORD[toRoman(w)] = n; }));

const HINDUSTANI_CUES = new Set(['hai', 'hain', 'kitne', 'kitna', 'kitni', 'ka', 'ki', 'ke', 'ko', 'mein', 'dalo', 'daalo', 'karo', 'kardo', 'aur', 'wala', 'wali', 'bacha', 'bache', 'kya', 'kal', 'aaj', 'aj', 'diya', 'diye', 'liye', 'se', 'tak', 'abhi', 'nahi', 'haan', 'bhai', 'jee', 'ji', 'sau', 'hazar', 'hazaar', 'rupay', 'rupaye', 'rupees', 'paise', 'batao', 'dikhao'].map(toRoman));
const EN_ONLY = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fourty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'zero', 'nil', 'dozen', 'couple', 'pair', 'hundred', 'thousand', 'million', 'half', 'k', 'mn']);
const NOT_NUM_BEFORE = new Set(['i', 'you', 'we', 'they', 'it', 'the', 'not', 'he', 'she', 'u', 'ya', 'any', 'this', 'that', 'my', 'our', 'your'].map(toRoman));
const NOT_NUM_AFTER = new Set(['kar', 'de', 'bata', 'likh', 'dikha', 'how', 'many', 'much', 'what', 'why', 'where', 'did', 'i', 'we', 'you', 'they', 'kr', 'le', 'dal', 'daal', 'rakh', 'bhej', 'hata', 'nikal', 'which', 'that', 'this', 'the', 'other', 'first', 'second', 'third', 'last', 'next', 'every', 'no', 'each'].map(toRoman));
const TENS = new Set(['twenty', 'thirty', 'forty', 'fourty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']);

/** Is the sentence Roman Urdu/Hindi (or in Urdu/Hindi script)? Decides whether "do", "tin" are numbers. */
export function hindustani(tokens, raw = '') {
  if (isUrdu(raw) || isDev(raw)) return true;
  return tokens.some((t) => HINDUSTANI_CUES.has(t.r));
}

/**
 * Collapse number words into single numeric tokens.
 * "two hundred and fifty" -> 250, "do sau" -> 200, "saade teen" -> 3.5, "four point five" -> 4.5
 */
export function mergeNumbers(tokens, raw = '') {
  const hi = hindustani(tokens, raw);
  const numWord = (x, j) => {
    if (!x || x.sep || x.cur) return null;
    const v = NUMW[x.r];
    if (v == null) return null;
    if (!hi && !EN_ONLY.has(x.r)) return null;
    if (x.r === 'do' || x.r === 'one') {
      const prev = tokens[j - 1], next = tokens[j + 1];
      if (prev && NOT_NUM_AFTER.has(prev.r)) return null;
      if (next && NOT_NUM_BEFORE.has(next.r)) return null;
      if (x.r === 'do' && (!next || next.sep)) return null;
      if (x.r === 'one' && prev && ORD[prev.r] != null) return null;
    }
    return v;
  };
  const mulWord = (x) => {
    if (!x || MULW[x.r] == null) return null;
    if (!hi && !EN_ONLY.has(x.r)) return null;
    return MULW[x.r];
  };
  const isNumStart = (j) => {
    const x = tokens[j];
    if (!x || x.sep || x.cur) return false;
    if (x.num != null && !x.inv) return true;
    if (numWord(x, j) != null) return true;
    const f = FRACW[x.r];
    if (f && (hi || x.r === 'half')) {
      if (f.abs != null) return x.r !== 'half' || tokens[j + 1]?.r === 'a' && tokens[j + 2]?.r === 'dozen' || (tokens[j + 1] && (tokens[j + 1].num != null || mulWord(tokens[j + 1])));
      return isNumStart(j + 1);
    }
    if (x.r === 'a' && tokens[j + 1]?.r === 'dozen') return true;
    return false;
  };
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumStart(i)) { out.push(tokens[i]); i++; continue; }
    let total = 0, cur = 0, any = false, add = 0, last = null, maxMul = 1, dec = 0, j = i;
    while (j < tokens.length) {
      const x = tokens[j];
      if (x.sep || x.cur) break;
      const mv = mulWord(x);
      const nv = x.num != null && !x.inv ? x.num : numWord(x, j);
      if (nv != null && mv == null) {
        if (any && !['mul', 'tens', 'and'].includes(last)) break;
        if (last === 'tens' && nv >= 10) break;
        cur += nv; any = true;
        last = (TENS.has(x.r) || (x.num != null && nv >= 20 && nv < 100 && nv % 10 === 0 && x.num == null)) ? 'tens' : 'num';
        j++; continue;
      }
      if (mv != null) {
        if (!any || !['num', 'tens'].includes(last)) break;
        if ((x.r === 'k' || x.r === 'so') && tokens[j - 1]?.num == null && NUMW[tokens[j - 1]?.r] == null) break;
        if (mv >= 1000) { total += (cur || 1) * mv; cur = 0; } else cur = (cur || 1) * mv;
        maxMul = Math.max(maxMul, mv); last = 'mul'; j++; continue;
      }
      if ((x.r === 'and' || x.r === 'aur') && last === 'mul' && tokens[j + 1] && (tokens[j + 1].num != null || numWord(tokens[j + 1], j + 1) != null)) { last = 'and'; j++; continue; }
      if ((x.r === 'and') && any && tokens[j + 1]?.r === 'a' && tokens[j + 2]?.r === 'half') { cur += 0.5; j += 3; break; }
      if ((x.r === 'point' || x.r === 'dot' || x.r === 'ashariya' || x.r === 'ashariya') && any && tokens[j + 1] && (tokens[j + 1].num != null || numWord(tokens[j + 1], j + 1) != null)) {
        const nx = tokens[j + 1];
        dec = Number('0.' + (nx.num != null ? String(nx.r).replace(/\D/g, '') : String(numWord(nx, j + 1))));
        j += 2; break;
      }
      const f = FRACW[x.r];
      if (f && !any) {
        if (x.r === 'half' && tokens[j + 1]?.r === 'a' && tokens[j + 2]?.r === 'dozen') { cur = 6; any = true; j += 3; break; }
        if (f.abs != null) { cur = f.abs; any = true; last = 'num'; j++; continue; }
        add = f.add; last = 'frac'; j++; continue;
      }
      if (x.r === 'a' && tokens[j + 1]?.r === 'dozen' && !any) { cur = 12; any = true; j += 2; break; }
      break;
    }
    if (!any) { out.push(tokens[i]); i++; continue; }
    let val = total + cur + dec;
    if (add) val += add * maxMul;
    val = Math.round(val * 100) / 100;
    const span = tokens.slice(i, j);
    out.push({ raw: span.map((x) => x.raw).join(' '), r: String(val), k: String(val), num: val, word: span.some((x) => x.num == null), span: span.length });
    i = j;
  }
  return out;
}
export const ordinalOf = (t) => (t ? ORD[t.r] ?? null : null);

/* ---------------------------------------------------------------------
   Dates
--------------------------------------------------------------------- */
const MONTHS = [
  ['january', 'jan', 'janwari', 'janvari', 'جنوری', 'जनवरी'], ['february', 'feb', 'farwari', 'farvari', 'فروری', 'फ़रवरी', 'फरवरी'],
  ['march', 'mar', 'مارچ', 'मार्च'], ['april', 'apr', 'aprail', 'اپریل', 'अप्रैल'], ['may', 'mai', 'مئی', 'मई'],
  ['june', 'jun', 'joon', 'جون', 'जून'], ['july', 'jul', 'julai', 'جولائی', 'जुलाई'], ['august', 'aug', 'agast', 'اگست', 'अगस्त'],
  ['september', 'sep', 'sept', 'sitambar', 'ستمبر', 'सितंबर', 'सितम्बर'], ['october', 'oct', 'aktubar', 'oktubar', 'اکتوبر', 'अक्टूबर'],
  ['november', 'nov', 'navambar', 'nomber', 'نومبر', 'नवंबर', 'नवम्बर'], ['december', 'dec', 'disambar', 'دسمبر', 'दिसंबर', 'दिसम्बर'],
].map((l) => l.map(toRoman));
const MONTH_SK = MONTHS.map((l) => skel(l[0]));
function monthOf(t) {
  if (!t || !t.r) return -1;
  for (let m = 0; m < 12; m++) if (MONTHS[m].includes(t.r)) return m;
  for (let m = 0; m < 12; m++) if (MONTH_SK[m].length >= 3 && t.k === MONTH_SK[m] && t.r.length >= 4) return m;
  return -1;
}
const WEEKDAYS = [
  ['sunday', 'sun', 'itwar', 'itwaar', 'etwar', 'اتوار', 'रविवार', 'इतवार'], ['monday', 'mon', 'pir', 'peer', 'somwar', 'پیر', 'सोमवार'],
  ['tuesday', 'tue', 'tues', 'mangal', 'mangalwar', 'منگل', 'मंगलवार', 'मंगल'], ['wednesday', 'wed', 'budh', 'budhwar', 'بدھ', 'बुधवार'],
  ['thursday', 'thu', 'thur', 'thurs', 'jumerat', 'jumeraat', 'guruwar', 'جمعرات', 'गुरुवार', 'बृहस्पतिवार'], ['friday', 'fri', 'juma', 'jumma', 'shukrawar', 'جمعہ', 'शुक्रवार', 'जुम्मा'],
  ['saturday', 'shanivar', 'sanichar', 'शनिवार'],
].map((l) => l.map(toRoman));

const W = (list) => new Set(list.map(toRoman));
const D_TODAY = W(['today', 'todays', 'tonight', 'aaj', 'aj', 'آج', 'आज']);
const D_YEST = W(['yesterday', 'yesterdays', 'kal', 'کل', 'कल']);
const D_DBY = W(['parson', 'parsun', 'پرسوں', 'परसों']);
const D_THIS = W(['this', 'current', 'is', 'iss', 'اس', 'इस']);
const D_LAST = W(['last', 'previous', 'past', 'pichle', 'pichla', 'pichhle', 'gaye', 'guzre', 'پچھلے', 'پچھلا', 'گزشتہ', 'पिछले', 'पिछला', 'गत']);
const D_WEEK = W(['week', 'weeks', 'weekly', 'hafte', 'hafta', 'haftay', 'ہفتے', 'ہفتہ', 'हफ्ते', 'हफ़्ते', 'हफ्ता', 'सप्ताह']);
const D_MONTH = W(['month', 'months', 'monthly', 'mahine', 'mahina', 'maheene', 'مہینے', 'مہینہ', 'ماہ', 'महीने', 'महीना']);
const D_YEAR = W(['year', 'years', 'yearly', 'saal', 'sal', 'baras', 'سال', 'साल', 'वर्ष']);
const D_DAY = W(['day', 'days', 'din', 'dino', 'dinon', 'دن', 'دنوں', 'दिन', 'दिनों']);
const D_AGO = W(['ago', 'back', 'pehle', 'pahle', 'pehley', 'qabl', 'پہلے', 'پہلے', 'पहले']);
const D_ALL = W(['ever', 'alltime', 'shuru', 'start', 'beginning']);
const D_FROM = W(['from', 'between', 'since', 'se']);
const D_TO = W(['to', 'until', 'till', 'and', 'tak', 'تک', 'तक']);

const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * Find a date or date range in the tokens. Returns
 * { start: Date, end: Date (inclusive), kind, used: [token indexes] } or null.
 */
export function parseDate(tokens, now = new Date()) {
  const today = sod(now);
  const used = [];
  const r = (i) => tokens[i]?.r;
  const res = (start, end, kind, idx) => ({ start: sod(start), end: sod(end), kind, used: idx });
  const ranges = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t || t.sep) continue;
    // all time
    if ((r(i) === 'all' && (r(i + 1) === 'time' || r(i + 1) === 'alltime')) || r(i) === 'alltime') { ranges.push(res(new Date(2000, 0, 1), today, 'all', [i, i + 1])); continue; }
    if (D_TODAY.has(t.r)) { ranges.push(res(today, today, 'today', [i])); continue; }
    if (D_DBY.has(t.r) || (t.r === 'day' && r(i + 1) === 'before' && D_YEST.has(r(i + 2)))) { ranges.push(res(addD(today, -2), addD(today, -2), 'day', t.r === 'day' ? [i, i + 1, i + 2] : [i])); if (t.r === 'day') i += 2; continue; }
    if (D_YEST.has(t.r)) {
      // Urdu "کل" can mean "total" (kul): treat as yesterday only when it reads like a date
      if (t.raw === 'کل' && !['ki', 'ka', 'ke', 'کی', 'کا', 'کے'].map(toRoman).includes(r(i + 1)) && !D_TODAY.has(r(i - 1))) continue;
      ranges.push(res(addD(today, -1), addD(today, -1), 'yesterday', [i])); continue;
    }
    // this/last week|month|year
    const unitAt = (j) => (D_WEEK.has(r(j)) ? 'week' : D_MONTH.has(r(j)) ? 'month' : D_YEAR.has(r(j)) ? 'year' : null);
    if ((D_THIS.has(t.r) || D_LAST.has(t.r)) && (unitAt(i + 1) || (tokens[i + 1]?.num != null && (unitAt(i + 2) || D_DAY.has(r(i + 2)))))) {
      const last = D_LAST.has(t.r);
      if (tokens[i + 1]?.num != null) {
        const n = Math.max(1, Math.min(3650, Math.round(tokens[i + 1].num)));
        const u = D_DAY.has(r(i + 2)) ? 'day' : unitAt(i + 2);
        const days = u === 'day' ? n : u === 'week' ? n * 7 : u === 'month' ? n * 30 : n * 365;
        ranges.push(res(addD(today, -(days - 1)), today, 'lastn', [i, i + 1, i + 2])); i += 2; continue;
      }
      const u = unitAt(i + 1);
      if (u === 'week') {
        const dow = (today.getDay() + 6) % 7;   // Monday = 0
        const mon = addD(today, -dow);
        if (last) ranges.push(res(addD(mon, -7), addD(mon, -1), 'lastweek', [i, i + 1]));
        else ranges.push(res(mon, today, 'thisweek', [i, i + 1]));
      } else if (u === 'month') {
        const m0 = new Date(today.getFullYear(), today.getMonth(), 1);
        if (last) ranges.push(res(new Date(today.getFullYear(), today.getMonth() - 1, 1), addD(m0, -1), 'lastmonth', [i, i + 1]));
        else ranges.push(res(m0, today, 'thismonth', [i, i + 1]));
      } else {
        const y0 = new Date(today.getFullYear(), 0, 1);
        if (last) ranges.push(res(new Date(today.getFullYear() - 1, 0, 1), addD(y0, -1), 'lastyear', [i, i + 1]));
        else ranges.push(res(y0, today, 'thisyear', [i, i + 1]));
      }
      i += 1; continue;
    }
    // "week so far" / "is hafte" handled above; bare "weekly"/"this week's"
    // N days ago / N din pehle
    if (t.num != null && D_DAY.has(r(i + 1)) && D_AGO.has(r(i + 2))) {
      const d = addD(today, -Math.round(t.num)); ranges.push(res(d, d, 'day', [i, i + 1, i + 2])); i += 2; continue;
    }
    // past N days without "last": "7 days", "30 din"
    if (t.num != null && D_DAY.has(r(i + 1)) && !D_AGO.has(r(i + 2)) && t.num <= 3650 && Number.isInteger(t.num)) {
      ranges.push(res(addD(today, -(t.num - 1)), today, 'lastn', [i, i + 1])); i += 1; continue;
    }
    // weekday names → the most recent such day (today if it matches)
    const wd = WEEKDAYS.findIndex((l) => l.includes(t.r));
    if (wd >= 0) {
      let back = (today.getDay() - wd + 7) % 7;
      if (D_LAST.has(r(i - 1)) && back === 0) back = 7;
      const d = addD(today, -back);
      ranges.push(res(d, d, 'day', D_LAST.has(r(i - 1)) ? [i - 1, i] : [i])); continue;
    }
    // explicit dates: 12 october, october 12, 12th of oct, 12/10(/2026), 2026-10-12
    if (t.num != null && r(i + 1) === 'slash' && tokens[i + 2]?.num != null) {
      const dd = t.num, mm = tokens[i + 2].num - 1;
      let yy = today.getFullYear(), k = 3;
      if (r(i + 3) === 'slash' && tokens[i + 4]?.num != null) { yy = tokens[i + 4].num; if (yy < 100) yy += 2000; k = 5; }
      const d = new Date(yy, mm, dd);
      if (d.getMonth() === mm && dd >= 1) {
        ranges.push(res(k === 3 && d > today ? new Date(yy - 1, mm, dd) : d, k === 3 && d > today ? new Date(yy - 1, mm, dd) : d, 'date', range(i, i + k)));
        i += k - 1; continue;
      }
    }
    const m = monthOf(t);
    if (m >= 0) {
      const short = MONTHS[m][0].length <= 4 || t.r.length <= 3;
      let day = null, idx = [i];
      const prevNum = (j) => (tokens[j]?.num != null && tokens[j].num >= 1 && tokens[j].num <= 31 && Number.isInteger(tokens[j].num) ? j : -1);
      let p = i - 1; if (r(p) === 'of') p--; if (r(p) === 'ordsuffix') p--;
      if (prevNum(p) >= 0) { day = tokens[p].num; idx.push(...range(p, i)); }
      else if (prevNum(i + 1) >= 0) { day = tokens[i + 1].num; idx.push(i + 1); if (r(i + 2) === 'ordsuffix') idx.push(i + 2); }
      let yy = null;
      const yi = idx.length ? Math.max(...idx) + 1 : i + 1;
      if (tokens[yi]?.num >= 2000 && tokens[yi]?.num <= 2100) { yy = tokens[yi].num; idx.push(yi); }
      if (day == null && short && !(D_THIS.has(r(i - 1)) || D_LAST.has(r(i - 1)) || D_FROM.has(r(i - 1)) || ['in', 'for', 'during'].includes(r(i - 1)))) continue;
      const y = yy ?? (new Date(today.getFullYear(), m, day || 1) > today ? today.getFullYear() - 1 : today.getFullYear());
      if (day) { const d = new Date(y, m, day); ranges.push(res(d, d, 'date', idx)); }
      else {
        const s = new Date(y, m, 1), e = new Date(y, m + 1, 0);
        ranges.push(res(s, e > today ? today : e, 'month', idx));
      }
      continue;
    }
    // "on the 12th" / "12 tareekh"
    if (t.num != null && Number.isInteger(t.num) && t.num >= 1 && t.num <= 31 && (r(i + 1) === 'ordsuffix' || ['tarikh', 'tareekh', 'tarik', 'تاریخ', 'तारीख'].map(toRoman).includes(r(i + 1)))) {
      let d = new Date(today.getFullYear(), today.getMonth(), t.num);
      if (d > today) d = new Date(today.getFullYear(), today.getMonth() - 1, t.num);
      ranges.push(res(d, d, 'date', [i, i + 1])); i += 1; continue;
    }
  }
  if (!ranges.length) return null;
  // "from X to Y" → join the first two
  if (ranges.length >= 2) {
    const a = ranges[0], b = ranges[1];
    const s = a.start < b.start ? a.start : b.start, e = a.end > b.end ? a.end : b.end;
    return { start: s, end: e > today ? today : e, kind: 'range', used: [...a.used, ...b.used] };
  }
  return ranges[0];
}
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);

/* ---------------------------------------------------------------------
   Entity matching (items, brands, customers)
--------------------------------------------------------------------- */
const NAME_STOP = new Set(['the', 'and', 'with', 'for', 'of', 'a', 'an', '&', '-', 'x']);
export function nameTokens(name) {
  const parts = String(name || '').toLowerCase().replace(/[()[\],/+_|]/g, ' ').replace(/[-–]/g, ' ').split(/\s+/).filter(Boolean);
  const toks = [];
  for (const p of parts) {
    const r = toRoman(p);
    if (!r || NAME_STOP.has(r)) continue;
    toks.push({ r, k: skel(r), num: /^\d+$/.test(r) ? Number(r) : null });
    // "20w" -> also "20"; "a15" stays a15
    const m = r.match(/^(\d+)([a-z]+)$/);
    if (m) toks[toks.length - 1].alt = m[1];
  }
  return toks;
}

/** how well one input token matches one name token (0..1) */
export function tokSim(a, b) {
  if (!a || !b || !a.r || !b.r) return 0;
  if (a.r === b.r) return 1;
  if (b.alt && a.r === b.alt) return 0.5;
  const an = /^\d+(\.\d+)?$/.test(a.r), bn = /^\d+$/.test(b.r);
  if (an || bn) return 0;
  const sing = (s) => s.replace(/(ies)$/, 'y').replace(/(ches|shes|xes|ses)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
  if (a.r.length >= 3 && sing(a.r) === sing(b.r)) return 0.95;
  if (a.k && a.k === b.k && a.k.length >= 3) return 0.85;
  // transliterated Urdu/Hindi loses vowels, so a short sound-alike is still a good match (कोक = coke, کین = can)
  const vowelStart = (x) => /^[aeiou]/.test(x);
  const sameStart = vowelStart(a.r) === vowelStart(b.r);
  if (a.native && a.k && a.k === b.k && a.k.length === 2 && sameStart && Math.abs(a.r.length - b.r.length) <= 2) return 0.85;
  if (a.native && a.k && a.k === b.k && a.k.length === 1 && sameStart && a.r.length >= 3 && b.r.length >= 3 && Math.abs(a.r.length - b.r.length) <= 2) return 0.8;
  if (a.k && a.k === b.k && a.k.length === 2 && Math.min(a.r.length, b.r.length) >= 3 && Math.abs(a.r.length - b.r.length) <= 2) return 0.7;
  const L = Math.min(a.r.length, b.r.length);
  if (L >= 4 && lev(sing(a.r), sing(b.r)) <= 1) return 0.82;
  if (L >= 7 && lev(a.r, b.r) <= 2) return 0.72;
  if (a.k.length >= 4 && b.k.length >= 4 && lev(a.k, b.k) <= 1 && (a.native || a.k.length >= 5)) return 0.7;
  if (a.r.length >= 4 && b.r.startsWith(a.r) && a.r.length / b.r.length >= 0.5) return 0.72;
  return 0;
}

/**
 * Build a matcher over named records. IDF weighting means words shared by
 * many records ("charger") count less than distinctive ones ("Anker").
 */
export function buildIndex(records, getName, extra = () => []) {
  const docs = records.map((rec) => {
    const toks = nameTokens(getName(rec));
    const ex = extra(rec).flatMap((s) => nameTokens(s)).map((t) => ({ ...t, extra: true }));
    return { rec, toks, ex };
  });
  const df = {};
  for (const d of docs) for (const k of new Set(d.toks.map((t) => t.r))) df[k] = (df[k] || 0) + 1;
  const N = Math.max(1, docs.length);
  for (const d of docs) {
    d.toks.forEach((t) => { t.w = (t.num != null ? 0.8 : 1) * (0.35 + Math.log(1 + N / (df[t.r] || 1)) / Math.log(1 + N)); });
    d.W = d.toks.reduce((a, t) => a + t.w, 0) || 1;
    // two name words said as one ("powerbank" = Power Bank)
    d.pairs = d.toks.slice(0, -1).map((t, i) => { const r = t.r + d.toks[i + 1].r; return { r, k: skel(r), i }; }).filter((x) => !/^\d/.test(x.r));
  }
  const vocab = new Set(docs.flatMap((d) => d.toks.map((t) => t.r)));
  return { docs, df, N, vocab };
}

/**
 * Score every record against tokens[from..to). Returns sorted candidates
 * { rec, score, used:Set<index>, hits }.
 */
export function matchIndex(index, tokens, opts = {}) {
  const { from = 0, to = tokens.length, skip = new Set(), aliasHits = null } = opts;
  // candidate input words: single tokens + adjacent pairs joined ("i phone" -> iphone)
  const words = [];
  for (let i = from; i < to; i++) {
    const t = tokens[i];
    if (!t || t.sep || t.cur || skip.has(i)) continue;
    const weak = STOP.has(t.r) && t.num == null;
    if (weak && !index.vocab.has(t.r)) continue;
    words.push({ r: t.r, k: t.k, idx: [i], num: t.num != null, native: t.native, weak });
    if (t.alts) t.alts.forEach((al) => words.push({ r: al.r, k: al.k, idx: [i] }));
    const n = tokens[i + 1];
    // two words written as one ("i phone" = iphone) — but never glue everyday words onto names
    const glue = (x) => x && !x.sep && !x.cur && x.num == null && !isConceptWord(x.r) && (!STOP.has(x.r) || x.r.length === 1);
    if (n && i + 1 < to && glue(t) && glue(n) && !skip.has(i + 1)) { const r = t.r + n.r; words.push({ r, k: skel(r), idx: [i, i + 1], native: t.native }); }
  }
  const out = [];
  for (const d of index.docs) {
    let got = 0, hits = 0, gotW = 0, best = 0, bestConcept = false, strongHits = 0, conceptHits = 0;
    const used = new Set();
    let firstHit = false;
    d.toks.forEach((nt, ti) => {
      let b = 0, bi = null, bw = null;
      for (const w of words) {
        if (w.idx.some((x) => used.has(x))) continue;
        let s = tokSim(w, nt);
        // everyday words (sales, shop, cash…) only count when they really are in the name
        if (s < 0.95 && isConceptWord(w.r) && !w.native) s = 0;
        if (w.weak) s = s >= 1 ? 0.5 : 0;
        if (s > b) { b = s; bi = w.idx; bw = w; }
      }
      if (b > 0) {
        got += b * nt.w; gotW += nt.w; hits++; nt.hit = true; if (!bw.weak) strongHits++; if (isConceptWord(bw.r)) conceptHits++; bi.forEach((x) => used.add(x)); if (ti === 0) firstHit = true;
        if (b > best) { best = b; bestConcept = isConceptWord(bw.r); }
      }
    });
    for (const pr of d.pairs || []) {
      if (d.toks[pr.i].hit || d.toks[pr.i + 1].hit) continue;
      for (const w of words) {
        if (w.weak || w.idx.some((x) => used.has(x))) continue;
        const s2 = tokSim(w, pr);
        if (s2 >= 0.8) {
          const pw = d.toks[pr.i].w + d.toks[pr.i + 1].w;
          got += s2 * pw; gotW += pw; hits += 2; strongHits++; w.idx.forEach((x) => used.add(x)); if (s2 > best) best = s2;
          if (pr.i === 0) firstHit = true;
          break;
        }
      }
    }
    d.toks.forEach((t) => { delete t.hit; });
    let exBest = 0;
    for (const et of d.ex) for (const w of words) { const s = tokSim(w, et); if (s > exBest) exBest = s; }
    if (!strongHits && exBest < 0.95) continue;
    if (hits && d.toks.every((nt) => nt.num != null || nt.alt ? true : true) && [...used].every((x) => tokens[x]?.num != null) && exBest < 0.95) continue;
    // people rarely say an item's full name: unmatched name words only count for part
    const missing = Math.max(0, d.W - gotW);
    let score = got / (got + 0.38 * missing + 1e-9);
    if (opts.person && firstHit && hits === 1 && d.toks.length > 1) score = Math.max(score, 0.72);
    if (exBest >= 0.95) score = Math.max(score, 0.9);
    out.push({ rec: d.rec, score: Math.min(1, score), used, hits, best, bestConcept, first: firstHit, conceptOnly: !opts.person && conceptHits > 0 && conceptHits >= strongHits });
  }
  if (aliasHits) for (const a of aliasHits) {
    const c = out.find((x) => x.rec === a.rec);
    if (c) { c.score = Math.max(c.score, 0.97); c.alias = true; c.used = new Set([...c.used, ...a.used]); } else out.push({ rec: a.rec, score: 0.97, used: new Set(a.used), hits: 1, best: 1, alias: true });
  }
  out.sort((a, b) => b.score - a.score || b.hits - a.hits);
  return out;
}

/** decide: a confident single match, a short list to ask about, a group, or nothing */
export function decide(cands, { sure = 0.62, gap = 0.12, floor = 0.42, prior = null } = {}) {
  const adj = (c) => c.score + (prior ? Math.min(0.03, (prior(c.rec) || 0) * 0.002) : 0);
  // a name that only matched everyday words ("clear" in "Clear Case") needs to be a strong match
  const list = cands.filter((c) => c.score >= floor && !(c.conceptOnly && c.score < 0.8 && !c.alias)).map((c) => Object.assign(c, { adj: adj(c) })).sort((a, b) => b.adj - a.adj);
  if (!list.length) {
    // one clear word that several names share ("chargers") → a group to ask about or total up
    const g = cands.filter((c) => c.best >= 0.7 && !c.bestConcept && c.score >= 0.25);
    if (g.length >= 2) return { kind: 'many', list: g.slice(0, 6), group: true };
    if (g.length === 1) return { kind: 'one', best: g[0], alts: [], soft: true };
    return { kind: 'none' };
  }
  const [a, b] = list;
  // only one word matched and other names contain that same word → it's a category ("chargers")
  if (!a.alias && a.hits === 1 && !a.bestConcept) {
    const key = [...a.used].sort().join(',');
    const same = cands.filter((c) => c.hits >= 1 && [...c.used].sort().join(',') === key && c.best >= 0.7);
    if (same.length >= 2) return { kind: 'many', list: same.slice(0, 6), group: true };
  }
  if (a.alias && (!b || !b.alias)) return { kind: 'one', best: a, alts: list.slice(1, 4) };
  // the top name explains every word the others explain, and more ("samsung charger")
  const others = list.slice(1).filter((c) => c.adj >= a.adj - 0.3);
  if (a.score >= 0.5 && others.length && others.every((c) => [...c.used].every((x) => a.used.has(x)) && c.used.size < a.used.size)) return { kind: 'one', best: a, alts: others };
  if (a.score >= sure && (!b || a.adj - b.adj >= gap || (a.score >= 0.99 && b.score < 0.99))) return { kind: 'one', best: a, alts: list.slice(1, 4) };
  const close = list.filter((c) => c.adj >= a.adj - 0.15).slice(0, 5);
  // only one name fits and it contains one of the words exactly ("kitkats" → KitKat 4-finger)
  if (close.length === 1) return { kind: 'one', best: a, alts: [], soft: a.score < sure && !((a.best >= 0.95 || (a.best >= 0.85 && a.first)) && !a.bestConcept && a.score >= 0.45 && (!b || b.adj < a.adj - 0.2)) };
  return { kind: 'many', list: close };
}

/* ---------------------------------------------------------------------
   Small helpers used by the brain
--------------------------------------------------------------------- */
export const methodIn = (tokens, skip = new Set()) => {
  const at = (n) => tokens.findIndex((t, i) => !skip.has(i) && VN[n].some((e) => vocabHit(t, e)));
  const c = at('CASH'), d = at('CARD'), b = at('BANK');
  const best = [[c, 'Cash'], [d, 'Card'], [b, 'Bank transfer']].filter(([i]) => i >= 0).sort((x, y) => x[0] - y[0])[0];
  return best ? best[1] : null;
};
export const locationIn = (tokens, skip = new Set()) => {
  const s = tokens.findIndex((t, i) => !skip.has(i) && VN.SHOP.some((e) => vocabHit(t, e)));
  const w = tokens.findIndex((t, i) => !skip.has(i) && VN.WAREHOUSE.some((e) => vocabHit(t, e)));
  return { shop: s, warehouse: w };
};
export const isYes = (tokens) => tokens.some((t) => VN.YES.some((e) => vocabHit(t, e)));
export const isNo = (tokens) => tokens.some((t) => VN.NO.some((e) => vocabHit(t, e)));
export const VOCAB = VN;
export { STOP };

/** One call that prepares everything the brain needs from a sentence. */
export function analyse(text, now = new Date()) {
  const raw = String(text || '').trim();
  const tokens = mergeNumbers(tokenize(raw), raw);
  const concepts = conceptsIn(tokens);
  const date = parseDate(tokens, now);
  const roman = tokens.map((t) => t.r).join(' ');
  const script = isUrdu(raw) ? 'ur' : isDev(raw) ? 'hi' : 'en';
  return { raw, tokens, concepts, date, roman, script };
}
