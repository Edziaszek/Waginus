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
    profile: null,   // własny profil z bazy: { Rola, Wzrost, RokUrodzenia, Plec, ... } – wczytywany po zalogowaniu
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
    async run(op, rollback, btn) {
      try {
        App.status('Zapisywanie…', 'busy');
        const res = await op();
        App.status('Zapisano w Firebase', 'ok');
        App.flash(btn);
        return res;
      } catch (e) {
        console.error(e);
        App.status('Błąd zapisu – zmiana została cofnięta', 'err', e?.message || String(e));
        rollback?.();
        App.invalidate();
      }
    },

    // Potwierdzenie na przycisku: „✓ Dodano” na 5 s, potem powrót do pierwotnego tekstu.
    // Ponowne wywołanie w trakcie odlicza 5 s od nowa (pierwotny tekst zapamiętywany jest tylko raz).
    flash(btn, text = 'Dodano') {
      if (!btn) return;
      text = btn.dataset.done || text;   // data-done="Zapisano" zmienia tekst potwierdzenia
      if (btn._flashTimer) clearTimeout(btn._flashTimer); else btn.dataset.label = btn.textContent;
      btn.textContent = '✓ ' + text;
      btn.classList.add('done');
      btn._flashTimer = setTimeout(() => {
        btn.textContent = btn.dataset.label;
        btn.classList.remove('done');
        btn._flashTimer = null;
      }, 5000);
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
      const h = App.profile?.Wzrost;
      return h > 0 ? h : null;
    },
    // Uwaga: to tylko wygoda interfejsu. Prawdziwego egzekwowania uprawnień pilnują reguły bazy (firestore.rules).
    isAdmin() {
      return App.profile?.Rola === 'admin' && (App.profile.Status ?? 'aktywny') === 'aktywny';
    },

    async logout() {
      try { await window.firebaseAuth.logout(); } catch (e) { console.error(e); }
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

  // Profil użytkownika (profiles/{uid}). Pierwsze logowanie tworzy go automatycznie.
  async function loadProfile() {
    const fb = App.db, u = window.firebaseAuth.user;
    let p = await fb.getProfile(u.uid);
    if (!p) {
      const base = { Email: u.email, Status: 'aktywny', Wzrost: null, RokUrodzenia: null, Plec: '', Utworzono: Date.now() };
      const old = parseFloat(localStorage.getItem('settings_height_' + u.uid));   // wzrost zapisany lokalnie przed wprowadzeniem profili
      if (old >= 100 && old <= 250) base.Wzrost = old;
      // Rolę administratora przyznają WYŁĄCZNIE reguły bazy (lista kont założycielskich).
      // Klient tylko próbuje; jeśli reguły odmówią, zakłada zwykłe konto.
      try { p = await fb.createProfile(u.uid, { ...base, Rola: 'admin' }); }
      catch { p = await fb.createProfile(u.uid, { ...base, Rola: 'user' }); }
    }
    App.profile = p;
  }

  async function boot() {
    syncThemeIcon();
    try {
      await firebaseReady();
      await Auth.gate();   // ekran logowania/rejestracji – wraca po zalogowaniu z potwierdzonym e-mailem
    } catch (e) {
      console.error(e);
      Auth.fatal('Nie udało się załadować Firebase. Sprawdź połączenie z internetem i odśwież stronę.');
      return;
    }
    try { await loadProfile(); }
    catch (e) {
      console.error(e);
      Auth.fatal('Nie udało się wczytać profilu użytkownika. Sprawdź połączenie oraz czy reguły bazy zostały opublikowane.');
      return;
    }
    if (App.profile.Status === 'usuniety') {   // konto usunięte przez administratora
      await window.firebaseAuth.logout();
      Auth.fatal('To konto zostało usunięte przez administratora.');
      return;
    }
    window.firebaseAuth.onChange(u => { if (!u) location.reload(); });   // wylogowanie (także w innej karcie) czyści widok
    await loadTabs();
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

  boot();
})();
