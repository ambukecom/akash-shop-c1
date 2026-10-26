/* =====================================================================
   AI Shop Assistant · panel, voice and hands-free listening
===================================================================== */
import { createBrain } from './assistant-brain.js';
import { LANGS, PACKS } from './assistant-lang.js';

const LANG_KEY = 'c1-ai-lang';
const MUTE_KEY = 'c1-ai-muted';
const MIC_KEY = 'c1-ai-mic';
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const SVG = {
  spark: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  vol: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 5M22 9l-5 5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  min: '<path d="M6 12h12"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[n]}</svg>`;

export function initAssistant(app) {
  let lang = LANGS[store.get(LANG_KEY, 'en')] ? store.get(LANG_KEY, 'en') : 'en';
  let muted = store.get(MUTE_KEY, '0') === '1';
  let wantListen = store.get(MIC_KEY, '1') !== '0';   // voice-activated by default
  let isOpen = false, greeted = false, busy = false;
  let rec = null, recOn = false, speaking = false, restartTimer = null, lastHeard = '';
  let voices = [];

  /* ---------------- brain ---------------- */
  const brain = createBrain({
    ...app,
    lang: () => lang,
    setLang: (l) => setLang(l, false),
    setMuted: (m) => setMuted(m),
    stopSpeaking: () => stopSpeech(),
  });
  const ui = (k) => brain.ui(k);

  /* ---------------- DOM ---------------- */
  const fab = document.createElement('button');
  fab.className = 'ai-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'AI Shop Assistant');
  fab.innerHTML = `<span class="ai-fab-orb"><i></i>${ico('spark')}</span><span class="ai-fab-label"><strong>AI Assistant</strong><small>Tap to talk</small></span>`;
  document.body.append(fab);
  document.body.classList.add('has-ai');

  const panel = document.createElement('section');
  panel.className = 'ai-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI Shop Assistant');
  panel.innerHTML = `
    <header class="ai-head">
      <div class="ai-orb" aria-hidden="true"><i></i><i></i><i></i><span>${ico('spark')}</span></div>
      <div class="ai-id"><strong id="ai-title"></strong><small id="ai-status"></small></div>
      <div class="ai-head-act">
        <button type="button" class="ai-hbtn ai-lang-btn" data-ai="lang" aria-haspopup="menu">${ico('globe')}<span id="ai-lang-short"></span></button>
        <button type="button" class="ai-hbtn" data-ai="voice" id="ai-voice"></button>
        <button type="button" class="ai-hbtn ai-only-docked" data-ai="expand" title="Expand">${ico('spark')}</button>
        <button type="button" class="ai-hbtn" data-ai="close" id="ai-close">${ico('x')}</button>
      </div>
    </header>
    <div class="ai-langs" id="ai-langs" role="menu" hidden></div>
    <div class="ai-log" id="ai-log" aria-live="polite"></div>
    <div class="ai-foot">
      <div class="ai-heard" id="ai-heard" hidden></div>
      <div class="ai-chips" id="ai-chips"></div>
      <form class="ai-input" id="ai-form" autocomplete="off">
        <button type="button" class="ai-mic" data-ai="mic" id="ai-mic"><span class="ai-wave"><i></i><i></i><i></i><i></i><i></i></span>${ico('mic')}</button>
        <input id="ai-text" type="text" enterkeyhint="send" aria-label="Message">
        <button type="submit" class="ai-send" aria-label="Send">${ico('send')}</button>
      </form>
      <p class="ai-note" id="ai-note" hidden></p>
    </div>`;
  document.body.append(panel);
  const $ = (s) => panel.querySelector(s);
  const log = $('#ai-log');

  /* ---------------- state + labels ---------------- */
  function setState(s) {
    panel.dataset.state = s;
    fab.dataset.state = s;
    const label = { listening: ui('listening'), thinking: ui('thinking'), speaking: ui('speaking'), paused: SR ? ui('paused') : ui('ready'), idle: ui('ready') }[s] || ui('ready');
    $('#ai-status').textContent = label;
  }
  function ensureFont() {
    // Urdu reads best in Nastaliq — fetched only when Urdu is chosen
    if (lang !== 'ur' || document.getElementById('ai-urdu-font')) return;
    const l = document.createElement('link');
    l.id = 'ai-urdu-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&display=swap';
    document.head.append(l);
  }
  function refreshLabels() {
    const L = LANGS[lang];
    ensureFont();
    panel.dir = L.dir;
    panel.lang = lang;
    $('#ai-title').textContent = ui('title');
    $('#ai-lang-short').textContent = L.short;
    $('#ai-text').placeholder = ui('typeHere');
    $('#ai-close').title = ui('close');
    $('#ai-voice').innerHTML = ico(muted ? 'mute' : 'vol');
    $('#ai-voice').title = muted ? ui('voiceOff') : ui('voiceOn');
    $('#ai-voice').setAttribute('aria-pressed', String(!muted));
    $('#ai-mic').title = wantListen ? ui('micOn') : ui('micOff');
    $('#ai-mic').classList.toggle('on', wantListen && !!SR);
    fab.querySelector('.ai-fab-label strong').textContent = ui('title');
    fab.querySelector('.ai-fab-label small').textContent = ui('tagline').split(/[—–-]/)[0].trim().slice(0, 40);
    if (!panel.dataset.state) setState('idle');
    else setState(panel.dataset.state);
  }

  /* ---------------- conversation log ---------------- */
  function addUser(text) {
    const el = document.createElement('div');
    el.className = 'ai-msg me';
    el.dir = 'auto';
    el.textContent = text;
    log.append(el);
    scroll();
  }
  function addBot(rep) {
    if (!rep || !rep.lines?.length) return;
    // previous yes/no and choice buttons are no longer live
    log.querySelectorAll('.ai-ask').forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = 'ai-msg bot';
    el.dir = LANGS[lang].dir;
    const body = document.createElement('div');
    body.className = 'ai-text';
    rep.lines.forEach((l) => {
      const p = document.createElement('p');
      p.textContent = l.text;
      body.append(p);
    });
    el.append(body);
    if (rep.card) {
      const c = document.createElement('div');
      c.className = 'ai-card-wrap';
      c.innerHTML = rep.card;   // built from escaped values in the brain
      el.append(c);
    }
    if (rep.confirm || rep.choices) {
      const a = document.createElement('div');
      a.className = 'ai-ask';
      if (rep.choices) a.innerHTML = rep.choices.map((c, i) => `<button type="button" class="ai-choice" data-ai="choice" data-v="${c.value}"><b>${i + 1}</b>${esc(c.label)}</button>`).join('');
      if (rep.confirm) a.innerHTML += `<button type="button" class="ai-yes" data-ai="yes">${ico('check')}${esc(ui('yes'))}</button><button type="button" class="ai-no" data-ai="no">${esc(ui('no'))}</button>`;
      el.append(a);
    }
    log.append(el);
    setChips(rep.chips || (rep.confirm || rep.choices ? [] : null));
    scroll();
  }
  function scroll() { requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
  function setChips(list) {
    const box = $('#ai-chips');
    const items = list ?? (app.pos.isOpen() ? ui('posSuggestions') : ui('suggestions'));
    box.innerHTML = items.map((t) => `<button type="button" class="ai-chip" data-ai="chip">${esc(t)}</button>`).join('');
  }
  function note(text) {
    const n = $('#ai-note');
    n.hidden = !text;
    n.textContent = text || '';
  }

  /* ---------------- speaking ---------------- */
  function loadVoices() {
    try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch { voices = []; }
    return voices;
  }
  function voiceFor(code) {
    const want = LANGS[code]?.speech || code;
    const pre = want.split('-')[0];
    const list = loadVoices();
    return list.find((v) => v.lang === want) || list.find((v) => v.lang?.replace('_', '-').toLowerCase() === want.toLowerCase())
      || list.find((v) => v.lang?.toLowerCase().startsWith(pre + '-') || v.lang?.toLowerCase() === pre) || null;
  }
  /** which voice + which text to use for the current language */
  function speechPlan() {
    const v = voiceFor(lang);
    if (v) return { voice: v, langCode: v.lang, useAlt: false };
    if (lang === 'ur') { const h = voiceFor('hi'); if (h) return { voice: h, langCode: h.lang, useAlt: true }; }
    return null;
  }
  function stopSpeech() {
    try { window.speechSynthesis?.cancel(); } catch { /* */ }
    speaking = false;
  }
  function speak(rep) {
    return new Promise((resolve) => {
      if (muted || !window.speechSynthesis || !rep?.lines?.length) return resolve();
      const plan = speechPlan();
      if (!plan) return resolve();
      const text = rep.lines.map((l) => (plan.useAlt && l.alt ? l.alt : l.say)).join(' ');
      // Chrome cuts long utterances short — speak sentence by sentence
      const parts = text.match(/[^.!?।۔؟]+[.!?।۔؟]*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
      stopListening(true);
      stopSpeech();
      speaking = true;
      setState('speaking');
      let i = 0;
      const next = () => {
        if (!speaking || i >= parts.length) { speaking = false; resolve(); return; }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        u.voice = plan.voice;
        u.lang = plan.langCode;
        u.rate = lang === 'en' ? 1.03 : 0.98;
        u.onend = next;
        u.onerror = next;
        try { speechSynthesis.speak(u); } catch { speaking = false; resolve(); }
      };
      next();
      // safety net: never stay "speaking" forever
      setTimeout(() => { if (speaking) { speaking = false; resolve(); } }, 6000 + text.length * 90);
    });
  }

  /* ---------------- listening (hands-free, patient) ---------------- */
  function startListening() {
    clearTimeout(restartTimer);
    if (!SR || !wantListen || !isOpen || speaking || busy || recOn || document.hidden) return;
    try {
      const r = new SR();
      rec = r;
      r.lang = LANGS[lang].listen;
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 4;
      // every handler checks it still belongs to the live recogniser (old ones can fire late)
      r.onstart = () => { if (rec !== r) return; recOn = true; setState('listening'); };
      r.onresult = (e) => {
        if (rec !== r) return;
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const x = e.results[i];
          if (x.isFinal) {
            const alts = [...x].map((y) => y.transcript.trim()).filter(Boolean);
            if (alts.length) { showHeard(''); heard(alts); return; }
          } else interim += x[0].transcript;
        }
        showHeard(interim);
      };
      r.onerror = (e) => {
        if (rec !== r) return;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          wantListen = false; store.set(MIC_KEY, '0'); note(ui('micBlocked')); refreshLabels();
        } else if (e.error === 'language-not-supported') {
          note(ui('noMic'));
        }
      };
      r.onend = () => {
        if (rec !== r) return;
        recOn = false; rec = null;
        if (wantListen && isOpen && !speaking && !busy) restartTimer = setTimeout(startListening, 300);   // keep waiting patiently
        else if (!speaking && !busy) setState(wantListen ? 'listening' : 'paused');
      };
      recOn = true;
      r.start();
    } catch {
      recOn = false; rec = null;
      restartTimer = setTimeout(startListening, 1200);
    }
  }
  function stopListening(temporary = false) {
    clearTimeout(restartTimer);
    const r = rec;
    rec = null; recOn = false;
    if (r) { try { r.abort(); } catch { /* */ } }
    if (!temporary) setState('paused');
  }
  function showHeard(t) {
    const h = $('#ai-heard');
    h.hidden = !t;
    h.textContent = t;
  }
  function heard(alts) {
    // pick the reading the brain understands best (speech engines often offer several)
    let pick = alts[0];
    if (!brain.pending) {
      for (const t of alts) { const u = brain._understand(t).intent; if (u && u !== 'unknown') { pick = t; break; } }
    }
    if (pick === lastHeard && Date.now() - (heard.at || 0) < 1500) return;
    lastHeard = pick; heard.at = Date.now();
    send(pick, true);
  }

  /* ---------------- sending ---------------- */
  async function send(text, viaVoice = false) {
    text = String(text || '').trim();
    if (!text || busy) return;
    addUser(text);
    const bubble = log.lastElementChild;
    busy = true;
    stopListening(true);
    setState('thinking');
    let rep = null;
    try { rep = await brain.handle(text, { voice: viaVoice }); } catch (e) { console.error(e); rep = { lines: [{ text: PACKS[lang].sorry(), say: PACKS[lang].sorry() }] }; }
    busy = false;
    if (rep?.quiet) { bubble.classList.add('ignored'); bubble.title = ui('ignored'); }
    else if (rep) { addBot(rep); await speak(rep); }
    afterTurn();
  }
  async function answerButton(kind, value) {
    if (busy) return;
    busy = true;
    stopListening(true);
    const label = kind === 'yes' ? ui('yes') : kind === 'no' ? ui('no') : null;
    if (label) addUser(label);
    setState('thinking');
    let rep = null;
    try { rep = await brain.answer(kind, value); } catch (e) { console.error(e); }
    busy = false;
    if (rep) { addBot(rep); await speak(rep); }
    afterTurn();
  }
  function afterTurn() {
    if (!isOpen) return;
    if (wantListen && SR) startListening(); else setState('paused');
  }

  /* ---------------- open / close / dock ---------------- */
  async function open(prompt) {
    if (isOpen) { if (prompt) send(prompt); return; }
    isOpen = true;
    document.body.classList.add('ai-open');
    panel.hidden = false;
    fab.classList.add('hide');
    dock();
    requestAnimationFrame(() => panel.classList.add('in'));
    refreshLabels();
    if (!SR) note(ui('noMic'));
    if (!greeted) {
      greeted = true;
      const g = brain.greet();
      addBot(g);
      await speak(g);
    } else setChips(null);
    afterTurn();
    if (!SR || !wantListen) $('#ai-text').focus({ preventScroll: true });
  }
  function close() {
    isOpen = false;
    document.body.classList.remove('ai-open');
    stopListening(true);
    stopSpeech();
    panel.classList.remove('in');
    setTimeout(() => { if (!isOpen) panel.hidden = true; }, 180);
    fab.classList.remove('hide');
    setState('idle');
  }
  function dock() {
    const pos = app.pos.isOpen();
    panel.classList.toggle('docked', pos && !panel.classList.contains('expanded'));
    panel.classList.toggle('in-pos', pos);
    document.body.classList.toggle('ai-docked', pos);
  }

  /* ---------------- language ---------------- */
  function renderLangs() {
    const box = $('#ai-langs');
    box.innerHTML = Object.values(LANGS).map((L) => {
      const ok = !!voiceFor(L.code) || (L.code === 'ur' && !!voiceFor('hi'));
      return `<button type="button" role="menuitemradio" aria-checked="${L.code === lang}" data-ai="setlang" data-l="${L.code}" class="${L.code === lang ? 'on' : ''}">
        <span class="ai-l-n" lang="${L.code}">${L.native}</span><small>${L.name}</small>
        <em class="${ok ? 'ok' : ''}">${L.code === lang ? ico('check') : ''}${ok ? '' : '—'}</em></button>`;
    }).join('') + `<p class="ai-l-note">${esc(ui('poweredBy'))}</p>`;
  }
  async function setLang(code, announce = true) {
    if (!LANGS[code]) return;
    const changed = code !== lang;
    lang = code;
    store.set(LANG_KEY, code);
    $('#ai-langs').hidden = true;
    // fetch the voice list for the new language (some browsers load voices lazily)
    refreshLabels();
    if (changed) {
      setState('thinking');
      $('#ai-status').textContent = `${ui('downloading')} · ${LANGS[code].native}`;
      await waitVoices();
    }
    refreshLabels();
    const plan = speechPlan();
    note(!plan && window.speechSynthesis ? ui('voiceMissing') : (!SR ? ui('noMic') : ''));
    if (plan && plan.useAlt && lang === 'ur') note(ui('voiceMissing'));
    if (recOn) { stopListening(true); afterTurn(); }
    if (announce) {
      const rep = { lines: [{ text: PACKS[code].langSet(), say: PACKS[code].langSet(), alt: PACKS.hi.langSet() }] };
      addBot(rep);
      setChips(null);
      await speak(rep);
      afterTurn();
    }
  }
  function waitVoices() {
    return new Promise((res) => {
      if (!window.speechSynthesis) return res();
      if (loadVoices().length) return setTimeout(res, 350);
      const done = () => { speechSynthesis.removeEventListener?.('voiceschanged', done); res(); };
      speechSynthesis.addEventListener?.('voiceschanged', done);
      setTimeout(done, 1500);
    });
  }
  function setMuted(m) {
    muted = !!m;
    store.set(MUTE_KEY, muted ? '1' : '0');
    if (muted) stopSpeech();
    refreshLabels();
  }

  /* ---------------- events ---------------- */
  fab.addEventListener('click', () => open());
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ai], [data-ai-act]');
    if (!b) { if (!e.target.closest('.ai-langs')) $('#ai-langs').hidden = true; return; }
    if (b.dataset.aiAct) {
      const id = b.dataset.id;
      if (b.dataset.aiAct === 'inv-pdf') app.act.invoicePdf(id);
      if (b.dataset.aiAct === 'inv-view') app.act.openInvoice(id);
      return;
    }
    switch (b.dataset.ai) {
      case 'close': close(); break;
      case 'expand': panel.classList.toggle('expanded'); dock(); break;
      case 'voice': setMuted(!muted); break;
      case 'mic':
        wantListen = !wantListen;
        store.set(MIC_KEY, wantListen ? '1' : '0');
        if (!SR) { note(ui('noMic')); wantListen = false; }
        refreshLabels();
        if (wantListen) { stopSpeech(); startListening(); } else stopListening();
        break;
      case 'lang': renderLangs(); $('#ai-langs').hidden = !$('#ai-langs').hidden; break;
      case 'setlang': setLang(b.dataset.l); break;
      case 'chip': send(b.textContent); break;
      case 'yes': answerButton('yes'); break;
      case 'no': answerButton('no'); break;
      case 'choice': {
        addUser(b.textContent.replace(/^\d+/, '').trim());
        busy = true; stopListening(true);
        brain.answer('choice', Number(b.dataset.v)).then(async (rep) => { busy = false; if (rep) { addBot(rep); await speak(rep); } afterTurn(); });
        break;
      }
    }
  });
  $('#ai-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('#ai-text');
    const v = t.value;
    t.value = '';
    send(v);
  });
  $('#ai-text').addEventListener('focus', () => { if (speaking) stopSpeech(); });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!$('#ai-langs').hidden) $('#ai-langs').hidden = true; else close(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(true); else afterTurn(); });
  try { window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices); loadVoices(); } catch { /* */ }

  refreshLabels();
  setState('idle');

  return {
    open, close,
    /** the app tells us when the sales counter opens or closes */
    posChanged() { panel.classList.remove('expanded'); dock(); if (isOpen) setChips(null); },
    destroy() { close(); fab.remove(); panel.remove(); document.body.classList.remove('has-ai', 'ai-docked'); },
    _brain: brain,
    _send: send,
  };
}
