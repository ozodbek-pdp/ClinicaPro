import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCnxWMzbOql47PhroOGrpI7CejtYdY6Kr8",
  authDomain: "globalnews-login.firebaseapp.com",
  projectId: "globalnews-login",
  storageBucket: "globalnews-login.firebasestorage.app",
  messagingSenderId: "508424435922",
  appId: "1:508424435922:web:562c38795051b2b389550b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, 'ai-studio-420afd88-bf50-4268-8b2f-3fb0abc079ca');
