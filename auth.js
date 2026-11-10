/* Ekran logowania / rejestracji / potwierdzenia adresu e-mail.
 *
 * Bezpieczeństwo: hasłami zajmuje się wyłącznie Firebase Authentication – hasło jest wysyłane po HTTPS
 * i zapisywane w postaci solonego hasza po stronie Google. Ta aplikacja nigdy nie zapisuje hasła
 * (ani w bazie, ani w pamięci przeglądarki). Komunikaty błędów nie zdradzają, czy dany e-mail ma konto.
 */
(() => {
  'use strict';

  const MIN_PASS = 8;
  const ERR = {
    'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
    'auth/invalid-login-credentials': 'Nieprawidłowy e-mail lub hasło.',
    'auth/wrong-password': 'Nieprawidłowy e-mail lub hasło.',
    'auth/user-not-found': 'Nieprawidłowy e-mail lub hasło.',
    'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
    'auth/email-already-in-use': 'Konto z tym adresem e-mail już istnieje – zaloguj się.',
    'auth/weak-password': 'Hasło jest zbyt słabe.',
    'auth/too-many-requests': 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.',
    'auth/network-request-failed': 'Brak połączenia z internetem.',
    'auth/operation-not-allowed': 'Logowanie e-mailem jest wyłączone w konsoli Firebase (Authentication → Sign-in method).',
    'auth/admin-restricted-operation': 'Rejestracja nowych kont jest wyłączona.',
    'auth/user-disabled': 'To konto zostało zablokowane.'
  };
  const errText = e => ERR[e?.code] || 'Coś poszło nie tak. Spróbuj ponownie.';
  const fa = () => window.firebaseAuth;

  let root = null, timer = null;

  // Podmienia zawartość ekranu; zwraca funkcję pobierającą element po id
  function mount(html) {
    clearInterval(timer);
    if (!root) { root = document.createElement('div'); root.className = 'auth-screen'; document.body.append(root); }
    root.innerHTML = html;
    return id => root.querySelector('#' + id);
  }
  function say(el, text, ok = false) { el.textContent = text; el.className = 'auth-msg' + (ok ? ' ok' : ''); el.hidden = false; }

  // ---------- logowanie / rejestracja ----------
  function showAuth(mode = 'login', email = '') {
    const reg = mode === 'register';
    const $ = mount(`
      <div class="card auth-card">
        <h2>📊 Dziennik Formy</h2>
        <div class="segmented" role="group" aria-label="Tryb">
          <button type="button" data-mode="login" class="${reg ? '' : 'active'}">Logowanie</button>
          <button type="button" data-mode="register" class="${reg ? 'active' : ''}">Rejestracja</button>
        </div>
        <form id="authForm">
          <div class="form-field"><label for="authEmail">E-mail</label>
            <input type="email" id="authEmail" autocomplete="email" inputmode="email" required></div>
          <div class="form-field"><label for="authPass">Hasło</label>
            <input type="password" id="authPass" data-pass autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${MIN_PASS}" required></div>
          ${reg ? `<div class="form-field"><label for="authPass2">Powtórz hasło</label>
            <input type="password" id="authPass2" data-pass autocomplete="new-password" required></div>
            <div class="muted auth-hint">Hasło: minimum ${MIN_PASS} znaków. Po rejestracji wyślemy link potwierdzający na Twój e-mail.</div>` : ''}
          <label class="check"><input type="checkbox" id="authShow"> Pokaż hasło</label>
          <div class="auth-msg" id="authMsg" role="alert" hidden></div>
          <button type="submit" class="btn-primary">${reg ? 'Utwórz konto' : 'Zaloguj się'}</button>
        </form>
        ${reg ? '' : '<button type="button" class="link-btn" id="authForgot">Nie pamiętam hasła</button>'}
      </div>`);

    $('authEmail').value = email;
    const msg = $('authMsg');

    root.querySelectorAll('[data-mode]').forEach(b =>
      b.addEventListener('click', () => showAuth(b.dataset.mode, $('authEmail').value)));
    $('authShow').addEventListener('change', e =>
      root.querySelectorAll('input[data-pass]').forEach(i => { i.type = e.target.checked ? 'text' : 'password'; }));

    $('authForm').addEventListener('submit', async e => {
      e.preventDefault();
      const mail = $('authEmail').value.trim(), pass = $('authPass').value;
      const btn = e.submitter || $('authForm').querySelector('[type=submit]'), label = btn.textContent;
      if (reg && pass.length < MIN_PASS) return say(msg, `Hasło musi mieć co najmniej ${MIN_PASS} znaków.`);
      if (reg && pass !== $('authPass2').value) return say(msg, 'Hasła nie są takie same.');
      btn.disabled = true; btn.textContent = 'Chwileczkę…'; msg.hidden = true;
      try {
        await (reg ? fa().register(mail, pass) : fa().login(mail, pass));
        // sukces: zmianę ekranu załatwia nasłuch stanu logowania (gate)
      } catch (err) {
        console.error(err);
        say(msg, errText(err));
        btn.disabled = false; btn.textContent = label;
      }
    });

    $('authForgot')?.addEventListener('click', async () => {
      const mail = $('authEmail').value.trim();
      if (!mail) return say(msg, 'Wpisz najpierw swój adres e-mail.');
      try {
        await fa().reset(mail);
        say(msg, 'Jeśli konto o tym adresie istnieje, wysłaliśmy e-mail z linkiem do zmiany hasła.', true);
      } catch (err) {
        console.error(err);
        // nie zdradzamy, czy konto istnieje – pokazujemy tylko błędy niezależne od tego
        const show = ['auth/invalid-email', 'auth/too-many-requests', 'auth/network-request-failed'].includes(err?.code);
        say(msg, show ? errText(err) : 'Jeśli konto o tym adresie istnieje, wysłaliśmy e-mail z linkiem do zmiany hasła.', !show);
      }
    });
  }

  // ---------- potwierdzenie adresu e-mail ----------
  function showVerify(user, done) {
    const $ = mount(`
      <div class="card auth-card">
        <h2>✉️ Potwierdź adres e-mail</h2>
        <p>Wysłaliśmy wiadomość z linkiem na adres <strong id="verEmail"></strong>. Kliknij link, a potem wróć tutaj – strona sprawdzi to sama.</p>
        <p class="muted auth-hint">Nie widzisz wiadomości? Zajrzyj do folderu „Spam”.</p>
        <div class="auth-msg" id="verMsg" role="status" hidden></div>
        <button type="button" class="btn-primary" id="verCheck">Już potwierdziłem – wejdź</button>
        <button type="button" class="btn-secondary" id="verResend">Wyślij link ponownie</button>
        <button type="button" class="link-btn" id="verOut">Użyj innego konta</button>
      </div>`);
    $('verEmail').textContent = user.email;
    const msg = $('verMsg');

    const check = async manual => {
      try {
        const u = await fa().refresh();
        if (u.emailVerified) return done(u);
        if (manual) say(msg, 'Adres nie został jeszcze potwierdzony. Kliknij link w wiadomości.');
      } catch (err) { console.error(err); if (manual) say(msg, errText(err)); }
    };
    timer = setInterval(() => check(false), 4000);   // sprawdzaj w tle co 4 s

    $('verCheck').addEventListener('click', () => check(true));
    $('verResend').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await fa().resendVerification(); say(msg, 'Wysłaliśmy link ponownie.', true); }
      catch (err) { console.error(err); say(msg, errText(err)); }
      setTimeout(() => { btn.disabled = false; }, 30000);   // ochrona przed spamowaniem wysyłki
    });
    $('verOut').addEventListener('click', () => fa().logout());
  }

  function fatal(text) {
    document.body.classList.add('locked');   // ukryj aplikację, pokaż tylko komunikat
    const $ = mount(`<div class="card auth-card"><h2>⚠️ Błąd</h2><p id="fatalMsg"></p>
      <button type="button" class="btn-primary" id="fatalRetry">Spróbuj ponownie</button></div>`);
    $('fatalMsg').textContent = text;
    $('fatalRetry').addEventListener('click', () => location.reload());
  }

  // Zwraca użytkownika dopiero, gdy jest zalogowany i ma POTWIERDZONY e-mail; do tego czasu pokazuje ekrany powyżej.
  function gate() {
    return new Promise(resolve => {
      let finished = false, unsub = () => {};
      const done = user => {
        if (finished) return;
        finished = true; clearInterval(timer); unsub();
        root?.remove(); root = null;
        document.body.classList.remove('locked');
        resolve(user);
      };
      const route = user => {
        if (finished) return;
        if (!user) showAuth('login');
        else if (!user.emailVerified) showVerify(user, done);
        else done(user);
      };
      unsub = fa().onChange(route);
    });
  }

  window.Auth = { gate, fatal };
})();
