import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let analytics: Analytics | null = null;

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

if (apiKey) {
  app = initializeApp({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  });
  auth = getAuth(app);
  firestore = getFirestore(app);
  googleProvider = new GoogleAuthProvider();

  // Initialize Analytics (only in supported environments, not SSR/node)
  isSupported().then((supported) => {
    if (supported && app) {
      analytics = getAnalytics(app);
    }
  });
}

export { auth, firestore, googleProvider, analytics };
