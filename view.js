/* Widok profilu publicznego: teksty odmieniane przez płeć, zakładki na dolnej belce, manekin, historia treningów.
 * Kod wyłącznie profilu publicznego. Wspólne rzeczy (manekin SVG, style) pochodzą z ../shared.js i ../style.css.
 * Dane wejściowe to dokumenty udostępnione przez właściciela (patrz share-panel.html: build()). */
(() => {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = ts => { const d = new Date(ts); return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`; };
  const kg = n => Number(n).toFixed(1) + ' kg';
  const repsText = n => {
    const c = parseInt(n) || 0, t = Math.abs(c) % 100, o = Math.abs(c) % 10;
    if (c === 1) return '1 powtórzenie';
    return t >= 11 && t <= 14 ? `${c} powtórzeń` : o >= 2 && o <= 4 ? `${c} powtórzenia` : `${c} powtórzeń`;
  };

  // ---------- teksty odmieniane przez płeć: M (mężczyzna), K (kobieta), N (neutralna: inna / nie podano) ----------
  const gender = plec => plec === 'M' ? 'M' : plec === 'K' ? 'K' : 'N';
  const TX = {
    title: { M: 'Profil użytkownika', K: 'Profil użytkowniczki', N: 'Profil' },
    navWeight: 'Waga', navBody: 'Obwody', navTraining: 'Mięśnie',
    nothing: 'Ten profil nie udostępnia jeszcze żadnych danych.',
    noData: 'Brak udostępnionych danych w tej zakładce.',
    weightHead: { M: 'Jego waga', K: 'Jej waga', N: 'Waga' },
    cur: 'Aktualna waga (średnia z 7 dni)',
    max: 'Najwyższa waga w bazie',
    lost: { M: 'Aktualnie schudł', K: 'Aktualnie schudła', N: 'Aktualnie schudł(a)' },
    state: 'Stan',
    inNorm: 'Mieści się w normie.',
    bodyHead: { M: 'Jego obwody ciała', K: 'Jej obwody ciała', N: 'Obwody ciała' },
    last: 'Ostatni', hi: 'Najwyższy', diff: 'Różnica',
    showHist: 'Pokaż historię i wykres', hideHist: 'Ukryj historię',
    noMeas: { M: 'Nie dodał jeszcze pomiarów.', K: 'Nie dodała jeszcze pomiarów.', N: 'Brak pomiarów.' },
    trainHead: { M: 'Jego mięśnie i treningi', K: 'Jej mięśnie i treningi', N: 'Mięśnie i treningi' },
    dayTitle: 'Trening z dnia',
    didToday: { M: 'Tego dnia trenował:', K: 'Tego dnia trenowała:', N: 'W tym dniu trenowano:' },
    hint: 'Dotknij mięśnia, aby zobaczyć, które ćwiczenia go angażowały, albo ćwiczenia powyżej, aby zobaczyć tylko ich mięśnie.',
    mainLbl: 'Główny', auxLbl: 'Pomocniczy',
    notTrained: { M: 'Nie trenował tego mięśnia w tym dniu.', K: 'Nie trenowała tego mięśnia w tym dniu.', N: 'Ten mięsień nie był trenowany w tym dniu.' },
    noTrain: { M: 'Nie dodał jeszcze żadnego treningu.', K: 'Nie dodała jeszcze żadnego treningu.', N: 'Brak dodanych treningów.' },
    histHead: { M: 'Jego historia treningów', K: 'Jej historia treningów', N: 'Historia treningów' },
    more: 'Pokaż więcej',
    recHead: { M: 'Jego rekordy', K: 'Jej rekordy', N: 'Rekordy' },
    lastLbl: 'Ostatnio', recLbl: 'Rekord',
    updated: 'Ostatnia aktualizacja danych:'
  };
  const tx = (g, k) => { const v = TX[k]; return typeof v === 'string' ? v : v[g]; };

  const ICON = {
    weight: '<path d="M20.4 9A9 9 0 1 0 3.6 9L2 13h20l-1.6-4zM12 13v4m-4 0h8"/>',
    body: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    training: '<path d="M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M18 7v10M6 7v10"/>'
  };

  // =====================================================================
  //  Budowniczowie HTML (czyste funkcje – nie dotykają DOM)
  // =====================================================================
  function weightHtml(g, d) {
    const t = k => tx(g, k), rows = [];
    const item = (l, v, accent) => `<div class="data-item"><span>${l}</span><strong${accent ? ' class="accent"' : ''}>${v}</strong></div>`;
    if (d) {
      if (d.cur != null) rows.push(item(t('cur'), kg(d.cur)));
      if (d.max != null) rows.push(item(t('max'), kg(d.max)));
      if (d.lost != null) rows.push(item(t('lost'), kg(d.lost), true));
      if (d.bmi != null) rows.push(item('BMI', Number(d.bmi).toFixed(1)));
      if (d.state) rows.push(item(t('state'), esc(d.state), true));
      if (d.bi != null) {   // „Do kolejnego stopnia brakuje…” – kierunek zależy od kategorii BMI
        let hint = '';
        if (d.bi === 0 && d.up) hint = `Do kolejnego stopnia (${esc(d.up.name)}) brakuje ${kg(d.up.kg)}.`;
        else if (d.bi === 1 && d.lo && d.up) hint = `${t('inNorm')} Do niedowagi brakuje ${kg(d.lo.kg)}, a do nadwagi ${kg(d.up.kg)}.`;
        else if (d.lo) hint = `Do kolejnego stopnia (${esc(d.lo.name)}) brakuje ${kg(d.lo.kg)}.`;
        if (hint) rows.push(`<div class="data-item"><span>${hint}</span></div>`);
      }
    }
    return `<div class="card"><h3>⚖️ ${t('weightHead')}</h3><div class="stack">${rows.join('') || `<div class="muted">${t('noData')}</div>`}</div></div>`;
  }

  function bodyHtml(g, d, open = new Set()) {
    const t = k => tx(g, k), parts = d?.parts || [];
    const cards = parts.map((p, i) => {
      const hist = Array.isArray(p.h), isOpen = hist && open.has(i);
      return `<div class="card part-card">
        <div class="between"><strong>${esc(p.n)}</strong>${hist ? `<button class="btn-secondary" data-part="${i}">${isOpen ? t('hideHist') : t('showHist')}</button>` : ''}</div>
        ${p.last != null
          ? `<div class="part-stats"><span>${t('last')}: <strong>${p.last.toFixed(1)} cm</strong></span><span>${t('hi')}: <strong>${p.max.toFixed(1)} cm</strong></span><span>${t('diff')}: <strong class="accent">${p.diff.toFixed(1)} cm</strong></span></div>`
          : `<div class="muted">${t('noMeas')}</div>`}
        ${isOpen ? `<div class="chart-box"><canvas data-chart="${i}"></canvas></div>
          <div class="history" style="max-height:220px">${[...p.h].reverse().map(([ts, v]) => `<div class="data-item"><span>${fmtDate(ts)}</span><strong>${v.toFixed(1)} cm</strong></div>`).join('')}</div>` : ''}
      </div>`;
    });
    return `<h3 class="pub-head">📏 ${t('bodyHead')}</h3>` + (cards.join('') || `<div class="card muted center">${t('noData')}</div>`);
  }

  function dayDetailHtml(g, day) {
    const t = k => tx(g, k);
    const w = day.w.map(e => `<div class="data-item"><div><strong>${esc(e.e)}</strong><br><small>${e.s.map(([k, r]) => `${k} kg x ${repsText(r)}`).join('<br>')}</small></div><strong>śr. ${Number(e.a).toFixed(1)} kg</strong></div>`).join('');
    const c = day.c.map(e => `<div class="data-item"><div><strong>🏃 ${esc(e.n)}</strong><br><small class="muted">${[e.d && esc(e.d), e.k != null && `${e.k} km`, e.p && `tempo ${esc(e.p)} min/km`, e.h && `tętno ${e.h} bpm`].filter(Boolean).join(' · ')}</small></div></div>`).join('');
    return `<div class="card"><h3>${t('dayTitle')} ${fmtDate(day.t)}</h3><div class="muted" style="margin-bottom:6px">${t('didToday')}</div><div class="stack">${w}${c}</div></div>`;
  }

  function recordsHtml(g, rec) {
    const t = k => tx(g, k);
    const w = (rec.w || []).map(x => `<div class="data-item"><div><strong>${esc(x.n)}</strong><br><small class="muted">${t('lastLbl')}: ${x.l ? `${x.l[0]} kg x ${repsText(x.l[1])}` : '-'}</small></div><div style="text-align:right">${t('recLbl')}: <strong class="accent">${x.b ? `${x.b[0]} kg x ${repsText(x.b[1])}` : '-'}</strong></div></div>`);
    const c = (rec.c || []).map(x => `<div class="data-item"><div><strong>🏃 ${esc(x.n)}</strong><br><small class="muted">${t('lastLbl')}: ${x.l[0]} km${x.l[1] ? ' · ' + esc(x.l[1]) : ''} (${fmtDate(x.l[2]).slice(0, 5)})</small></div><div style="text-align:right">${t('recLbl')}: <strong class="accent">${x.b} km</strong></div></div>`);
    return `<div class="card"><h3>🏆 ${t('recHead')}</h3><div class="stack">${[...w, ...c].join('') || `<div class="muted">${t('noData')}</div>`}</div></div>`;
  }

  // Wykres historii obwodu: linia po osi czasu z wypełnieniem, podpisane minimum i maksimum
  function drawChart(canvas, hist) {
    const w = canvas.parentElement.clientWidth, h = 170;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1, ctx = canvas.getContext('2d');
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const c = { line: css('--primary'), muted: css('--text-muted') };
    ctx.font = '11px sans-serif'; ctx.fillStyle = c.muted;
    if (hist.length < 2) { ctx.textAlign = 'center'; ctx.fillText('Za mało pomiarów na wykres', w / 2, h / 2); return; }
    const vals = hist.map(x => x[1]), lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
    const min = lo - span * .3, max = hi + span * .3, L = 38, R = 12, T = 12, B = 24, t0 = hist[0][0], t1 = hist[hist.length - 1][0];
    const X = ts => L + (ts - t0) / ((t1 - t0) || 1) * (w - L - R), Y = v => T + (1 - (v - min) / (max - min)) * (h - T - B);
    ctx.beginPath(); ctx.moveTo(X(t0), h - B);
    hist.forEach(([ts, v]) => ctx.lineTo(X(ts), Y(v)));
    ctx.lineTo(X(t1), h - B); ctx.closePath();
    ctx.fillStyle = c.line; ctx.globalAlpha = .15; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = c.line; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
    hist.forEach(([ts, v], i) => i ? ctx.lineTo(X(ts), Y(v)) : ctx.moveTo(X(ts), Y(v)));
    ctx.stroke();
    if (hist.length <= 40) { ctx.fillStyle = c.line; hist.forEach(([ts, v]) => { ctx.beginPath(); ctx.arc(X(ts), Y(v), 3, 0, 7); ctx.fill(); }); }
    ctx.fillStyle = c.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(hi.toFixed(1), L - 6, Y(hi)); ctx.fillText(lo.toFixed(1), L - 6, Y(lo));
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(fmtDate(t0).slice(0, 5), L, h - B + 6);
    ctx.textAlign = 'right'; ctx.fillText(fmtDate(t1).slice(0, 5), w - R, h - B + 6);
  }

  // =====================================================================
  //  Kontroler: zakładki na dolnej belce, stan widoku, zdarzenia
  // =====================================================================
  function mount({ nick, main, docs }) {
    const cfg = main.Ustawienia || {}, g = gender(main.Plec), t = k => tx(g, k), $ = id => document.getElementById(id), M = window.Mannequin;
    document.title = `${t('title')} ${nick}`;
    $('pubTitle').textContent = document.title;
    $('pubFoot').textContent = main.Zaktualizowano ? `${t('updated')} ${fmtDate(main.Zaktualizowano)}` : '';

    // tylko zakładki, które właściciel udostępnił (każda cała zakładka może być ukryta)
    const TABS = [['weight', t('navWeight')], ['body', t('navBody')], ['training', t('navTraining')]].filter(([id]) => cfg.tabs?.[id]);
    if (!TABS.length) { $('pubMsg').textContent = t('nothing'); $('pubMsg').hidden = false; return; }
    $('pubMsg').hidden = true;
    $('pubTabs').innerHTML = TABS.map(([id]) => `<section class="tab-content" id="pub-${id}"></section>`).join('');
    $('pubNav').hidden = false;
    $('pubNav').innerHTML = TABS.map(([id, label]) => `<button class="nav-item" data-nav="${id}"><svg viewBox="0 0 24 24">${ICON[id]}</svg>${label}</button>`).join('');

    const days = Object.keys(docs).filter(k => /^train_\d+$/.test(k)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)))
      .flatMap(k => docs[k].days || []).sort((a, b) => a.t - b.t);
    const st = { tab: TABS[0][0], open: new Set(), sel: days.length - 1, chip: null, muscle: null, shown: 30, level: new Map() };

    function renderBody() {
      const el = $('pub-body'), parts = docs.body?.parts || [];
      el.innerHTML = bodyHtml(g, docs.body, st.open);
      el.querySelectorAll('canvas[data-chart]').forEach(cv => drawChart(cv, parts[+cv.dataset.chart].h));
    }

    function renderTraining() {
      const el = $('pub-training'), tr = cfg.training || {}, out = [`<h3 class="pub-head">🏋️ ${t('trainHead')}</h3>`];
      if (!days.length) out.push(`<div class="card muted center">${t('noTrain')}</div>`);
      else {
        const day = days[st.sel];
        const entries = [...day.w.map(e => ({ key: 'w|' + e.e, name: e.e, m: e.m })), ...day.c.map(e => ({ key: 'c|' + e.n, name: e.n, m: e.m, cardio: true }))];
        if (st.chip && !entries.some(e => e.key === st.chip)) st.chip = null;

        if (tr.mannequin) {
          const level = new Map(), by = new Map();
          for (const e of st.chip ? entries.filter(x => x.key === st.chip) : entries) {
            if (!e.m) continue;
            for (const [ids, tier] of [[e.m[0], 2], [e.m[1], 1]]) for (const id of ids) {
              level.set(id, Math.max(level.get(id) || 0, tier));
              (by.get(id) || by.set(id, []).get(id)).push({ name: e.name, tier });
            }
          }
          st.level = level;
          let info = `<span class="muted">${t('hint')}</span>`;
          if (st.muscle) {
            const src = by.get(st.muscle) || [], mn = src.filter(s => s.tier === 2).map(s => esc(s.name)), an = src.filter(s => s.tier === 1).map(s => esc(s.name));
            info = `<strong>${esc(M.LABEL[st.muscle] || '')}</strong><br>` + (src.length
              ? (mn.length ? `${t('mainLbl')}: ${mn.join(', ')}<br>` : '') + (an.length ? `${t('auxLbl')}: ${an.join(', ')}` : '')
              : `<span class="muted">${t('notTrained')}</span>`);
          }
          const nav = days.length > 1 ? `<div class="day-nav">
              <button class="btn-secondary arrow-btn" data-step="-1" ${st.sel === 0 ? 'disabled' : ''} aria-label="Wcześniejszy trening">◀</button>
              <strong>${fmtDate(day.t)}${st.sel === days.length - 1 ? ' (ostatni)' : ''}</strong>
              <button class="btn-secondary arrow-btn" data-step="1" ${st.sel === days.length - 1 ? 'disabled' : ''} aria-label="Późniejszy trening">▶</button>
            </div>` : `<div class="day-nav"><strong>${fmtDate(day.t)}</strong></div>`;
          out.push(`<div class="card">${nav}
            <div class="mm-chips">${entries.map(e => `<button type="button" class="mm-chip${st.chip === e.key ? ' active' : ''}" data-ex="${esc(e.key)}">${e.cardio ? '🏃 ' : ''}${esc(e.name)}</button>`).join('')}</div>
            <div class="mm-views">
              <figure><svg viewBox="0 0 200 410" role="img" aria-label="Widok z przodu">${M.buildSvg(M.FRONT)}</svg><figcaption>Przód</figcaption></figure>
              <figure><svg viewBox="0 0 200 410" role="img" aria-label="Widok z tyłu">${M.buildSvg(M.BACK)}</svg><figcaption>Tył</figcaption></figure>
            </div>
            <div class="mm-legend"><span><i class="lg on"></i> główne</span><span><i class="lg on2"></i> pomocnicze</span></div>
            <div class="mm-info">${info}</div></div>`);
        }

        out.push(dayDetailHtml(g, day));

        if (days.length > 1) {   // historia: klik w dzień pokazuje ten trening (manekin i szczegóły)
          const rows = [...days.keys()].reverse().slice(0, st.shown).map(i =>
            `<div class="data-item hist-row${i === st.sel ? ' sel' : ''}" role="button" tabindex="0" data-day="${i}"><span>${fmtDate(days[i].t)}</span><span class="muted">Siłowe: ${days[i].w.length} · Kardio: ${days[i].c.length}</span></div>`);
          out.push(`<div class="card"><h3>${t('histHead')}</h3><div class="stack">${rows.join('')}</div>${days.length > st.shown ? `<button class="btn-secondary full mt" data-more>${t('more')} (${days.length - st.shown})</button>` : ''}</div>`);
        }
      }
      if (docs.trainrec) out.push(recordsHtml(g, docs.trainrec));
      el.innerHTML = out.join('');
      el.querySelectorAll('.mm').forEach(p => {   // podświetlenie mięśni kolorem motywu
        const l = st.level.get(p.dataset.m) || 0;
        p.classList.toggle('on', l === 2); p.classList.toggle('on2', l === 1); p.classList.toggle('sel', p.dataset.m === st.muscle);
      });
    }

    function render(id) {
      if (id === 'weight') $('pub-weight').innerHTML = weightHtml(g, docs.weight);
      else if (id === 'body') renderBody();
      else if (id === 'training') renderTraining();
    }
    function showTab(id) {
      st.tab = id;
      document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === 'pub-' + id));
      document.querySelectorAll('#pubNav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
      render(id);
    }

    const themeIcon = () => { $('pubThemeIcon').textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙'; };
    themeIcon();

    document.addEventListener('click', e => {
      const T = e.target, hit = sel => T.closest?.(sel);
      let el;
      if ((el = hit('[data-nav]'))) return showTab(el.dataset.nav);
      if ((el = hit('[data-part]'))) { const i = +el.dataset.part; st.open.has(i) ? st.open.delete(i) : st.open.add(i); return renderBody(); }
      if ((el = hit('[data-day]'))) { st.sel = +el.dataset.day; st.chip = st.muscle = null; renderTraining(); return window.scrollTo?.({ top: 0 }); }
      if ((el = hit('[data-step]'))) {
        const n = st.sel + +el.dataset.step;
        if (n >= 0 && n < days.length) { st.sel = n; st.chip = st.muscle = null; renderTraining(); }
        return;
      }
      if ((el = hit('[data-ex]'))) { st.chip = st.chip === el.dataset.ex ? null : el.dataset.ex; return renderTraining(); }
      if ((el = hit('.mm'))) { st.muscle = st.muscle === el.dataset.m ? null : el.dataset.m; return renderTraining(); }
      if (hit('[data-more]')) { st.shown += 30; return renderTraining(); }
      if (hit('#pubTheme')) {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('pub_theme', next); } catch { /* tryb prywatny */ }
        themeIcon(); render(st.tab);   // wykresy czytają kolory z CSS
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-day]')) e.target.click(); });

    showTab(st.tab);
  }

  window.PublicView = { mount, gender, tx, TX, weightHtml, bodyHtml, dayDetailHtml, recordsHtml, fmtDate, repsText };
})();
