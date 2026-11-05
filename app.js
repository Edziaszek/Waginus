/* Rdzeń aplikacji – tylko to, czego potrzebuje KAŻDA zakładka:
 *  - wspólny magazyn danych (App.data) i helpery (App.util)
 *  - ładowanie plików tab-*.html i rejestracja modułów zakładek
 *  - jednorazowe pobranie danych z Firebase i przekazanie ich do zakładek
 *  - motyw, rozmiar czcionki, PIN, pasek statusu
 *
 * Moduł zakładki rejestruje się przez App.register(nazwa, { collections, parse, init, render }):
 *   collections – kolekcje Firestore, które zakładka potrzebuje (sumę pobiera rdzeń, raz)
 *   parse(raw)  – zamienia surowe dokumenty na dane w App.data
 *   init()      – jednorazowo: nasłuchiwanie zdarzeń, wartości domyślne
 *   render()    – rysowanie; wołane tylko dla aktywnej zakładki i tylko gdy dane się zmieniły
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const pad = n => String(n).padStart(2, '0');
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const util = {
    DAY: 864e5,
    DATE_RE,
    num: v => parseFloat(String(v ?? '').replace(',', '.')),
    // pierwsza zdefiniowana, niepusta wartość spośród kluczy (obsługa starych nazw pól)
    pick(o, ...keys) {
      for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    },
    // data 'YYYY-MM-DD' (lub ISO) -> timestamp lokalnej północy; liczone raz przy parsowaniu
    ts(s) {
      if (!s) return NaN;
      const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
      return y && m && d ? new Date(y, m - 1, d).getTime() : new Date(s).getTime();
    },
    iso(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    fmtDate(s) {
      const t = util.ts(s);
      if (isNaN(t)) return String(s ?? '');
      const d = new Date(t);
      return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    },
    daysAgo(n) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d.getTime(); },
    endOfDay(t) { return new Date(t).setHours(23, 59, 59, 999); },
    byTs: (a, b) => a.ts - b.ts,
    avg: a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN,
    median(a) {
      if (!a.length) return NaN;
      const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },
    f1: (n, unit) => Number.isFinite(n) ? n.toFixed(1) + (unit ? ' ' + unit : '') : '-',
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]),
    css: v => getComputedStyle(root).getPropertyValue(v).trim(),
    group(arr, keyFn) {
      const m = new Map();
      for (const x of arr) { const k = keyFn(x), a = m.get(k); a ? a.push(x) : m.set(k, [x]); }
      return m;
    },
    drop(arr, item) { const i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); },
    reps(n) {
      const c = parseInt(n) || 0, t = Math.abs(c) % 100, o = Math.abs(c) % 10;
      if (c === 1) return '1 powtórzenie';
      return t >= 11 && t <= 14 ? `${c} powtórzeń` : o >= 2 && o <= 4 ? `${c} powtórzenia` : `${c} powtórzeń`;
    }
  };

  const tabs = {};
  const dirty = new Set();
  let conn = { msg: 'Łączenie z Firebase…', kind: 'busy', detail: '', syncedAt: null };
  let active = 'main';
  let fontSize = parseInt(localStorage.getItem('app_font_size')) || 16;

  const App = window.App = {
    util,
    data: { weight: [], exercises: [], workouts: [], cardio: [], cardioTypes: [], body: [], bodyParts: [] },
    get db() { return window.firebaseFunctions; },

    register(name, mod) { tabs[name] = mod; mod.init?.(); },

    // Dane się zmieniły: oznacz wszystkie zakładki jako „do odświeżenia”, narysuj aktywną.
    invalidate() {
      Object.keys(tabs).forEach(n => dirty.add(n));
      renderActive();
    },

    // Stan połączenia: tylko kolorowa kropka w pasku górnym; szczegóły pojawiają się po kliknięciu.
    // kind: 'busy' (żółta, pulsuje) | 'ok' (zielona) | 'err' (czerwona)
    status(msg, kind = 'busy', detail = '') {
      conn = { msg, kind, detail, syncedAt: kind === 'ok' ? Date.now() : conn.syncedAt };
      document.getElementById('statusDot').className = 'dot ' + kind;
      document.getElementById('statusBtn').title = msg;
      if (!document.getElementById('statusPop').hidden) renderStatusPop();
    },

    // Operacja zapisu z obsługą błędu: pokazuje błąd i woła rollback (cofnięcie zmiany optymistycznej).
    async run(op, rollback) {
      try {
        App.status('Zapisywanie…', 'busy');
        const res = await op();
        App.status('Zapisano w Firebase', 'ok');
        return res;
      } catch (e) {
        console.error(e);
        App.status('Błąd zapisu – zmiana została cofnięta', 'err', e?.message || String(e));
        rollback?.();
        App.invalidate();
      }
    },

    async reload() {
      App.status('Pobieranie danych…', 'busy');
      try {
        const names = [...new Set(Object.values(tabs).flatMap(t => t.collections || []))];
        const docs = await Promise.all(names.map(n => App.db.getData(n)));
        const raw = Object.fromEntries(names.map((n, i) => [n, docs[i]]));
        Object.values(tabs).forEach(t => t.parse?.(raw));
        App.status('Połączono z Firebase', 'ok');
        App.invalidate();
      } catch (e) {
        console.error(e);
        App.status('Błąd połączenia z Firebase', 'err', e?.message || String(e));
      }
    },

    switchTab(name) {
      if (name === 'settings' && !pinOk('pin_authenticated', 'PIN do Ustawień:')) { alert('Błędny PIN!'); return; }
      active = name;
      document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      renderActive();
    },

    toggleTheme() {
      const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = t;
      localStorage.setItem('app_theme', t);
      syncThemeIcon();
      App.invalidate(); // wykresy czytają kolory z CSS
    },

    changeFont(delta) {
      fontSize = Math.min(22, Math.max(12, fontSize + delta));
      root.style.setProperty('--font-size-base', fontSize + 'px');
      localStorage.setItem('app_font_size', fontSize);
      App.invalidate();
    },

    getHeight() {
      const h = parseFloat(localStorage.getItem('settings_height'));
      return h > 0 ? h : null;
    },
    setHeight(cm) {
      localStorage.setItem('settings_height', cm);
      App.invalidate();
    },

    logout() {
      sessionStorage.removeItem('app_authenticated');
      sessionStorage.removeItem('pin_authenticated');
      location.reload();
    }
  };

  function renderStatusPop() {
    const esc = App.util.esc, time = conn.syncedAt ? new Date(conn.syncedAt).toLocaleTimeString('pl-PL') : null;
    document.getElementById('statusPop').innerHTML = `
      <div class="status-pop-title"><span class="dot ${conn.kind}"></span><strong>${esc(conn.msg)}</strong></div>
      ${conn.detail ? `<div class="status-pop-detail">${esc(conn.detail)}</div>` : ''}
      ${time ? `<div class="muted status-pop-time">Ostatnia udana operacja: ${time}</div>` : ''}
      <button class="btn-secondary full" data-reload>Odśwież dane z Firebase</button>`;
  }
  function toggleStatusPop() {
    const pop = document.getElementById('statusPop');
    pop.hidden = !pop.hidden;
    if (!pop.hidden) renderStatusPop();
  }
  function closeStatusPop() { document.getElementById('statusPop').hidden = true; }

  function renderActive() {
    if (!dirty.has(active) || !tabs[active]) return;
    dirty.delete(active);
    try { tabs[active].render(); } catch (e) { console.error(`Błąd renderowania zakładki "${active}"`, e); }
  }

  function syncThemeIcon() {
    document.getElementById('themeIcon').textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙';
  }

  function pinOk(sessionKey, question) {
    if (sessionStorage.getItem(sessionKey) === 'true') return true;
    if (prompt(question) !== (localStorage.getItem('settings_pin') || '1234')) return false;
    sessionStorage.setItem(sessionKey, 'true');
    return true;
  }

  // Pobiera tab-<nazwa>.html, wstawia HTML do sekcji i uruchamia skrypty w kolejności zakładek.
  async function loadTabs() {
    const names = [...document.querySelectorAll('.nav-item')].map(b => b.dataset.tab);
    const app = document.getElementById('app');
    const html = await Promise.all(names.map(n =>
      fetch(`tab-${n}.html`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .catch(e => { console.error(`Nie załadowano zakładki ${n}`, e); return null; })));

    names.forEach((n, i) => {
      const el = document.createElement('section');
      el.id = `tab-${n}`;
      el.className = 'tab-content' + (n === active ? ' active' : '');
      app.append(el);
      if (html[i] === null) { el.textContent = 'Nie udało się załadować zakładki.'; return; }

      const tpl = document.createElement('template');
      tpl.innerHTML = html[i];
      const scripts = [...tpl.content.querySelectorAll('script')].map(s => { s.remove(); return s.textContent; });
      el.append(tpl.content);
      scripts.forEach(code => {
        const s = document.createElement('script');
        s.textContent = code;
        el.append(s);
        s.remove();
      });
    });
  }

  const firebaseReady = () => window.firebaseFunctions ? Promise.resolve() : new Promise((res, rej) => {
    addEventListener('firebase-ready', res, { once: true });
    setTimeout(() => rej(new Error('Timeout ładowania Firebase')), 15000);
  });

  async function boot() {
    if (!pinOk('app_authenticated', 'Wprowadź PIN dostępowy:')) {
      document.body.innerHTML = '<div class="denied"><h2>⛔ Brak dostępu</h2><p>Wprowadzono nieprawidłowy PIN.</p></div>';
      return;
    }
    syncThemeIcon();
    try { await Promise.all([loadTabs(), firebaseReady()]); }
    catch (e) { console.error(e); App.status('Nie udało się załadować Firebase', 'err', e?.message || String(e)); return; }
    await App.reload();
  }

  // Nawigacja i górny pasek – jedna delegacja zdarzeń zamiast inline onclick
  document.addEventListener('click', e => {
    const t = e.target;
    const nav = t.closest('.nav-item');
    if (nav) return App.switchTab(nav.dataset.tab);
    const f = t.closest('[data-font]');
    if (f) return App.changeFont(+f.dataset.font);
    if (t.closest('#themeBtn')) return App.toggleTheme();
    if (t.closest('#statusBtn')) return toggleStatusPop();
    if (t.closest('[data-reload]')) { closeStatusPop(); return App.reload(); }
    if (!t.closest('#statusPop')) closeStatusPop(); // klik poza okienkiem je zamyka
  });

  // Przerysuj wykresy po zmianie szerokości (obrót ekranu, zmiana okna)
  let lastW = innerWidth, timer;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; App.invalidate(); } }, 150);
  });

  App.pinSave = pin => localStorage.setItem('settings_pin', pin);
  boot();
})();
