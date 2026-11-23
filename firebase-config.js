import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { firebaseConfig } from "./firebase-settings.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc, deleteField, writeBatch }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore-lite.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
         sendEmailVerification, sendPasswordResetEmail, updateProfile as updateAuthProfile }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
// Auth tworzymy PRZED bazą: Firestore Lite pobiera token logowania z instancji Auth przy pierwszym żądaniu.
const auth = getAuth(app);
const db = getFirestore(app);   // wersja Lite: kilka razy mniejsza od pełnej, zwykłe zapytania HTTP (bez streamingu i trybu offline)
auth.languageCode = 'pl';   // e-maile weryfikacyjne i resetu hasła po polsku

// Kolekcje z danymi użytkownika (podkolekcje users/{uid}/...)
const COLLECTIONS = ['Waga', 'Treningi', 'Cwiczenia', 'Obwody', 'Kardio', 'KardioTypy'];

// ---------- Konta: hasła obsługuje wyłącznie Firebase Authentication (solone hasze po stronie serwera Google) ----------
window.firebaseAuth = {
  get user() { return auth.currentUser; },
  onChange: cb => onAuthStateChanged(auth, cb),
  // Pseudonim zapisujemy tymczasowo w displayName konta: zapis w bazie jest możliwy dopiero po potwierdzeniu e-maila
  // (wtedy aplikacja zajmuje pseudonim – patrz loadProfile w app.js).
  async register(email, password, nick = '') {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (nick) await updateAuthProfile(user, { displayName: nick }).catch(console.error);
    await sendEmailVerification(user).catch(console.error);   // błąd wysyłki nie blokuje – można wysłać ponownie
    return user;
  },
  async login(email, password) { return (await signInWithEmailAndPassword(auth, email, password)).user; },
  logout: () => signOut(auth),
  reset: email => sendPasswordResetEmail(auth, email),
  resendVerification: () => sendEmailVerification(auth.currentUser),
  // po kliknięciu linku w e-mailu trzeba odświeżyć użytkownika ORAZ token – reguły bazy czytają z niego email_verified
  async refresh() {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    return auth.currentUser;
  }
};

// ---------- Dane: każdy użytkownik ma własny folder users/{uid}/..., reszta kodu aplikacji nie zmienia się ----------
// Paczki zapisów są małe, bo reguły bazy mają limit pomocniczych odczytów na paczkę (20), a każdy zapis sprawdza konto.
// parallel > 1 wysyła kilka paczek naraz – żeby duże czyszczenie nie trwało zbyt długo.
async function runBatches(items, size, apply, parallel = 1) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  for (let i = 0; i < chunks.length; i += parallel) {
    await Promise.all(chunks.slice(i, i + parallel).map(async chunk => {
      const batch = writeBatch(db);
      chunk.forEach(x => apply(batch, x));
      await batch.commit();
    }));
  }
}
const nickKey = n => String(n ?? '').trim().toLowerCase();
const uid = () => {
  const u = auth.currentUser;
  if (!u) throw new Error('Brak zalogowanego użytkownika');
  return u.uid;
};
const col = name => collection(db, 'users', uid(), name);
const ref = (name, id) => doc(db, 'users', uid(), name, id);

window.firebaseFunctions = {
  async getData(name) {
    const snap = await getDocs(col(name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async addData(name, item) { return (await addDoc(col(name), item)).id; },
  deleteData: (name, id) => deleteDoc(ref(name, id)),
  updateData: (name, id, fields) => updateDoc(ref(name, id), fields),
  removeField: (name, id, field) => updateDoc(ref(name, id), { [field]: deleteField() }),

  // ---------- Pseudonimy: nicks/{pseudonim_małymi_literami} -> { uid } ----------
  // Unikalność gwarantuje baza: dokument można UTWORZYĆ tylko raz, a próba zajęcia istniejącego jest odrzucana przez reguły.
  async nickOwner(nick) {   // uid właściciela pseudonimu albo null (wolny); działa też bez logowania
    const snap = await getDoc(doc(db, 'nicks', nickKey(nick)));
    return snap.exists() ? snap.data().uid : null;
  },
  // Ustawia/zmienia pseudonim atomowo: profil + zajęcie nowego + zwolnienie starego w jednej paczce (wszystko albo nic)
  async setNickname(id, nick, oldNick = '') {
    const batch = writeBatch(db), k = nickKey(nick), old = nickKey(oldNick);
    batch.update(doc(db, 'profiles', id), { Pseudonim: nick });
    if (k !== old) {   // sama zmiana wielkości liter nie rusza rejestru
      batch.set(doc(db, 'nicks', k), { uid: id });
      if (old) batch.delete(doc(db, 'nicks', old));
    }
    await batch.commit();
  },
  releaseNick: nick => deleteDoc(doc(db, 'nicks', nickKey(nick))),

  // ---------- Profil publiczny: publicProfiles/{uid} (ustawienia) + publicProfiles/{uid}/data/* (udostępniane treści) ----------
  async getPublic(id) {
    const snap = await getDoc(doc(db, 'publicProfiles', id));
    return snap.exists() ? snap.data() : null;
  },
  createPublic: (id, data) => setDoc(doc(db, 'publicProfiles', id), data),
  // Zmienione dokumenty z treścią i usunięcia idą w małych paczkach, a ustawienia (z odciskami H) zapisujemy na końcu –
  // jeśli coś po drodze się nie uda, odciski są stare i kolejna synchronizacja po prostu dopisze brakujące.
  async syncPublic(id, main, upserts, deletes) {
    const ops = [...Object.entries(upserts).map(([name, data]) => ['set', name, data]), ...deletes.map(name => ['del', name])];
    await runBatches(ops, 8, (batch, [kind, name, data]) => {
      const ref = doc(db, 'publicProfiles', id, 'data', name);
      kind === 'set' ? batch.set(ref, data) : batch.delete(ref);
    });
    await updateDoc(doc(db, 'publicProfiles', id), main);
  },
  // Kasuje profil publiczny z całą treścią. Właściciel może używać dużych paczek; administrator (size 5) – małych,
  // bo przy jego kontach reguły muszą za każdym razem sprawdzić jego rolę.
  async deletePublic(id, size = 400) {
    const docs = (await getDocs(collection(db, 'publicProfiles', id, 'data'))).docs;
    await runBatches(docs, size, (batch, d) => batch.delete(d.ref), size < 50 ? 6 : 1);
    await deleteDoc(doc(db, 'publicProfiles', id));
  },

  // ---------- Profile: profiles/{uid} – wzrost, rok urodzenia, płeć, rola (admin / user), status ----------
  async getProfile(id) {
    const snap = await getDoc(doc(db, 'profiles', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  async createProfile(id, data) {
    await setDoc(doc(db, 'profiles', id), data);
    return { id, ...data };
  },
  updateProfile: (id, fields) => updateDoc(doc(db, 'profiles', id), fields),

  // --- tylko dla administratora (egzekwują to reguły bazy, nie ta aplikacja) ---
  async listProfiles() {
    return (await getDocs(collection(db, 'profiles'))).docs.map(d => ({ id: d.id, ...d.data() }));
  },
  // Kasuje wszystkie dane wskazanego użytkownika (jego podkolekcje). Zwraca liczbę usuniętych dokumentów.
  async wipeUserData(id) {
    let total = 0;
    for (const name of COLLECTIONS) {
      const docs = (await getDocs(collection(db, 'users', id, name))).docs;
      await runBatches(docs, 5, (batch, d) => batch.delete(d.ref), 6);   // małe paczki: każdy zapis sprawdza rolę administratora
      total += docs.length;
    }
    return total;
  }
};

// Moduł ładuje się asynchronicznie – app.js czeka na to zdarzenie.
window.dispatchEvent(new Event('firebase-ready'));
