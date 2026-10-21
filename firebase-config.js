import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdWtyDAnH8Fx7lO1VYvB2xh_vhcen6pU8",
  authDomain: "waginus-66d1a.firebaseapp.com",
  projectId: "waginus-66d1a",
  storageBucket: "waginus-66d1a.firebasestorage.app",
  messagingSenderId: "587901157605",
  appId: "1:587901157605:web:8501adacabfb22f08a140c",
  measurementId: "G-1FHS6E37BT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.db = db;
window.firebaseFunctions = {
  async getData(collectionName) {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      let data = [];
      querySnapshot.forEach((document) => {
        data.push({ id: document.id, ...document.data() });
      });
      return data;
    } catch (e) {
      console.error("Błąd pobierania kolekcji " + collectionName, e);
      return [];
    }
  },
  async addData(collectionName, item) {
    const docRef = await addDoc(collection(db, collectionName), item);
    return docRef.id;
  },
  async deleteData(collectionName, id) {
    await deleteDoc(doc(db, collectionName, id));
  },
  async updateData(collectionName, id, updatedFields) {
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, updatedFields);
  }
};

if (window.startApp) {
  window.startApp();
}
