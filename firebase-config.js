import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, deleteField }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdWtyDAnH8Fx7lO1VYvB2xh_vhcen6pU8",
  authDomain: "waginus-66d1a.firebaseapp.com",
  projectId: "waginus-66d1a",
  storageBucket: "waginus-66d1a.firebasestorage.app",
  messagingSenderId: "587901157605",
  appId: "1:587901157605:web:8501adacabfb22f08a140c"
};

const db = getFirestore(initializeApp(firebaseConfig));

// Cienka warstwa nad Firestore. Błędy NIE są połykane – aplikacja pokazuje je w pasku statusu.
window.firebaseFunctions = {
  async getData(name) {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async addData(name, item) {
    return (await addDoc(collection(db, name), item)).id;
  },
  deleteData: (name, id) => deleteDoc(doc(db, name, id)),
  updateData: (name, id, fields) => updateDoc(doc(db, name, id), fields),
  removeField: (name, id, field) => updateDoc(doc(db, name, id), { [field]: deleteField() })
};

// Moduł ładuje się asynchronicznie – app.js czeka na to zdarzenie.
window.dispatchEvent(new Event('firebase-ready'));
