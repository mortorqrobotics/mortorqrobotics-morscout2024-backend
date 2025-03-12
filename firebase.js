const admin = require("firebase-admin");
require('dotenv').config();

let db;

try {
    // Clean up the private key string - replace escaped newlines with actual newlines
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    admin.initializeApp({
        credential: admin.credential.cert({
            "type": process.env.FIREBASE_TYPE,
            "project_id": process.env.FIREBASE_PROJECT_ID,
            "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
            "private_key": privateKey,
            "client_email": process.env.FIREBASE_CLIENT_EMAIL,
            "client_id": process.env.FIREBASE_CLIENT_ID,
            "auth_uri": process.env.FIREBASE_AUTH_URI,
            "token_uri": process.env.FIREBASE_TOKEN_URI,
            "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
            "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL
        })
    });
    
    db = admin.firestore();
} catch (error) {
    console.error("Firebase initialization error:", error);
    console.error("Environment variables status:", {
        hasType: !!process.env.FIREBASE_TYPE,
        hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
        hasPrivateKeyId: !!process.env.FIREBASE_PRIVATE_KEY_ID,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasClientId: !!process.env.FIREBASE_CLIENT_ID,
        hasAuthUri: !!process.env.FIREBASE_AUTH_URI,
        hasTokenUri: !!process.env.FIREBASE_TOKEN_URI,
        hasAuthProvider: !!process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
        hasClientX509: !!process.env.FIREBASE_CLIENT_X509_CERT_URL
    });
    throw error;
}

module.exports = db;