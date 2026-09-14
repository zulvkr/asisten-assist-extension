import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyDV8Z7K62-bzrlRcaBMJZedCbarQcSExm8",
  authDomain: "asisten-assist.firebaseapp.com",
  projectId: "asisten-assist",
  storageBucket: "asisten-assist.firebasestorage.app",
  messagingSenderId: "1034065647274",
  appId: "1:1034065647274:web:eec1bd2fb8bf0b172322d3"
};

// Initialize Firebase safely (singleton pattern)
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
