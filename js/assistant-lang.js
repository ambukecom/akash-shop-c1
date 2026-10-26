/* =====================================================================
   AI Shop Assistant · what it says, in English, Urdu and Hindi
   Each line is a function (p, f): p = the facts, f = formatters for
   money, numbers, dates and lists in that language. The same line is
   built twice — once for the screen and once for the voice.
===================================================================== */

export const LANGS = {
  en: { code: 'en', name: 'English', native: 'English', short: 'EN', speech: 'en-GB', listen: 'en-GB', dir: 'ltr', intl: 'en-GB' },
  ur: { code: 'ur', name: 'Urdu', native: 'اردو', short: 'اردو', speech: 'ur-PK', listen: 'ur-PK', dir: 'rtl', intl: 'ur-PK' },
  hi: { code: 'hi', name: 'Hindi', native: 'हिन्दी', short: 'हिं', speech: 'hi-IN', listen: 'hi-IN', dir: 'ltr', intl: 'hi-IN' },
};

const CUR = {
  GBP: { en: ['pound', 'pounds'], ur: 'پاؤنڈ', hi: 'पाउंड', minor: { en: 'p', ur: 'پینس', hi: 'पेंस' } },
  PKR: { en: ['rupee', 'rupees'], ur: 'روپے', hi: 'रुपये', minor: { en: 'paisa', ur: 'پیسے', hi: 'पैसे' } },
  INR: { en: ['rupee', 'rupees'], ur: 'روپے', hi: 'रुपये', minor: { en: 'paise', ur: 'پیسے', hi: 'पैसे' } },
  USD: { en: ['dollar', 'dollars'], ur: 'ڈالر', hi: 'डॉलर', minor: { en: 'cents', ur: 'سینٹ', hi: 'सेंट' } },
  EUR: { en: ['euro', 'euros'], ur: 'یورو', hi: 'यूरो', minor: { en: 'cents', ur: 'سینٹ', hi: 'सेंट' } },
};

/** Formatters for one language; `voice` = true gives words that read well aloud. */
export function formatters(lang, { currency = 'GBP', locale = 'en-GB', voice = false } = {}) {
  const L = LANGS[lang] || LANGS.en;
  const cur = CUR[currency] || CUR.GBP;
  const intlNum = (n, opt = {}) => new Intl.NumberFormat(lang === 'en' ? locale : 'en-GB', opt).format(n);
  const money = (n) => {
    n = Math.round((Number(n) || 0) * 100) / 100;
    if (!voice) {
      const whole = Math.abs(n) >= 1000 || Number.isInteger(n);
      return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n);
    }
    const w = Math.trunc(n), c = Math.round(Math.abs(n - w) * 100);
    if (lang === 'en') {
      const unit = w === 1 ? cur.en[0] : cur.en[1];
      if (currency === 'GBP' && w === 0 && c) return `${c} pence`;
      return c ? `${intlNum(w)} ${unit} ${c}` : `${intlNum(w)} ${unit}`;
    }
    const unit = cur[lang];
    return c ? `${w} ${unit} ${c} ${cur.minor[lang]}` : `${w} ${unit}`;
  };
  const num = (n) => (lang === 'en' ? intlNum(n) : String(Math.round(n * 100) / 100));
  const dl = (d, o) => d.toLocaleDateString(L.intl, o);
  const date = (d) => dl(d, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateY = (d) => dl(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const short = (d) => dl(d, { day: 'numeric', month: 'short' });
  const words = {
    en: { today: 'today', yesterday: 'yesterday', thisweek: 'this week', lastweek: 'last week', thismonth: 'this month', lastmonth: 'last month', thisyear: 'this year', lastyear: 'last year', all: 'all time', lastn: (n) => `the last ${n} days`, and: 'and' },
    ur: { today: 'آج', yesterday: 'کل', thisweek: 'اس ہفتے', lastweek: 'پچھلے ہفتے', thismonth: 'اس مہینے', lastmonth: 'پچھلے مہینے', thisyear: 'اس سال', lastyear: 'پچھلے سال', all: 'شروع سے اب تک', lastn: (n) => `پچھلے ${n} دن`, and: 'اور' },
    hi: { today: 'आज', yesterday: 'कल', thisweek: 'इस हफ़्ते', lastweek: 'पिछले हफ़्ते', thismonth: 'इस महीने', lastmonth: 'पिछले महीने', thisyear: 'इस साल', lastyear: 'पिछले साल', all: 'शुरू से अब तक', lastn: (n) => `पिछले ${n} दिन`, and: 'और' },
  }[lang] || {};
  const range = (r) => {
    if (!r) return words.today;
    const days = Math.round((r.end - r.start) / 864e5) + 1;
    if (words[r.kind] && typeof words[r.kind] === 'string') return words[r.kind];
    if (r.kind === 'lastn') return words.lastn(days);
    if (r.kind === 'month') return dl(r.start, { month: 'long', year: 'numeric' });
    if (days === 1) return date(r.start);
    return `${short(r.start)} – ${short(r.end)}`;
  };
  const list = (arr) => {
    const a = arr.filter(Boolean);
    if (a.length <= 1) return a.join('');
    const sep = lang === 'ur' ? '، ' : ', ';
    return a.slice(0, -1).join(sep) + ` ${words.and} ` + a[a.length - 1];
  };
  const pl = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
  return { money, num, date, dateY, short, range, list, pl, lang, voice, words };
}

/* ---------------------------------------------------------------------
   English
--------------------------------------------------------------------- */
const en = {
  hello: (p) => `${{ morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }[p.part]}! I'm your AI Shop Assistant for ${p.shop}.`,
  ask: () => 'What can I do for you?',
  askMore: () => 'Anything else?',
  listeningTip: () => "I'm listening — just talk normally. Tap the microphone any time to pause me.",
  help: () => `Here are some things you can ask me:
• "What are today's sales?" or "sales last week"
• "How many chargers in the warehouse?"
• "Give me the day's summary"
• "Who owes the most?" / "Who has owed the longest?"
• "What's Ravi's balance?" / "Read Ravi's last invoice"
• "Ravi paid 200 in cash"
• "We received 20 cases in the warehouse" / "Move 5 cases to the shop"
• "Start a sale" — then tell me the items, like "2 chargers and a case at 5 pounds"
• "Sales report for this month"`,
  sorry: () => "Sorry, I didn't quite catch that.",
  sorryHint: () => 'Try saying it another way, or tap one of the suggestions.',
  didYouMean: (p) => `Did you mean ${p.what}?`,
  thanks: () => "You're welcome! I'm here whenever you need me.",
  bye: () => "Okay. I'll be right here when you need me.",
  greetBack: () => 'Hello! What can I do for you?',
  cancelled: () => "Okay, I've cancelled that. Nothing was changed.",
  nothingPending: () => "Okay.",
  sayYesNo: () => 'Please say yes or no.',
  confirmQ: () => 'Shall I go ahead?',
  muted: () => "Voice is off. I'll reply on screen.",
  unmuted: () => 'Voice is back on.',
  langSet: () => "Okay, I'll speak English from now on.",
  noRepeat: () => "I haven't said anything yet.",
  stillThere: () => "I'm still here, listening.",
  needData: () => "Sales features aren't switched on yet, so I can't see invoices. Run the sales setup first.",
  noPermission: (p) => `That didn't work: ${p.msg}`,
  saved: () => 'Done.',

  // sales
  salesNone: (p, f) => (p.past ? `No money came in ${f.range(p.r)}.` : `No money has come in ${f.range(p.r)} yet.`),
  salesOne: (p, f) => `Sales ${f.range(p.r)} are ${f.money(p.total)}, from ${f.pl(p.count, 'payment', 'payments')}.`
    + (p.invoices ? ` ${f.pl(p.invoices, 'invoice was', 'invoices were')} raised, ${f.pl(p.units, 'unit', 'units')} sold.` : '')
    + (p.credit > 0 ? ` ${f.money(p.credit)} was given on credit.` : ''),
  salesRange: (p, f) => `Sales for ${f.range(p.r)}: ${f.money(p.total)} from ${f.pl(p.count, 'payment', 'payments')}.`
    + (p.best ? ` The best day was ${f.date(p.best.day)} with ${f.money(p.best.amount)}.` : '')
    + (p.days > 1 ? ` That's about ${f.money(p.avg)} a day.` : ''),
  salesCompare: (p, f) => (p.diff > 0 ? `That's ${f.money(p.diff)} more than ${p.prevLabel}.` : p.diff < 0 ? `That's ${f.money(-p.diff)} less than ${p.prevLabel}.` : `Exactly the same as ${p.prevLabel}.`),
  prevDay: () => 'yesterday',
  prevPeriod: () => 'the period before',

  // summary
  summaryHead: (p, f) => `Here's your summary for ${f.range(p.r)}.`,
  summarySales: (p, f) => (p.total > 0 ? `Money in: ${f.money(p.total)} from ${f.pl(p.count, 'payment', 'payments')}.` : 'No money has come in yet.'),
  summaryInvoices: (p, f) => (p.invoices ? `${f.pl(p.invoices, 'sale', 'sales')} made, ${f.pl(p.units, 'unit', 'units')} sold${p.top ? `; the top item was ${p.top}` : ''}.` : 'No sales have been recorded yet.'),
  summaryCredit: (p, f) => `${f.money(p.credit)} went out on credit.`,
  summaryOld: (p, f) => `${f.money(p.old)} was collected on older invoices.`,
  summaryOwed: (p, f) => `In total, ${f.pl(p.people, 'customer owes', 'customers owe')} ${f.money(p.owed)}.`,
  summaryStock: (p, f) => (p.out || p.low ? `Stock alerts: ${p.out ? f.pl(p.out, 'item is', 'items are') + ' out' : ''}${p.out && p.low ? ' and ' : ''}${p.low ? f.pl(p.low, 'item is', 'items are') + ' running low' : ''}.` : 'All stock levels look healthy.'),
  summaryIn: (p, f) => `${f.pl(p.units, 'unit', 'units')} of new stock came in.`,

  // stock
  stockOne: (p, f) => `You have ${f.num(p.total)} ${p.name}: ${f.num(p.shop)} in the shop and ${f.num(p.wh)} in the warehouse.`,
  stockShop: (p, f) => `There ${p.qty === 1 ? 'is' : 'are'} ${f.num(p.qty)} ${p.name} in the shop.` + (p.other ? ` (${f.num(p.other)} more in the warehouse.)` : ''),
  stockWh: (p, f) => `There ${p.qty === 1 ? 'is' : 'are'} ${f.num(p.qty)} ${p.name} in the warehouse.` + (p.other ? ` (${f.num(p.other)} in the shop.)` : ''),
  stockNone: (p) => `${p.name} is out of stock — none in the shop or the warehouse.`,
  stockFlagged: () => 'It is flagged as out of stock.',
  stockLowNote: (p, f) => `That's running low — the alert level is ${f.num(p.min)}.`,
  stockShelfNote: () => 'The shop shelf is empty but there is stock in the warehouse. Say "move some to the shop" if you like.',
  stockPrice: (p, f) => `It sells for ${f.money(p.price)} each.`,
  stockGroup: (p, f) => `I found ${f.num(p.kinds)} ${p.word} items with ${f.num(p.total)} in total: ${f.num(p.shop)} in the shop and ${f.num(p.wh)} in the warehouse.`,
  priceOf: (p, f) => `${p.name} is priced at ${f.money(p.price)} each.`,
  lowList: (p, f) => `${f.pl(p.n, 'item is', 'items are')} running low: ${f.list(p.names)}.`,
  outList: (p, f) => `${f.pl(p.n, 'item is', 'items are')} out of stock: ${f.list(p.names)}.`,
  allStocked: () => 'Good news — nothing is low or out of stock.',
  noOut: () => 'Nothing is out of stock right now.',
  noLow: () => 'Nothing is running low right now.',
  itemSold: (p, f) => `${f.range(p.r)[0].toUpperCase() + f.range(p.r).slice(1)}, you sold ${f.num(p.units)} ${p.name} for ${f.money(p.amount)} on ${f.pl(p.invoices, 'invoice', 'invoices')}.`,
  itemNotSold: (p, f) => `No ${p.name} were sold ${f.range(p.r)}.`,
  itemLastSold: (p, f) => `The last one was sold on ${f.date(p.at)}.`,
  bestSellers: (p, f) => `Best sellers ${f.range(p.r)}: ${f.list(p.list.map((x) => `${x.name} (${f.num(x.units)})`))}.`,
  noBest: (p, f) => `Nothing was sold ${f.range(p.r)}.`,
  stockValue: (p, f) => `You have ${f.num(p.units)} units across ${f.pl(p.kinds, 'item', 'items')}, worth about ${f.money(p.value)} at selling price.`,
  stockCount: (p, f) => `You have ${f.pl(p.kinds, 'item', 'items')} in ${f.pl(p.brands, 'brand', 'brands')}, ${f.num(p.units)} units in total.`,

  // debts
  topDebtor: (p, f) => `${p.name} owes the most: ${f.money(p.amount)} on ${f.pl(p.count, 'invoice', 'invoices')}.`,
  oldestDebtor: (p, f) => `${p.name} has owed the longest — since ${f.dateY(p.since)}, that's ${f.pl(p.days, 'day', 'days')}. They owe ${f.money(p.amount)}.`,
  debtList: (p, f) => `${f.pl(p.n, 'customer owes', 'customers owe')} you ${f.money(p.total)} in total. ${p.top ? `The top ${p.top.length === 1 ? 'one is' : p.top.length + ' are'}: ${f.list(p.top.map((x) => `${x.name} ${f.money(x.amount)}`))}.` : ''}`,
  noDebts: () => "Nobody owes you anything — every invoice is paid.",
  balance: (p, f) => `${p.name} owes ${f.money(p.amount)} on ${f.pl(p.count, 'invoice', 'invoices')}. The oldest is from ${f.dateY(p.since)}.`,
  balanceZero: (p) => `${p.name} doesn't owe anything — all paid up.`,
  balanceNew: (p) => `${p.name} hasn't bought anything yet.`,

  // invoices
  invoiceRead: (p, f) => `Invoice ${p.no}, ${f.dateY(p.date)}, for ${p.name}: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name} at ${f.money(l.price)}`))}. Total ${f.money(p.total)}.`
    + (p.owed > 0 ? ` Paid ${f.money(p.paid)}, ${f.money(p.owed)} still owed.` : ' Paid in full.'),
  invoiceItems: (p, f) => `The items are: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name}`))}.`,
  invoiceNone: (p) => `I can't find any invoices for ${p.name}.`,
  invoiceNotFound: (p) => `I can't find invoice ${p.no}.`,
  invoiceCount: (p, f) => `${p.name} has ${f.pl(p.count, 'invoice', 'invoices')}. Here's the latest one.`,

  // payments
  payAskAmount: (p, f) => `${p.name} owes ${f.money(p.owed)}. How much did they pay?`,
  payConfirm: (p, f) => `Record ${f.money(p.amount)} ${p.method === 'Cash' ? 'in cash' : p.method === 'Card' ? 'by card' : 'by bank transfer'} from ${p.name}? ` + (p.after > 0 ? `They'll still owe ${f.money(p.after)}.` : 'That clears everything they owe.'),
  payDone: (p, f) => `Done. ${f.money(p.amount)} recorded for ${p.name}.` + (p.after > 0 ? ` They now owe ${f.money(p.after)}.` : ' They are fully paid up.'),
  payTooMuch: (p, f) => `${p.name} only owes ${f.money(p.owed)}. Shall I record ${f.money(p.owed)} instead?`,
  payNothingOwed: (p) => `${p.name} doesn't owe anything, so there's nothing to record.`,
  payWho: () => 'Who made the payment?',
  payMethodNote: () => 'Say "card" or "bank" if it wasn\'t cash.',

  // stock changes
  adjConfirmIn: (p, f) => `Add ${f.num(p.qty)} ${p.name} to the ${p.loc === 'shop' ? 'shop' : 'warehouse'}? After that: shop ${f.num(p.shop)}, warehouse ${f.num(p.wh)}.`,
  adjConfirmOut: (p, f) => `Take ${f.num(p.qty)} ${p.name} out of the ${p.loc === 'shop' ? 'shop' : 'warehouse'}${p.reason ? ` as ${p.reason.toLowerCase()}` : ''}? After that: shop ${f.num(p.shop)}, warehouse ${f.num(p.wh)}.`,
  moveConfirm: (p, f) => `Move ${f.num(p.qty)} ${p.name} from the ${p.dir === 'to_shop' ? 'warehouse to the shop' : 'shop to the warehouse'}? After that: shop ${f.num(p.shop)}, warehouse ${f.num(p.wh)}.`,
  setConfirm: (p, f) => `Set ${p.name} in the ${p.loc === 'shop' ? 'shop' : 'warehouse'} to ${f.num(p.to)} (it's ${f.num(p.from)} now)?`,
  adjDone: (p, f) => `Done. ${p.name} now has ${f.num(p.shop)} in the shop and ${f.num(p.wh)} in the warehouse.`,
  notEnough: (p, f) => `There ${p.have === 1 ? 'is' : 'are'} only ${f.num(p.have)} ${p.name} in the ${p.loc === 'shop' ? 'shop' : 'warehouse'}.`,
  askQty: (p) => `How many ${p.name}?`,
  askWhere: () => 'Into the shop or the warehouse?',
  stockOrSale: (p, f) => `Do you want to add ${f.num(p.qty)} ${p.name} to the stock, or start a sale with them?`,
  optStock: () => 'Add to stock', optSale: () => 'Start a sale',
  locNote: (p) => `I've assumed the ${p.loc === 'shop' ? 'shop' : 'warehouse'} — say "${p.loc === 'shop' ? 'warehouse' : 'shop'}" to change it.`,
  flagConfirm: (p) => `Flag ${p.name} as out of stock?`,
  unflagConfirm: (p) => `Remove the out-of-stock flag from ${p.name}?`,
  flagDone: (p) => `Done. ${p.name} is ${p.on ? 'flagged as out of stock' : 'no longer flagged'}.`,
  sameAlready: (p, f) => `${p.name} is already at ${f.num(p.qty)} — nothing to change.`,

  // live sales counter
  posOpened: () => 'The Live Sales Counter is open. Tell me the items and quantities — for example "2 chargers and a phone case".',
  posAlready: () => "The counter is already open. Go ahead with the items.",
  posAdded: (p, f) => `Added ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name}${l.price != null ? ` at ${f.money(l.price)}` : ''}`))}. Total is now ${f.money(p.total)}.`,
  posLimited: (p, f) => `Only ${f.num(p.avail)} ${p.name} ${p.avail === 1 ? 'is' : 'are'} left in the shop, so I added ${f.num(p.avail)}.`,
  posNoStock: (p) => `${p.name} has no stock left in the shop.`,
  posPrice: (p, f) => `${p.name} is now ${f.money(p.price)} each. Total ${f.money(p.total)}.`,
  posQty: (p, f) => `${p.name} is now ${f.num(p.qty)}. Total ${f.money(p.total)}.`,
  posRemoved: (p, f) => `Removed ${p.name}. Total ${f.money(p.total)}.`,
  posNotInSheet: (p) => `${p.name} isn't on the sales sheet.`,
  posRead: (p, f) => `On the sheet: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name} at ${f.money(l.price)}`))}. Total ${f.money(p.total)}.`,
  posEmpty: () => 'The sales sheet is empty. Tell me what the customer is buying.',
  posClearQ: () => 'Clear everything from the sales sheet?',
  posCleared: () => 'The sales sheet is clear.',
  posUndone: (p) => `Undone — ${p.name} taken back off.`,
  posNothingUndo: () => "There's nothing to undo.",
  posAskCustomer: (p, f) => `That's ${f.pl(p.n, 'item', 'items')}, total ${f.money(p.total)}. Who is the customer? Say their name, or "private".`,
  posCustomer: (p) => (p.mode === 'private' ? 'Private customer.' : p.mode === 'new' ? `New customer ${p.name} — I'll save them for next time.` : `${p.name}.`),
  posAskPay: (p, f) => `How much have they paid? Say "in full", an amount, or "nothing" if it's on credit.`,
  posConfirm: (p, f) => `Record the sale for ${p.name}: total ${f.money(p.total)}, ` + (p.paid >= p.total ? `paid in full ${p.method === 'Cash' ? 'in cash' : p.method === 'Card' ? 'by card' : 'by bank transfer'}?` : p.paid > 0 ? `${f.money(p.paid)} paid ${p.method === 'Cash' ? 'in cash' : p.method === 'Card' ? 'by card' : 'by bank transfer'} and ${f.money(p.total - p.paid)} on credit?` : `all ${f.money(p.total)} on credit?`),
  posRecorded: (p, f) => `Sale recorded. Invoice ${p.no} has downloaded.` + (p.owed > 0 ? ` ${f.money(p.owed)} goes to Not Fully Paid.` : ''),
  posPrivateCredit: () => "Note: it's a private customer with money owed — you won't know who owes it. Say a name to change it, or yes to go ahead.",
  posNotOpen: () => "The sales counter isn't open. Shall I start a new sale?",
  posBackToSale: () => "Let's carry on with the sale.",
  posClosed: () => 'Closed the sales counter.',
  posNewSale: () => 'Ready for the next sale. What are they buying?',

  // reports + navigation
  reportDone: (p, f) => `Your sales report for ${f.range(p.r)} has downloaded: ${f.money(p.total)} from ${f.pl(p.count, 'payment', 'payments')}.`,
  invoicePdf: (p) => `Invoice ${p.no} has downloaded.`,
  invReport: () => 'Your inventory report PDF has downloaded.',
  brandStock: (p, f) => `${p.name} has ${f.pl(p.kinds, 'item', 'items')}: ${f.num(p.shop)} units in the shop and ${f.num(p.wh)} in the warehouse.${p.low ? ` ${f.pl(p.low, 'needs', 'need')} attention.` : ''}`,
  nav: (p) => `Opening ${p.where}.`,
  where: { dashboard: 'the dashboard', invoices: 'invoices', unpaid: 'Not Fully Paid', tracker: 'the Sales Tracker' },

  // picking
  whichItem: (p, f) => `Which one do you mean: ${f.list(p.names)}?`,
  whichCustomer: (p, f) => `Which customer: ${f.list(p.names)}?`,
  pickAgain: () => 'Sorry, which one? You can say the name, or "the first one".',
  maybeItem: (p) => `Did you mean ${p.name}?`,
  maybeCustomer: (p) => `Did you mean ${p.name}?`,
  noItem: (p) => `I couldn't find an item called "${p.q}".`,
  noItemAny: () => "I couldn't tell which item you mean. Please say its name.",
  noCustomer: (p) => `I couldn't find a customer called "${p.q}".`,
  learnt: () => "Got it — I'll remember that.",
  taught: (p) => `Got it. When you say "${p.phrase}", I'll know you mean ${p.name}.`,
  teachHow: () => 'You can teach me your own words. Say: "when I say black charger, I mean Samsung 25W Fast Charger".',

  // intent labels for "did you mean"
  intents: {
    sales: "today's sales", summary: "the day's summary", stock: 'a stock check', low: "what's running low", debts: 'who owes money',
    balance: "a customer's balance", invoice: "a customer's invoice", payment: 'recording a payment', adjust: 'changing stock',
    pos: 'starting a sale', report: 'a sales report', help: 'what I can do',
  },
  ui: {
    title: 'AI Shop Assistant', listening: 'Listening…', paused: 'Mic paused', thinking: 'Thinking…', speaking: 'Speaking…', ready: 'Ready',
    typeHere: 'Type or tap the mic…', send: 'Send', yes: 'Yes', no: 'No', cancel: 'Cancel', language: 'Language',
    voiceOn: 'Voice on', voiceOff: 'Voice off', micOn: 'Tap to pause listening', micOff: 'Tap to talk', close: 'Close',
    downloading: 'Downloading', ready2: 'Ready', voiceMissing: 'No voice installed for this language on this device — replies will be on screen only.',
    noMic: 'Voice input is not supported in this browser. You can still type. (Chrome, Edge or Safari support talking.)',
    micBlocked: 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then tap the mic.',
    shop: 'Shop', warehouse: 'Warehouse', total: 'Total', paid: 'Paid', owed: 'Owed', qty: 'Qty', price: 'Price', amount: 'Amount',
    payments: 'Payments', invoices: 'Invoices', units: 'Units', since: 'Since', days: 'days', download: 'Download PDF', open: 'Open',
    suggestions: ["Today's sales", 'Day summary', 'Who owes the most?', "What's running low?", 'Start a sale', 'What can you do?'],
    posSuggestions: ['Read back the order', "That's all", 'Undo', 'Clear the sheet'],
    tagline: 'Ask about sales, stock, customers — or let me run the counter.',
    poweredBy: 'Built-in assistant · no extra AI service needed',
    heard: 'Heard',
    ignored: "Didn't sound like it was meant for me, so I stayed quiet.",
  },
};

/* ---------------------------------------------------------------------
   Urdu
--------------------------------------------------------------------- */
const ur = {
  hello: (p) => `${{ morning: 'صبح بخیر', afternoon: 'السلام علیکم', evening: 'شام بخیر' }[p.part]}! میں ${p.shop} کا اے آئی شاپ اسسٹنٹ ہوں۔`,
  ask: () => 'بتائیے، میں آپ کی کیا مدد کر سکتا ہوں؟',
  askMore: () => 'اور کچھ؟',
  listeningTip: () => 'میں سن رہا ہوں — آرام سے بات کریں۔ روکنے کے لیے مائیک پر ٹیپ کریں۔',
  help: () => `آپ مجھ سے یہ سب پوچھ سکتے ہیں:
• "آج کی سیل کتنی ہوئی؟" یا "پچھلے ہفتے کی سیل"
• "گودام میں کتنے چارجر ہیں؟"
• "آج کا خلاصہ بتاؤ"
• "سب سے زیادہ ادھار کس کا ہے؟" / "سب سے پرانا ادھار کس کا ہے؟"
• "روی کا بیلنس کتنا ہے؟" / "روی کا آخری بل پڑھو"
• "روی نے 200 نقد دیے"
• "گودام میں 20 کیس آئے" / "5 کیس دکان میں لاؤ"
• "نئی سیل شروع کرو" — پھر چیزیں بتائیں، جیسے "2 چارجر اور ایک کیس"
• "اس مہینے کی سیل رپورٹ بناؤ"`,
  sorry: () => 'معاف کیجیے، میں ٹھیک سے سمجھ نہیں پایا۔',
  sorryHint: () => 'ذرا دوسرے طریقے سے کہیں، یا نیچے کوئی تجویز ٹیپ کریں۔',
  didYouMean: (p) => `کیا آپ کا مطلب ${p.what} ہے؟`,
  thanks: () => 'کوئی بات نہیں! جب ضرورت ہو، میں حاضر ہوں۔',
  bye: () => 'ٹھیک ہے۔ جب ضرورت ہو، میں یہیں ہوں۔',
  greetBack: () => 'وعلیکم السلام! بتائیے، کیا کرنا ہے؟',
  cancelled: () => 'ٹھیک ہے، میں نے منسوخ کر دیا۔ کچھ تبدیل نہیں ہوا۔',
  nothingPending: () => 'ٹھیک ہے۔',
  sayYesNo: () => 'براہ کرم "ہاں" یا "نہیں" کہیں۔',
  confirmQ: () => 'کیا میں کر دوں؟',
  muted: () => 'آواز بند ہے۔ میں سکرین پر جواب دوں گا۔',
  unmuted: () => 'آواز دوبارہ چالو ہے۔',
  langSet: () => 'ٹھیک ہے، اب میں اردو میں بات کروں گا۔',
  noRepeat: () => 'میں نے ابھی کچھ نہیں کہا۔',
  stillThere: () => 'میں یہیں ہوں، سن رہا ہوں۔',
  needData: () => 'سیل کا سیٹ اپ ابھی مکمل نہیں، اس لیے میں بل نہیں دیکھ سکتا۔',
  noPermission: (p) => `یہ نہیں ہو سکا: ${p.msg}`,
  saved: () => 'ہو گیا۔',

  salesNone: (p, f) => (p.past ? `${f.range(p.r)} کوئی رقم نہیں آئی۔` : `${f.range(p.r)} ابھی تک کوئی رقم نہیں آئی۔`),
  salesOne: (p, f) => `${f.range(p.r)} کی سیل ${f.money(p.total)} ہے، ${p.count === 1 ? 'ایک ادائیگی' : `${f.num(p.count)} ادائیگیوں`} سے۔`
    + (p.invoices ? ` ${f.num(p.invoices)} بل بنے اور ${f.num(p.units)} چیزیں بکیں۔` : '')
    + (p.credit > 0 ? ` ${f.money(p.credit)} ادھار پر گیا۔` : ''),
  salesRange: (p, f) => `${f.range(p.r)} کی سیل: ${f.money(p.total)}، ${p.count === 1 ? 'ایک ادائیگی' : `${f.num(p.count)} ادائیگیوں`} سے۔`
    + (p.best ? ` سب سے اچھا دن ${f.date(p.best.day)} تھا، ${f.money(p.best.amount)} کے ساتھ۔` : '')
    + (p.days > 1 ? ` یعنی روزانہ تقریباً ${f.money(p.avg)}۔` : ''),
  salesCompare: (p, f) => (p.diff > 0 ? `یہ ${p.prevLabel} سے ${f.money(p.diff)} زیادہ ہے۔` : p.diff < 0 ? `یہ ${p.prevLabel} سے ${f.money(-p.diff)} کم ہے۔` : `بالکل ${p.prevLabel} جتنی۔`),
  prevDay: () => 'کل',
  prevPeriod: () => 'پچھلے عرصے',

  summaryHead: (p, f) => `${f.range(p.r)} کا خلاصہ یہ ہے۔`,
  summarySales: (p, f) => (p.total > 0 ? `آمدنی: ${f.money(p.total)}، ${p.count === 1 ? 'ایک ادائیگی' : `${f.num(p.count)} ادائیگیوں`} سے۔` : 'ابھی تک کوئی رقم نہیں آئی۔'),
  summaryInvoices: (p, f) => (p.invoices ? `${f.num(p.invoices)} سیل ہوئیں، ${f.num(p.units)} چیزیں بکیں${p.top ? `؛ سب سے زیادہ ${p.top} بکا` : ''}۔` : 'ابھی تک کوئی سیل درج نہیں ہوئی۔'),
  summaryCredit: (p, f) => `${f.money(p.credit)} ادھار پر گیا۔`,
  summaryOld: (p, f) => `پرانے بلوں پر ${f.money(p.old)} وصول ہوئے۔`,
  summaryOwed: (p, f) => `کل ملا کر ${f.num(p.people)} گاہکوں پر ${f.money(p.owed)} ادھار ہے۔`,
  summaryStock: (p, f) => (p.out || p.low ? `اسٹاک الرٹ: ${p.out ? (p.out === 1 ? 'ایک چیز ختم ہے' : `${f.num(p.out)} چیزیں ختم ہیں`) : ''}${p.out && p.low ? ' اور ' : ''}${p.low ? (p.low === 1 ? 'ایک چیز کم ہے' : `${f.num(p.low)} چیزیں کم ہیں`) : ''}۔` : 'سارا اسٹاک ٹھیک ہے۔'),
  summaryIn: (p, f) => `${f.num(p.units)} نیا مال آیا۔`,

  stockOne: (p, f) => `آپ کے پاس ${f.num(p.total)} ${p.name} ہیں: ${f.num(p.shop)} دکان میں اور ${f.num(p.wh)} گودام میں۔`,
  stockShop: (p, f) => `دکان میں ${f.num(p.qty)} ${p.name} ہیں۔` + (p.other ? ` (گودام میں ${f.num(p.other)} اور ہیں۔)` : ''),
  stockWh: (p, f) => `گودام میں ${f.num(p.qty)} ${p.name} ہیں۔` + (p.other ? ` (دکان میں ${f.num(p.other)} ہیں۔)` : ''),
  stockNone: (p) => `${p.name} ختم ہے — نہ دکان میں ہے نہ گودام میں۔`,
  stockFlagged: () => 'اس پر "ختم" کا نشان لگا ہوا ہے۔',
  stockLowNote: (p, f) => `یہ کم ہو رہا ہے — الرٹ کی حد ${f.num(p.min)} ہے۔`,
  stockShelfNote: () => 'دکان کی شیلف خالی ہے لیکن گودام میں مال ہے۔ چاہیں تو کہیں "کچھ دکان میں لاؤ"۔',
  stockPrice: (p, f) => `اس کی قیمت ${f.money(p.price)} فی عدد ہے۔`,
  stockGroup: (p, f) => `مجھے ${f.num(p.kinds)} قسم کے ${p.word} ملے، کل ${f.num(p.total)}: ${f.num(p.shop)} دکان میں اور ${f.num(p.wh)} گودام میں۔`,
  priceOf: (p, f) => `${p.name} کی قیمت ${f.money(p.price)} فی عدد ہے۔`,
  lowList: (p, f) => `${p.n === 1 ? 'ایک چیز کم ہے' : `${f.num(p.n)} چیزیں کم ہیں`}: ${f.list(p.names)}۔`,
  outList: (p, f) => `${p.n === 1 ? 'ایک چیز ختم ہے' : `${f.num(p.n)} چیزیں ختم ہیں`}: ${f.list(p.names)}۔`,
  allStocked: () => 'اچھی خبر — کوئی چیز کم یا ختم نہیں۔',
  noOut: () => 'اس وقت کوئی چیز ختم نہیں۔',
  noLow: () => 'اس وقت کوئی چیز کم نہیں۔',
  itemSold: (p, f) => `${f.range(p.r)} آپ نے ${f.num(p.units)} ${p.name} بیچے، ${f.money(p.amount)} کے، ${p.invoices === 1 ? 'ایک بل' : `${f.num(p.invoices)} بلوں`} پر۔`,
  itemNotSold: (p, f) => `${f.range(p.r)} کوئی ${p.name} نہیں بکا۔`,
  itemLastSold: (p, f) => `آخری بار ${f.date(p.at)} کو بکا تھا۔`,
  bestSellers: (p, f) => `${f.range(p.r)} سب سے زیادہ بکنے والی چیزیں: ${f.list(p.list.map((x) => `${x.name} (${f.num(x.units)})`))}۔`,
  noBest: (p, f) => `${f.range(p.r)} کچھ نہیں بکا۔`,
  stockValue: (p, f) => `آپ کے پاس ${f.num(p.kinds)} چیزوں کے ${f.num(p.units)} عدد ہیں، جن کی قیمتِ فروخت تقریباً ${f.money(p.value)} ہے۔`,
  stockCount: (p, f) => `آپ کے پاس ${f.num(p.brands)} برانڈز میں ${f.num(p.kinds)} چیزیں ہیں، کل ${f.num(p.units)} عدد۔`,

  topDebtor: (p, f) => `سب سے زیادہ ادھار ${p.name} کا ہے: ${f.money(p.amount)}، ${p.count === 1 ? 'ایک بل' : `${f.num(p.count)} بلوں`} پر۔`,
  oldestDebtor: (p, f) => `سب سے پرانا ادھار ${p.name} کا ہے — ${f.dateY(p.since)} سے، یعنی ${f.num(p.days)} دن۔ ان پر ${f.money(p.amount)} باقی ہیں۔`,
  debtList: (p, f) => `${f.num(p.n)} گاہکوں پر کل ${f.money(p.total)} ادھار ہے۔ ${p.top ? `سب سے زیادہ: ${f.list(p.top.map((x) => `${x.name} ${f.money(x.amount)}`))}۔` : ''}`,
  noDebts: () => 'کسی پر کوئی ادھار نہیں — سارے بل ادا ہو چکے ہیں۔',
  balance: (p, f) => `${p.name} پر ${f.money(p.amount)} باقی ہیں، ${p.count === 1 ? 'ایک بل' : `${f.num(p.count)} بلوں`} پر۔ سب سے پرانا بل ${f.dateY(p.since)} کا ہے۔`,
  balanceZero: (p) => `${p.name} پر کچھ باقی نہیں — سب ادا ہو چکا ہے۔`,
  balanceNew: (p) => `${p.name} نے ابھی تک کچھ نہیں خریدا۔`,

  invoiceRead: (p, f) => `بل ${p.no}، ${f.dateY(p.date)}، ${p.name} کا: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name} ${f.money(l.price)} والے`))}۔ کل ${f.money(p.total)}۔`
    + (p.owed > 0 ? ` ${f.money(p.paid)} ادا ہوئے، ${f.money(p.owed)} باقی ہیں۔` : ' پورا ادا ہو چکا ہے۔'),
  invoiceItems: (p, f) => `چیزیں یہ ہیں: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name}`))}۔`,
  invoiceNone: (p) => `مجھے ${p.name} کا کوئی بل نہیں ملا۔`,
  invoiceNotFound: (p) => `مجھے بل ${p.no} نہیں ملا۔`,
  invoiceCount: (p, f) => `${p.name} کے ${f.num(p.count)} بل ہیں۔ یہ سب سے نیا ہے۔`,

  payAskAmount: (p, f) => `${p.name} پر ${f.money(p.owed)} باقی ہیں۔ انہوں نے کتنے دیے؟`,
  payConfirm: (p, f) => `${p.name} سے ${f.money(p.amount)} ${p.method === 'Cash' ? 'نقد' : p.method === 'Card' ? 'کارڈ سے' : 'بینک ٹرانسفر سے'} درج کر دوں؟ ` + (p.after > 0 ? `اس کے بعد ${f.money(p.after)} باقی رہیں گے۔` : 'اس سے ان کا سارا ادھار ختم ہو جائے گا۔'),
  payDone: (p, f) => `ہو گیا۔ ${p.name} کے ${f.money(p.amount)} درج ہو گئے۔` + (p.after > 0 ? ` اب ${f.money(p.after)} باقی ہیں۔` : ' اب ان پر کچھ باقی نہیں۔'),
  payTooMuch: (p, f) => `${p.name} پر صرف ${f.money(p.owed)} باقی ہیں۔ کیا ${f.money(p.owed)} درج کر دوں؟`,
  payNothingOwed: (p) => `${p.name} پر کوئی ادھار نہیں، اس لیے درج کرنے کو کچھ نہیں۔`,
  payWho: () => 'ادائیگی کس نے کی؟',
  payMethodNote: () => 'اگر نقد نہیں تھا تو "کارڈ" یا "بینک" کہیں۔',

  adjConfirmIn: (p, f) => `${p.loc === 'shop' ? 'دکان' : 'گودام'} میں ${f.num(p.qty)} ${p.name} شامل کر دوں؟ اس کے بعد: دکان ${f.num(p.shop)}، گودام ${f.num(p.wh)}۔`,
  adjConfirmOut: (p, f) => `${p.loc === 'shop' ? 'دکان' : 'گودام'} سے ${f.num(p.qty)} ${p.name} نکال دوں؟ اس کے بعد: دکان ${f.num(p.shop)}، گودام ${f.num(p.wh)}۔`,
  moveConfirm: (p, f) => `${f.num(p.qty)} ${p.name} ${p.dir === 'to_shop' ? 'گودام سے دکان میں' : 'دکان سے گودام میں'} منتقل کر دوں؟ اس کے بعد: دکان ${f.num(p.shop)}، گودام ${f.num(p.wh)}۔`,
  setConfirm: (p, f) => `${p.loc === 'shop' ? 'دکان' : 'گودام'} میں ${p.name} کو ${f.num(p.to)} کر دوں؟ (ابھی ${f.num(p.from)} ہیں)`,
  adjDone: (p, f) => `ہو گیا۔ اب ${p.name} دکان میں ${f.num(p.shop)} اور گودام میں ${f.num(p.wh)} ہیں۔`,
  notEnough: (p, f) => `${p.loc === 'shop' ? 'دکان' : 'گودام'} میں صرف ${f.num(p.have)} ${p.name} ہیں۔`,
  askQty: (p) => `کتنے ${p.name}؟`,
  askWhere: () => 'دکان میں یا گودام میں؟',
  stockOrSale: (p, f) => `${f.num(p.qty)} ${p.name} اسٹاک میں شامل کروں، یا ان کے ساتھ نئی سیل شروع کروں؟`,
  optStock: () => 'اسٹاک میں شامل کرو', optSale: () => 'سیل شروع کرو',
  locNote: (p) => `میں نے ${p.loc === 'shop' ? 'دکان' : 'گودام'} سمجھا ہے — بدلنا ہو تو "${p.loc === 'shop' ? 'گودام' : 'دکان'}" کہیں۔`,
  flagConfirm: (p) => `${p.name} پر "ختم" کا نشان لگا دوں؟`,
  unflagConfirm: (p) => `${p.name} سے "ختم" کا نشان ہٹا دوں؟`,
  flagDone: (p) => `ہو گیا۔ ${p.name} ${p.on ? 'پر ختم کا نشان لگ گیا' : 'سے نشان ہٹ گیا'}۔`,
  sameAlready: (p, f) => `${p.name} پہلے ہی ${f.num(p.qty)} ہیں — تبدیلی کی ضرورت نہیں۔`,

  posOpened: () => 'لائیو سیلز کاؤنٹر کھل گیا ہے۔ چیزیں اور تعداد بتائیں — جیسے "2 چارجر اور ایک موبائل کیس"۔',
  posAlready: () => 'کاؤنٹر پہلے سے کھلا ہے۔ چیزیں بتائیں۔',
  posAdded: (p, f) => `شامل کر دیے: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name}${l.price != null ? ` ${f.money(l.price)} والے` : ''}`))}۔ اب کل ${f.money(p.total)} ہے۔`,
  posLimited: (p, f) => `دکان میں صرف ${f.num(p.avail)} ${p.name} باقی ہیں، اس لیے ${f.num(p.avail)} ڈالے۔`,
  posNoStock: (p) => `${p.name} دکان میں ختم ہے۔`,
  posPrice: (p, f) => `اب ${p.name} ${f.money(p.price)} فی عدد ہے۔ کل ${f.money(p.total)}۔`,
  posQty: (p, f) => `اب ${p.name} ${f.num(p.qty)} ہیں۔ کل ${f.money(p.total)}۔`,
  posRemoved: (p, f) => `${p.name} نکال دیا۔ کل ${f.money(p.total)}۔`,
  posNotInSheet: (p) => `${p.name} سیلز شیٹ پر نہیں ہے۔`,
  posRead: (p, f) => `شیٹ پر: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name} ${f.money(l.price)} والے`))}۔ کل ${f.money(p.total)}۔`,
  posEmpty: () => 'سیلز شیٹ خالی ہے۔ بتائیں گاہک کیا لے رہا ہے۔',
  posClearQ: () => 'سیلز شیٹ سے سب کچھ ہٹا دوں؟',
  posCleared: () => 'سیلز شیٹ صاف ہو گئی۔',
  posUndone: (p) => `واپس لے لیا — ${p.name} ہٹا دیا۔`,
  posNothingUndo: () => 'واپس لینے کو کچھ نہیں۔',
  posAskCustomer: (p, f) => `${f.num(p.n)} چیزیں، کل ${f.money(p.total)}۔ گاہک کون ہے؟ نام بتائیں، یا "پرائیویٹ" کہیں۔`,
  posCustomer: (p) => (p.mode === 'private' ? 'پرائیویٹ گاہک۔' : p.mode === 'new' ? `نیا گاہک ${p.name} — اگلی بار کے لیے محفوظ کر لوں گا۔` : `${p.name}۔`),
  posAskPay: () => 'انہوں نے کتنے دیے؟ "پورے"، کوئی رقم، یا ادھار ہو تو "کچھ نہیں" کہیں۔',
  posConfirm: (p, f) => `${p.name} کی سیل درج کر دوں: کل ${f.money(p.total)}، ` + (p.paid >= p.total ? `پورے ادا ${p.method === 'Cash' ? 'نقد' : p.method === 'Card' ? 'کارڈ سے' : 'بینک سے'}؟` : p.paid > 0 ? `${f.money(p.paid)} ${p.method === 'Cash' ? 'نقد' : p.method === 'Card' ? 'کارڈ سے' : 'بینک سے'} ادا اور ${f.money(p.total - p.paid)} ادھار؟` : `پورے ${f.money(p.total)} ادھار پر؟`),
  posRecorded: (p, f) => `سیل درج ہو گئی۔ بل ${p.no} ڈاؤنلوڈ ہو گیا ہے۔` + (p.owed > 0 ? ` ${f.money(p.owed)} "مکمل ادا نہیں" میں چلا گیا۔` : ''),
  posPrivateCredit: () => 'دھیان دیں: پرائیویٹ گاہک پر ادھار ہے — پتا نہیں چلے گا کس پر ہے۔ نام بتا دیں، یا "ہاں" کہہ کر آگے بڑھیں۔',
  posNotOpen: () => 'سیلز کاؤنٹر کھلا نہیں ہے۔ نئی سیل شروع کروں؟',
  posBackToSale: () => 'چلیں سیل جاری رکھتے ہیں۔',
  posClosed: () => 'سیلز کاؤنٹر بند کر دیا۔',
  posNewSale: () => 'اگلی سیل کے لیے تیار۔ گاہک کیا لے رہا ہے؟',

  reportDone: (p, f) => `${f.range(p.r)} کی سیل رپورٹ ڈاؤنلوڈ ہو گئی: ${f.money(p.total)}، ${p.count === 1 ? 'ایک ادائیگی' : `${f.num(p.count)} ادائیگیوں`} سے۔`,
  invoicePdf: (p) => `بل ${p.no} ڈاؤنلوڈ ہو گیا۔`,
  invReport: () => 'اسٹاک رپورٹ کی PDF ڈاؤنلوڈ ہو گئی۔',
  brandStock: (p, f) => `${p.name} کی ${f.num(p.kinds)} چیزیں ہیں: دکان میں ${f.num(p.shop)} اور گودام میں ${f.num(p.wh)}۔${p.low ? ` ${f.num(p.low)} پر توجہ کی ضرورت ہے۔` : ''}`,
  nav: (p) => `${p.where} کھول رہا ہوں۔`,
  where: { dashboard: 'ڈیش بورڈ', invoices: 'بل', unpaid: 'مکمل ادا نہیں', tracker: 'سیلز ٹریکر' },

  whichItem: (p, f) => `کون سا: ${f.list(p.names)}؟`,
  whichCustomer: (p, f) => `کون سا گاہک: ${f.list(p.names)}؟`,
  pickAgain: () => 'معاف کیجیے، کون سا؟ نام بتائیں، یا "پہلا والا" کہیں۔',
  maybeItem: (p) => `کیا آپ کا مطلب ${p.name} ہے؟`,
  maybeCustomer: (p) => `کیا آپ کا مطلب ${p.name} ہے؟`,
  noItem: (p) => `مجھے "${p.q}" نام کی کوئی چیز نہیں ملی۔`,
  noItemAny: () => 'میں سمجھ نہیں پایا کون سی چیز۔ براہ کرم اس کا نام بتائیں۔',
  noCustomer: (p) => `مجھے "${p.q}" نام کا کوئی گاہک نہیں ملا۔`,
  learnt: () => 'سمجھ گیا — آئندہ یاد رکھوں گا۔',
  taught: (p) => `سمجھ گیا۔ جب آپ "${p.phrase}" کہیں گے تو میں سمجھوں گا کہ آپ کا مطلب ${p.name} ہے۔`,
  teachHow: () => 'آپ مجھے اپنے الفاظ سکھا سکتے ہیں۔ کہیں: "جب میں کالا چارجر کہوں تو مطلب Samsung 25W Fast Charger"۔',

  intents: {
    sales: 'آج کی سیل', summary: 'آج کا خلاصہ', stock: 'اسٹاک چیک', low: 'کم اسٹاک', debts: 'ادھار والے گاہک',
    balance: 'گاہک کا بیلنس', invoice: 'گاہک کا بل', payment: 'ادائیگی درج کرنا', adjust: 'اسٹاک بدلنا',
    pos: 'نئی سیل', report: 'سیل رپورٹ', help: 'میں کیا کر سکتا ہوں',
  },
  ui: {
    title: 'اے آئی شاپ اسسٹنٹ', listening: 'سن رہا ہوں…', paused: 'مائیک رکا ہوا ہے', thinking: 'سوچ رہا ہوں…', speaking: 'بول رہا ہوں…', ready: 'تیار',
    typeHere: 'لکھیں یا مائیک دبائیں…', send: 'بھیجیں', yes: 'ہاں', no: 'نہیں', cancel: 'منسوخ', language: 'زبان',
    voiceOn: 'آواز چالو', voiceOff: 'آواز بند', micOn: 'سننا روکنے کے لیے ٹیپ کریں', micOff: 'بات کرنے کے لیے ٹیپ کریں', close: 'بند کریں',
    downloading: 'ڈاؤنلوڈ ہو رہا ہے', ready2: 'تیار', voiceMissing: 'اس ڈیوائس پر اردو آواز انسٹال نہیں — میں ہندی آواز میں بولوں گا (یا صرف سکرین پر)۔ فون کی Text-to-speech سیٹنگ میں اردو آواز انسٹال کر سکتے ہیں۔',
    noMic: 'اس براؤزر میں آواز سے بات کی سہولت نہیں۔ آپ لکھ سکتے ہیں۔ (Chrome، Edge یا Safari میں بول سکتے ہیں۔)',
    micBlocked: 'مائیک کی اجازت بند ہے۔ براؤزر کی سیٹنگ میں اس سائٹ کو مائیک کی اجازت دیں، پھر مائیک دبائیں۔',
    shop: 'دکان', warehouse: 'گودام', total: 'کل', paid: 'ادا', owed: 'باقی', qty: 'تعداد', price: 'قیمت', amount: 'رقم',
    payments: 'ادائیگیاں', invoices: 'بل', units: 'عدد', since: 'سے', days: 'دن', download: 'PDF ڈاؤنلوڈ', open: 'کھولیں',
    suggestions: ['آج کی سیل', 'آج کا خلاصہ', 'سب سے زیادہ ادھار کس کا ہے؟', 'کیا کم ہے؟', 'نئی سیل شروع کرو', 'تم کیا کر سکتے ہو؟'],
    posSuggestions: ['آرڈر پڑھ کر سناؤ', 'بس اتنا ہی', 'واپس لو', 'شیٹ صاف کرو'],
    tagline: 'سیل، اسٹاک، گاہک — کچھ بھی پوچھیں، یا کاؤنٹر مجھے چلانے دیں۔',
    poweredBy: 'بلٹ اِن اسسٹنٹ · کسی اضافی اے آئی سروس کی ضرورت نہیں',
    heard: 'سنا',
    ignored: 'لگا یہ بات میرے لیے نہیں تھی، اس لیے میں خاموش رہا۔',
  },
};

/* ---------------------------------------------------------------------
   Hindi (everyday Hindustani, so it also works as Urdu's spoken fallback)
--------------------------------------------------------------------- */
const hi = {
  hello: (p) => `${{ morning: 'सुप्रभात', afternoon: 'नमस्ते', evening: 'शुभ संध्या' }[p.part]}! मैं ${p.shop} का एआई शॉप असिस्टेंट हूँ।`,
  ask: () => 'बताइए, मैं आपकी क्या मदद कर सकता हूँ?',
  askMore: () => 'और कुछ?',
  listeningTip: () => 'मैं सुन रहा हूँ — आराम से बात कीजिए। रोकने के लिए माइक पर टैप करें।',
  help: () => `आप मुझसे ये सब पूछ सकते हैं:
• "आज की सेल कितनी हुई?" या "पिछले हफ़्ते की सेल"
• "गोदाम में कितने चार्जर हैं?"
• "आज का सारांश बताओ"
• "सबसे ज़्यादा उधार किसका है?" / "सबसे पुराना उधार किसका है?"
• "रवि का बैलेंस कितना है?" / "रवि का आखिरी बिल पढ़ो"
• "रवि ने 200 नकद दिए"
• "गोदाम में 20 केस आए" / "5 केस दुकान में लाओ"
• "नई सेल शुरू करो" — फिर चीज़ें बताइए, जैसे "2 चार्जर और एक केस"
• "इस महीने की सेल रिपोर्ट बनाओ"`,
  sorry: () => 'माफ़ कीजिए, मैं ठीक से समझ नहीं पाया।',
  sorryHint: () => 'ज़रा दूसरे तरीके से कहिए, या नीचे कोई सुझाव टैप कीजिए।',
  didYouMean: (p) => `क्या आपका मतलब ${p.what} है?`,
  thanks: () => 'कोई बात नहीं! जब ज़रूरत हो, मैं हाज़िर हूँ।',
  bye: () => 'ठीक है। जब ज़रूरत हो, मैं यहीं हूँ।',
  greetBack: () => 'नमस्ते! बताइए, क्या करना है?',
  cancelled: () => 'ठीक है, मैंने रद्द कर दिया। कुछ नहीं बदला।',
  nothingPending: () => 'ठीक है।',
  sayYesNo: () => 'कृपया "हाँ" या "नहीं" कहिए।',
  confirmQ: () => 'क्या मैं कर दूँ?',
  muted: () => 'आवाज़ बंद है। मैं स्क्रीन पर जवाब दूँगा।',
  unmuted: () => 'आवाज़ फिर से चालू है।',
  langSet: () => 'ठीक है, अब मैं हिंदी में बात करूँगा।',
  noRepeat: () => 'मैंने अभी कुछ नहीं कहा।',
  stillThere: () => 'मैं यहीं हूँ, सुन रहा हूँ।',
  needData: () => 'सेल का सेटअप अभी पूरा नहीं, इसलिए मैं बिल नहीं देख सकता।',
  noPermission: (p) => `यह नहीं हो सका: ${p.msg}`,
  saved: () => 'हो गया।',

  salesNone: (p, f) => (p.past ? `${f.range(p.r)} कोई रकम नहीं आई।` : `${f.range(p.r)} अभी तक कोई रकम नहीं आई।`),
  salesOne: (p, f) => `${f.range(p.r)} की सेल ${f.money(p.total)} है, ${f.num(p.count)} पेमेंट से।`
    + (p.invoices ? ` ${f.num(p.invoices)} बिल बने और ${f.num(p.units)} चीज़ें बिकीं।` : '')
    + (p.credit > 0 ? ` ${f.money(p.credit)} उधार पर गया।` : ''),
  salesRange: (p, f) => `${f.range(p.r)} की सेल: ${f.money(p.total)}, ${f.num(p.count)} पेमेंट से।`
    + (p.best ? ` सबसे अच्छा दिन ${f.date(p.best.day)} था, ${f.money(p.best.amount)} के साथ।` : '')
    + (p.days > 1 ? ` यानी रोज़ाना लगभग ${f.money(p.avg)}।` : ''),
  salesCompare: (p, f) => (p.diff > 0 ? `यह ${p.prevLabel} से ${f.money(p.diff)} ज़्यादा है।` : p.diff < 0 ? `यह ${p.prevLabel} से ${f.money(-p.diff)} कम है।` : `बिल्कुल ${p.prevLabel} जितनी।`),
  prevDay: () => 'कल',
  prevPeriod: () => 'पिछले समय',

  summaryHead: (p, f) => `${f.range(p.r)} का सारांश यह है।`,
  summarySales: (p, f) => (p.total > 0 ? `आमदनी: ${f.money(p.total)}, ${f.num(p.count)} पेमेंट से।` : 'अभी तक कोई रकम नहीं आई।'),
  summaryInvoices: (p, f) => (p.invoices ? `${f.num(p.invoices)} सेल हुईं, ${f.num(p.units)} चीज़ें बिकीं${p.top ? `; सबसे ज़्यादा ${p.top} बिका` : ''}।` : 'अभी तक कोई सेल दर्ज नहीं हुई।'),
  summaryCredit: (p, f) => `${f.money(p.credit)} उधार पर गया।`,
  summaryOld: (p, f) => `पुराने बिलों पर ${f.money(p.old)} वसूल हुए।`,
  summaryOwed: (p, f) => `कुल मिलाकर ${f.num(p.people)} ग्राहकों पर ${f.money(p.owed)} उधार है।`,
  summaryStock: (p, f) => (p.out || p.low ? `स्टॉक अलर्ट: ${p.out ? (p.out === 1 ? 'एक चीज़ खत्म है' : `${f.num(p.out)} चीज़ें खत्म हैं`) : ''}${p.out && p.low ? ' और ' : ''}${p.low ? (p.low === 1 ? 'एक चीज़ कम है' : `${f.num(p.low)} चीज़ें कम हैं`) : ''}।` : 'सारा स्टॉक ठीक है।'),
  summaryIn: (p, f) => `${f.num(p.units)} नया माल आया।`,

  stockOne: (p, f) => `आपके पास ${f.num(p.total)} ${p.name} हैं: ${f.num(p.shop)} दुकान में और ${f.num(p.wh)} गोदाम में।`,
  stockShop: (p, f) => `दुकान में ${f.num(p.qty)} ${p.name} हैं।` + (p.other ? ` (गोदाम में ${f.num(p.other)} और हैं।)` : ''),
  stockWh: (p, f) => `गोदाम में ${f.num(p.qty)} ${p.name} हैं।` + (p.other ? ` (दुकान में ${f.num(p.other)} हैं।)` : ''),
  stockNone: (p) => `${p.name} खत्म है — न दुकान में है न गोदाम में।`,
  stockFlagged: () => 'इस पर "खत्म" का निशान लगा है।',
  stockLowNote: (p, f) => `यह कम हो रहा है — अलर्ट की सीमा ${f.num(p.min)} है।`,
  stockShelfNote: () => 'दुकान की शेल्फ खाली है लेकिन गोदाम में माल है। चाहें तो कहिए "कुछ दुकान में लाओ"।',
  stockPrice: (p, f) => `इसकी कीमत ${f.money(p.price)} प्रति नग है।`,
  stockGroup: (p, f) => `मुझे ${f.num(p.kinds)} तरह के ${p.word} मिले, कुल ${f.num(p.total)}: ${f.num(p.shop)} दुकान में और ${f.num(p.wh)} गोदाम में।`,
  priceOf: (p, f) => `${p.name} की कीमत ${f.money(p.price)} प्रति नग है।`,
  lowList: (p, f) => `${p.n === 1 ? 'एक चीज़ कम है' : `${f.num(p.n)} चीज़ें कम हैं`}: ${f.list(p.names)}।`,
  outList: (p, f) => `${p.n === 1 ? 'एक चीज़ खत्म है' : `${f.num(p.n)} चीज़ें खत्म हैं`}: ${f.list(p.names)}।`,
  allStocked: () => 'अच्छी खबर — कोई चीज़ कम या खत्म नहीं।',
  noOut: () => 'इस वक़्त कोई चीज़ खत्म नहीं।',
  noLow: () => 'इस वक़्त कोई चीज़ कम नहीं।',
  itemSold: (p, f) => `${f.range(p.r)} आपने ${f.num(p.units)} ${p.name} बेचे, ${f.money(p.amount)} के, ${p.invoices === 1 ? 'एक बिल' : `${f.num(p.invoices)} बिलों`} पर।`,
  itemNotSold: (p, f) => `${f.range(p.r)} कोई ${p.name} नहीं बिका।`,
  itemLastSold: (p, f) => `आखिरी बार ${f.date(p.at)} को बिका था।`,
  bestSellers: (p, f) => `${f.range(p.r)} सबसे ज़्यादा बिकने वाली चीज़ें: ${f.list(p.list.map((x) => `${x.name} (${f.num(x.units)})`))}।`,
  noBest: (p, f) => `${f.range(p.r)} कुछ नहीं बिका।`,
  stockValue: (p, f) => `आपके पास ${f.num(p.kinds)} चीज़ों के ${f.num(p.units)} नग हैं, जिनकी बिक्री कीमत लगभग ${f.money(p.value)} है।`,
  stockCount: (p, f) => `आपके पास ${f.num(p.brands)} ब्रांड में ${f.num(p.kinds)} चीज़ें हैं, कुल ${f.num(p.units)} नग।`,

  topDebtor: (p, f) => `सबसे ज़्यादा उधार ${p.name} का है: ${f.money(p.amount)}, ${p.count === 1 ? 'एक बिल' : `${f.num(p.count)} बिलों`} पर।`,
  oldestDebtor: (p, f) => `सबसे पुराना उधार ${p.name} का है — ${f.dateY(p.since)} से, यानी ${f.num(p.days)} दिन। उन पर ${f.money(p.amount)} बाकी हैं।`,
  debtList: (p, f) => `${f.num(p.n)} ग्राहकों पर कुल ${f.money(p.total)} उधार है। ${p.top ? `सबसे ज़्यादा: ${f.list(p.top.map((x) => `${x.name} ${f.money(x.amount)}`))}।` : ''}`,
  noDebts: () => 'किसी पर कोई उधार नहीं — सारे बिल चुका दिए गए हैं।',
  balance: (p, f) => `${p.name} पर ${f.money(p.amount)} बाकी हैं, ${p.count === 1 ? 'एक बिल' : `${f.num(p.count)} बिलों`} पर। सबसे पुराना बिल ${f.dateY(p.since)} का है।`,
  balanceZero: (p) => `${p.name} पर कुछ बाकी नहीं — सब चुका दिया है।`,
  balanceNew: (p) => `${p.name} ने अभी तक कुछ नहीं खरीदा।`,

  invoiceRead: (p, f) => `बिल ${p.no}, ${f.dateY(p.date)}, ${p.name} का: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name} ${f.money(l.price)} वाले`))}। कुल ${f.money(p.total)}।`
    + (p.owed > 0 ? ` ${f.money(p.paid)} चुकाए, ${f.money(p.owed)} बाकी हैं।` : ' पूरा चुका दिया है।'),
  invoiceItems: (p, f) => `चीज़ें ये हैं: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name}`))}।`,
  invoiceNone: (p) => `मुझे ${p.name} का कोई बिल नहीं मिला।`,
  invoiceNotFound: (p) => `मुझे बिल ${p.no} नहीं मिला।`,
  invoiceCount: (p, f) => `${p.name} के ${f.num(p.count)} बिल हैं। यह सबसे नया है।`,

  payAskAmount: (p, f) => `${p.name} पर ${f.money(p.owed)} बाकी हैं। उन्होंने कितने दिए?`,
  payConfirm: (p, f) => `${p.name} से ${f.money(p.amount)} ${p.method === 'Cash' ? 'नकद' : p.method === 'Card' ? 'कार्ड से' : 'बैंक ट्रांसफर से'} दर्ज कर दूँ? ` + (p.after > 0 ? `इसके बाद ${f.money(p.after)} बाकी रहेंगे।` : 'इससे उनका सारा उधार खत्म हो जाएगा।'),
  payDone: (p, f) => `हो गया। ${p.name} के ${f.money(p.amount)} दर्ज हो गए।` + (p.after > 0 ? ` अब ${f.money(p.after)} बाकी हैं।` : ' अब उन पर कुछ बाकी नहीं।'),
  payTooMuch: (p, f) => `${p.name} पर सिर्फ़ ${f.money(p.owed)} बाकी हैं। क्या ${f.money(p.owed)} दर्ज कर दूँ?`,
  payNothingOwed: (p) => `${p.name} पर कोई उधार नहीं, इसलिए दर्ज करने को कुछ नहीं।`,
  payWho: () => 'पेमेंट किसने किया?',
  payMethodNote: () => 'अगर नकद नहीं था तो "कार्ड" या "बैंक" कहिए।',

  adjConfirmIn: (p, f) => `${p.loc === 'shop' ? 'दुकान' : 'गोदाम'} में ${f.num(p.qty)} ${p.name} जोड़ दूँ? इसके बाद: दुकान ${f.num(p.shop)}, गोदाम ${f.num(p.wh)}।`,
  adjConfirmOut: (p, f) => `${p.loc === 'shop' ? 'दुकान' : 'गोदाम'} से ${f.num(p.qty)} ${p.name} निकाल दूँ? इसके बाद: दुकान ${f.num(p.shop)}, गोदाम ${f.num(p.wh)}।`,
  moveConfirm: (p, f) => `${f.num(p.qty)} ${p.name} ${p.dir === 'to_shop' ? 'गोदाम से दुकान में' : 'दुकान से गोदाम में'} भेज दूँ? इसके बाद: दुकान ${f.num(p.shop)}, गोदाम ${f.num(p.wh)}।`,
  setConfirm: (p, f) => `${p.loc === 'shop' ? 'दुकान' : 'गोदाम'} में ${p.name} को ${f.num(p.to)} कर दूँ? (अभी ${f.num(p.from)} हैं)`,
  adjDone: (p, f) => `हो गया। अब ${p.name} दुकान में ${f.num(p.shop)} और गोदाम में ${f.num(p.wh)} हैं।`,
  notEnough: (p, f) => `${p.loc === 'shop' ? 'दुकान' : 'गोदाम'} में सिर्फ़ ${f.num(p.have)} ${p.name} हैं।`,
  askQty: (p) => `कितने ${p.name}?`,
  askWhere: () => 'दुकान में या गोदाम में?',
  stockOrSale: (p, f) => `${f.num(p.qty)} ${p.name} स्टॉक में जोड़ूँ, या इनके साथ नई सेल शुरू करूँ?`,
  optStock: () => 'स्टॉक में जोड़ो', optSale: () => 'सेल शुरू करो',
  locNote: (p) => `मैंने ${p.loc === 'shop' ? 'दुकान' : 'गोदाम'} समझा है — बदलना हो तो "${p.loc === 'shop' ? 'गोदाम' : 'दुकान'}" कहिए।`,
  flagConfirm: (p) => `${p.name} पर "खत्म" का निशान लगा दूँ?`,
  unflagConfirm: (p) => `${p.name} से "खत्म" का निशान हटा दूँ?`,
  flagDone: (p) => `हो गया। ${p.name} ${p.on ? 'पर खत्म का निशान लग गया' : 'से निशान हट गया'}।`,
  sameAlready: (p, f) => `${p.name} पहले से ${f.num(p.qty)} हैं — बदलने की ज़रूरत नहीं।`,

  posOpened: () => 'लाइव सेल्स काउंटर खुल गया है। चीज़ें और गिनती बताइए — जैसे "2 चार्जर और एक मोबाइल केस"।',
  posAlready: () => 'काउंटर पहले से खुला है। चीज़ें बताइए।',
  posAdded: (p, f) => `जोड़ दिए: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name}${l.price != null ? ` ${f.money(l.price)} वाले` : ''}`))}। अब कुल ${f.money(p.total)} है।`,
  posLimited: (p, f) => `दुकान में सिर्फ़ ${f.num(p.avail)} ${p.name} बचे हैं, इसलिए ${f.num(p.avail)} डाले।`,
  posNoStock: (p) => `${p.name} दुकान में खत्म है।`,
  posPrice: (p, f) => `अब ${p.name} ${f.money(p.price)} प्रति नग है। कुल ${f.money(p.total)}।`,
  posQty: (p, f) => `अब ${p.name} ${f.num(p.qty)} हैं। कुल ${f.money(p.total)}।`,
  posRemoved: (p, f) => `${p.name} निकाल दिया। कुल ${f.money(p.total)}।`,
  posNotInSheet: (p) => `${p.name} सेल्स शीट पर नहीं है।`,
  posRead: (p, f) => `शीट पर: ${f.list(p.lines.map((l) => `${f.num(l.qty)} ${l.name} ${f.money(l.price)} वाले`))}। कुल ${f.money(p.total)}।`,
  posEmpty: () => 'सेल्स शीट खाली है। बताइए ग्राहक क्या ले रहा है।',
  posClearQ: () => 'सेल्स शीट से सब कुछ हटा दूँ?',
  posCleared: () => 'सेल्स शीट साफ़ हो गई।',
  posUndone: (p) => `वापस ले लिया — ${p.name} हटा दिया।`,
  posNothingUndo: () => 'वापस लेने को कुछ नहीं।',
  posAskCustomer: (p, f) => `${f.num(p.n)} चीज़ें, कुल ${f.money(p.total)}। ग्राहक कौन है? नाम बताइए, या "प्राइवेट" कहिए।`,
  posCustomer: (p) => (p.mode === 'private' ? 'प्राइवेट ग्राहक।' : p.mode === 'new' ? `नया ग्राहक ${p.name} — अगली बार के लिए सेव कर लूँगा।` : `${p.name}।`),
  posAskPay: () => 'उन्होंने कितने दिए? "पूरे", कोई रकम, या उधार हो तो "कुछ नहीं" कहिए।',
  posConfirm: (p, f) => `${p.name} की सेल दर्ज कर दूँ: कुल ${f.money(p.total)}, ` + (p.paid >= p.total ? `पूरे चुकाए ${p.method === 'Cash' ? 'नकद' : p.method === 'Card' ? 'कार्ड से' : 'बैंक से'}?` : p.paid > 0 ? `${f.money(p.paid)} ${p.method === 'Cash' ? 'नकद' : p.method === 'Card' ? 'कार्ड से' : 'बैंक से'} चुकाए और ${f.money(p.total - p.paid)} उधार?` : `पूरे ${f.money(p.total)} उधार पर?`),
  posRecorded: (p, f) => `सेल दर्ज हो गई। बिल ${p.no} डाउनलोड हो गया है।` + (p.owed > 0 ? ` ${f.money(p.owed)} "पूरा भुगतान नहीं" में चला गया।` : ''),
  posPrivateCredit: () => 'ध्यान दें: प्राइवेट ग्राहक पर उधार है — पता नहीं चलेगा किस पर है। नाम बता दीजिए, या "हाँ" कहकर आगे बढ़िए।',
  posNotOpen: () => 'सेल्स काउंटर खुला नहीं है। नई सेल शुरू करूँ?',
  posBackToSale: () => 'चलिए सेल जारी रखते हैं।',
  posClosed: () => 'सेल्स काउंटर बंद कर दिया।',
  posNewSale: () => 'अगली सेल के लिए तैयार। ग्राहक क्या ले रहा है?',

  reportDone: (p, f) => `${f.range(p.r)} की सेल रिपोर्ट डाउनलोड हो गई: ${f.money(p.total)}, ${f.num(p.count)} पेमेंट से।`,
  invoicePdf: (p) => `बिल ${p.no} डाउनलोड हो गया।`,
  invReport: () => 'स्टॉक रिपोर्ट की PDF डाउनलोड हो गई।',
  brandStock: (p, f) => `${p.name} की ${f.num(p.kinds)} चीज़ें हैं: दुकान में ${f.num(p.shop)} और गोदाम में ${f.num(p.wh)}।${p.low ? ` ${f.num(p.low)} पर ध्यान देने की ज़रूरत है।` : ''}`,
  nav: (p) => `${p.where} खोल रहा हूँ।`,
  where: { dashboard: 'डैशबोर्ड', invoices: 'बिल', unpaid: 'पूरा भुगतान नहीं', tracker: 'सेल्स ट्रैकर' },

  whichItem: (p, f) => `कौन सा: ${f.list(p.names)}?`,
  whichCustomer: (p, f) => `कौन सा ग्राहक: ${f.list(p.names)}?`,
  pickAgain: () => 'माफ़ कीजिए, कौन सा? नाम बताइए, या "पहला वाला" कहिए।',
  maybeItem: (p) => `क्या आपका मतलब ${p.name} है?`,
  maybeCustomer: (p) => `क्या आपका मतलब ${p.name} है?`,
  noItem: (p) => `मुझे "${p.q}" नाम की कोई चीज़ नहीं मिली।`,
  noItemAny: () => 'मैं समझ नहीं पाया कौन सी चीज़। कृपया उसका नाम बताइए।',
  noCustomer: (p) => `मुझे "${p.q}" नाम का कोई ग्राहक नहीं मिला।`,
  learnt: () => 'समझ गया — आगे से याद रखूँगा।',
  taught: (p) => `समझ गया। जब आप "${p.phrase}" कहेंगे तो मैं समझूँगा कि आपका मतलब ${p.name} है।`,
  teachHow: () => 'आप मुझे अपने शब्द सिखा सकते हैं। कहिए: "जब मैं काला चार्जर कहूँ तो मतलब Samsung 25W Fast Charger"।',

  intents: {
    sales: 'आज की सेल', summary: 'आज का सारांश', stock: 'स्टॉक चेक', low: 'कम स्टॉक', debts: 'उधार वाले ग्राहक',
    balance: 'ग्राहक का बैलेंस', invoice: 'ग्राहक का बिल', payment: 'पेमेंट दर्ज करना', adjust: 'स्टॉक बदलना',
    pos: 'नई सेल', report: 'सेल रिपोर्ट', help: 'मैं क्या कर सकता हूँ',
  },
  ui: {
    title: 'एआई शॉप असिस्टेंट', listening: 'सुन रहा हूँ…', paused: 'माइक रुका है', thinking: 'सोच रहा हूँ…', speaking: 'बोल रहा हूँ…', ready: 'तैयार',
    typeHere: 'लिखिए या माइक दबाइए…', send: 'भेजें', yes: 'हाँ', no: 'नहीं', cancel: 'रद्द', language: 'भाषा',
    voiceOn: 'आवाज़ चालू', voiceOff: 'आवाज़ बंद', micOn: 'सुनना रोकने के लिए टैप करें', micOff: 'बात करने के लिए टैप करें', close: 'बंद करें',
    downloading: 'डाउनलोड हो रहा है', ready2: 'तैयार', voiceMissing: 'इस डिवाइस पर हिंदी आवाज़ इंस्टॉल नहीं — जवाब सिर्फ़ स्क्रीन पर होंगे। फ़ोन की Text-to-speech सेटिंग में हिंदी आवाज़ इंस्टॉल कर सकते हैं।',
    noMic: 'इस ब्राउज़र में आवाज़ से बात की सुविधा नहीं। आप लिख सकते हैं। (Chrome, Edge या Safari में बोल सकते हैं।)',
    micBlocked: 'माइक की अनुमति बंद है। ब्राउज़र की सेटिंग में इस साइट को माइक की अनुमति दीजिए, फिर माइक दबाइए।',
    shop: 'दुकान', warehouse: 'गोदाम', total: 'कुल', paid: 'चुकाया', owed: 'बाकी', qty: 'गिनती', price: 'कीमत', amount: 'रकम',
    payments: 'पेमेंट', invoices: 'बिल', units: 'नग', since: 'से', days: 'दिन', download: 'PDF डाउनलोड', open: 'खोलें',
    suggestions: ['आज की सेल', 'आज का सारांश', 'सबसे ज़्यादा उधार किसका है?', 'क्या कम है?', 'नई सेल शुरू करो', 'तुम क्या कर सकते हो?'],
    posSuggestions: ['ऑर्डर पढ़कर सुनाओ', 'बस इतना ही', 'वापस लो', 'शीट साफ़ करो'],
    tagline: 'सेल, स्टॉक, ग्राहक — कुछ भी पूछिए, या काउंटर मुझे चलाने दीजिए।',
    poweredBy: 'बिल्ट-इन असिस्टेंट · किसी अतिरिक्त एआई सेवा की ज़रूरत नहीं',
    heard: 'सुना',
    ignored: 'लगा यह बात मेरे लिए नहीं थी, इसलिए मैं चुप रहा।',
  },
};

export const PACKS = { en, ur, hi };
