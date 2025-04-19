import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWJGpq9Bj6hGFy0kd86LJ6udCSEM0t0Xg",
  authDomain: "gtportal-2252c.firebaseapp.com",
  projectId: "gtportal-2252c",
  storageBucket: "gtportal-2252c.appspot.com", // Corrected: Removed "firebasestorage." prefix
  messagingSenderId: "422688329688",
  appId: "1:422688329688:web:4becb88c07788dfdaaecad",
  measurementId: "G-DVHJTKB82G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Firestore instance (if needed)

export { auth, db }; 