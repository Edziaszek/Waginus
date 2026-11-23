/* Wspólne dla aplikacji i profilu publicznego (profil/): manekin SVG, BMI i zasady pseudonimu.
 * Jeden kod w jednym miejscu – dzięki temu profil publiczny wygląda i liczy dokładnie tak jak aplikacja. */
(() => {
  'use strict';

  // ---------- Pseudonim: 3–20 znaków a–z, A–Z, 0–9, _ i - (bez polskich znaków – bezpieczny w adresie URL) ----------
  const Nick = {
    RE: /^[A-Za-z0-9_-]{3,20}$/,
    RESERVED: ['admin', 'administrator', 'api', 'www', 'profil', 'public', 'root', 'null', 'undefined', 'support', 'pomoc'],
    key: n => String(n ?? '').trim().toLowerCase(),   // klucz unikalności: wielkość liter nie ma znaczenia
    // zwraca komunikat błędu albo '' gdy pseudonim jest poprawny
    check(n) {
      n = String(n ?? '').trim();
      if (!Nick.RE.test(n)) return 'Pseudonim: 3–20 znaków – litery a–z (bez polskich znaków), cyfry, _ i -.';
      if (Nick.RESERVED.includes(n.toLowerCase())) return 'Ten pseudonim jest zarezerwowany.';
      return '';
    }
  };

  // ---------- Manekin (te same kształty rysuje zakładka główna i profil publiczny) ----------
  const MUSCLES = [
    ['chest', 'Klatka piersiowa'], ['shoulders', 'Barki'], ['biceps', 'Biceps'], ['triceps', 'Triceps'],
    ['forearms', 'Przedramiona'], ['abs', 'Brzuch'], ['obliques', 'Mięśnie skośne brzucha'],
    ['traps', 'Czworoboczne (kaptury)'], ['lats', 'Najszersze grzbietu'], ['lowerback', 'Dolny odcinek grzbietu'],
    ['glutes', 'Pośladki'], ['quads', 'Czworogłowe ud'], ['adductors', 'Przywodziciele ud'], ['hamstrings', 'Dwugłowe ud'], ['calves', 'Łydki']
  ].map(([id, label]) => ({ id, label }));
  const LABEL = Object.fromEntries(MUSCLES.map(m => [m.id, m.label]));

  // ---------- rysunek: uproszczony manekin (lewa połowa rysowana, prawa to lustrzane odbicie) ----------
  const BODY = [
    ['M85 26 a15 18 0 1 0 30 0 a15 18 0 1 0 -30 0Z', false],                                           // głowa
    ['M92 42H108V58H92Z', false],                                                                      // szyja
    ['M62 62Q100 52 138 62L134 120Q130 160 126 190L122 214Q100 222 78 214L74 190Q70 160 66 120Z', false], // tułów
    ['M60 64Q44 68 43 84L40 138H55L62 92Z', true],                                                     // ramię
    ['M40 138H55L51 202H42Z', true],                                                                   // przedramię
    ['M42 200H51L53 220Q46 226 41 220Z', true],                                                        // dłoń
    ['M71 208L100 212L97 300Q86 308 74 300Z', true],                                                   // udo
    ['M74 304Q86 310 97 304L93 380Q86 388 79 380Z', true],                                             // łydka
    ['M79 380H93L97 398Q86 404 74 398Z', true]                                                         // stopa
  ];
  const DELT = 'M62 62Q47 64 43 84L48 100Q58 90 64 76Z', FOREARM = 'M40 142H55L51 200H42Z', CALF = 'M75 308Q86 312 96 308L92 372Q86 378 80 372Z';
  const FRONT = [
    ['shoulders', DELT, true],
    ['chest', 'M66 70Q82 66 99 74L99 108Q82 114 68 104Q64 88 66 70Z', true],
    ['biceps', 'M45 104Q50 100 56 104L54 130L43 132Z', true],
    ['forearms', FOREARM, true],
    ['abs', 'M88 114H99V136H88Z', true], ['abs', 'M88 139H99V161H88Z', true], ['abs', 'M88 164H99V186H88Z', true],
    ['obliques', 'M70 118L84 118L86 190L76 196Q72 160 70 118Z', true],
    ['quads', 'M72 214L89 215L89 296Q82 300 75 294Z', true],
    ['adductors', 'M90 216L99 216L97 288Q93 292 90 288Z', true],
    ['calves', CALF, true]
  ];
  const BACK = [
    ['lats', 'M68 94L82 100L98 140V170Q84 170 74 154Q68 124 68 94Z', true],
    ['traps', 'M100 54Q88 58 76 66L84 88L100 122L116 88L124 66Q112 58 100 54Z', false],
    ['shoulders', DELT, true],
    ['triceps', 'M44 104Q50 100 57 104L55 132L42 134Z', true],
    ['forearms', FOREARM, true],
    ['lowerback', 'M86 174H99V206Q92 208 88 204Z', true],
    ['glutes', 'M72 206Q86 200 99 208V238Q84 244 72 232Z', true],
    ['hamstrings', 'M72 244L99 242L97 298Q86 304 75 296Z', true],
    ['calves', CALF, true]
  ];
  const MIRROR = 'transform="translate(200 0) scale(-1 1)"';
  const shape = (d, mirror, attrs) => `<path ${attrs} d="${d}"/>` + (mirror ? `<path ${attrs} d="${d}" ${MIRROR}/>` : '');
  const buildSvg = muscles =>
    BODY.map(([d, m]) => shape(d, m, 'class="mm-body"')).join('') +
    muscles.map(([id, d, m]) => shape(d, m, `class="mm" data-m="${id}"`)).join('');

  window.Mannequin = { MUSCLES, LABEL, FRONT, BACK, buildSvg };

  // ---------- BMI ----------
  const BMI_TABLE = [
    { name: 'niedowaga',                 from: 0,    to: 18.5 },
    { name: 'waga prawidłowa',           from: 18.5, to: 25 },
    { name: 'nadwaga',                   from: 25,   to: 30 },
    { name: 'pierwszy stopień otyłości', from: 30,   to: 35 },
    { name: 'drugi stopień otyłości',    from: 35,   to: 40 },
    { name: 'trzeci stopień otyłości',   from: 40,   to: Infinity }
  ];
  const r1 = x => Math.round(x * 10) / 10;

  // BMI = masa [kg] / (wzrost [m])^2. Kategoria wg BMI zaokrąglonego do 0,1 (tak jak wyświetlane),
  // więc progi wagowe liczymy dla BMI = próg − 0,05 (od tej wartości zaokrąglenie daje próg).
  // Zwraca { shown, index, name, toLower, toUpper } albo null (brak wagi lub wzrostu):
  //   toLower = { name, kg } – ile zrzucić, by przejść do niższej kategorii
  //   toUpper = { name, kg } – ile przybrać, by przejść do wyższej kategorii
  const Bmi = {
    TABLE: BMI_TABLE,
    info(weight, heightCm) {
      if (!(weight > 0) || !(heightCm > 0)) return null;
      const m = heightCm / 100, shown = r1(weight / (m * m));
      const i = BMI_TABLE.findIndex(c => shown >= c.from && shown < c.to), cat = BMI_TABLE[i];
      const weightAt = c => (c.from - 0.05) * m * m;                                  // masa, od której BMI zaokrągla się do progu c
      const lose = c => Math.floor((weight - weightAt(c)) * 10) / 10 + 0.1;           // ile zrzucić, by zejść poniżej kategorii c
      const gain = c => Math.ceil((weightAt(c) - weight) * 10) / 10;                  // ile przybrać, by wejść do kategorii c
      return {
        shown, index: i, name: cat.name,
        toLower: i > 0 ? { name: BMI_TABLE[i - 1].name, kg: lose(cat) } : null,
        toUpper: i < BMI_TABLE.length - 1 ? { name: BMI_TABLE[i + 1].name, kg: gain(BMI_TABLE[i + 1]) } : null
      };
    }
  };

  window.Nick = Nick;
  window.Bmi = Bmi;
})();
