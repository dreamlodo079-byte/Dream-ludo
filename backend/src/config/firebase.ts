import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

let firebaseInitialized = false;

try {
  // First, check if the serviceAccountKey.json exists locally
  const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('[Firebase] Admin SDK initialized successfully via serviceAccountKey.json');
  } else if (process.env.FIREBASE_PROJECT_ID) {
    // Alternatively, initialize via environment variables if deployed (e.g. Render/Vercel)
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace escaped newlines with actual newlines
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    });
    firebaseInitialized = true;
    console.log('[Firebase] Admin SDK initialized successfully via Environment Variables');
  } else {
    console.warn('\n[Firebase Warning] Admin SDK could NOT be initialized.');
    console.warn('-> Missing serviceAccountKey.json in the backend root directory.');
    console.warn('-> Firebase OTP verification will fail until this is provided.\n');
  }
} catch (error) {
  console.error('[Firebase Error] Failed to initialize Admin SDK:', error);
}

export const getFirebaseAuth = () => {
  if (!firebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized. Please add serviceAccountKey.json');
  }
  return admin.auth();
};
