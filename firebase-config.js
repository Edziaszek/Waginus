import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc, deleteField, writeBatch }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore-lite.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
         sendEmailVerification, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdWtyDAnH8Fx7lO1VYvB2xh_vhcen6pU8",
  authDomain: "waginus-66d1a.firebaseapp.com",
  projectId: "waginus-66d1a",
  storageBucket: "waginus-66d1a.firebasestorage.app",
  messagingSenderId: "587901157605",
  appId: "1:587901157605:web:8501adacabfb22f08a140c"
};

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
  async register(email, password) {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
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
      for (let i = 0; i < docs.length; i += 400) {            // limit Firestore: 500 operacji na paczkę
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      total += docs.length;
    }
    return total;
  }
};

// Moduł ładuje się asynchronicznie – app.js czeka na to zdarzenie.
window.dispatchEvent(new Event('firebase-ready'));
