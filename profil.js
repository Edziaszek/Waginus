// Profil publiczny – pobieranie danych. Bez logowania: czyta wyłącznie dokumenty udostępnione przez właściciela
// (nicks/{pseudonim} → publicProfiles/{uid} + publicProfiles/{uid}/data/*). Wygląd i teksty obsługuje view.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore-lite.js";
import { firebaseConfig } from "../firebase-settings.js";

const msg = text => { const el = document.getElementById('pubMsg'); el.textContent = text; el.hidden = false; };

async function load() {
  const nick = (new URLSearchParams(location.search).get('u') || '').trim();
  if (window.Nick.check(nick)) return msg('Nieprawidłowy adres profilu.');
  try {
    const db = getFirestore(initializeApp(firebaseConfig));
    const owner = await getDoc(doc(db, 'nicks', nick.toLowerCase()));
    if (!owner.exists()) return msg('Nie znaleziono takiego profilu.');
    const uid = owner.data().uid;
    const [main, data] = await Promise.all([   // ustawienia i treść równolegle
      getDoc(doc(db, 'publicProfiles', uid)),
      getDocs(collection(db, 'publicProfiles', uid, 'data'))
    ]);
    if (!main.exists()) return msg('Ten użytkownik nie udostępnia profilu publicznego.');
    const m = main.data();
    window.PublicView.mount({ nick: m.Nick || nick, main: m, docs: Object.fromEntries(data.docs.map(d => [d.id, d.data()])) });
  } catch (e) {
    console.error(e);
    msg('Nie udało się wczytać profilu. Spróbuj ponownie później.');
  }
}
load();
