import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBnJcpWcrehALdz8jQj7_jnoS_pZOwqV5k",
  authDomain: "aesthetics-441d8.firebaseapp.com",
  projectId: "aesthetics-441d8",
  storageBucket: "aesthetics-441d8.appspot.com",
  messagingSenderId: "1033902244249",
  appId: "1:1033902244249:web:b7f598a9d955af6a911308",
  measurementId: "G-B1TDWGHHKB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Firestore instance (if needed)

export { auth, db };
