// firebaseAdmin.js
const admin = require('firebase-admin');
require('dotenv').config(); // Make sure dotenv is at the top

// 1. Build the credential object from environment variables
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  // 2. Fix the private key format (it comes as a string)
  private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

// 3. Initialize Firebase with the object
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// This helper function is unchanged
const sendPushNotification = async (fcmToken, title, body) => {
  if (!fcmToken) {
    console.log('No FCM token provided for user. Skipping notification.');
    return;
  }

  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: fcmToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.log('Error sending message:', error);
  }
};

module.exports = { admin, sendPushNotification };