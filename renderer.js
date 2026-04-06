import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
const { ipcRenderer } = require('electron');

// Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyB7Ofntn3k7ingeYINtCr6SNQB69lct4VA",
  authDomain: "intracore-cyber-syn.firebaseapp.com",
  projectId: "intracore-cyber-syn",
  storageBucket: "intracore-cyber-syn.firebasestorage.app",
  messagingSenderId: "415471049270",
  appId: "1:415471049270:web:151584cf1ec0b3dd425697",
  measurementId: "G-24H4T6WB4P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Point this to a specific PC in your database
const pcRef = ref(db, 'cafes/intracore_test/machines/PC_01');

// Listen for real-time changes
onValue(pcRef, (snapshot) => {
  const data = snapshot.val();
  
  if (data && data.status === 'active') {
    console.log("Session Active! Unlocking PC...");
    ipcRenderer.send('unlock-pc'); // Tells main.js to hide the screen
  } else {
    console.log("Session Ended! Locking PC...");
    ipcRenderer.send('lock-pc'); // Tells main.js to show the screen
  }
});