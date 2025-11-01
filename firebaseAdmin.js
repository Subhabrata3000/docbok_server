// firebaseAdmin.js
const admin = require('firebase-admin');

// This line reads the key file you just added
const serviceAccount = require('./serviceAccountKey.json');

// Initialize the Firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/**
 * A helper function to send a push notification.
 * @param {string} fcmToken - The device token of the user to send to.
 * @param {string} title - The title of the notification.
 * @param {string} body - The main text of the notification.
 */
const sendPushNotification = async (fcmToken, title, body) => {
  // Check if a token was provided
  if (!fcmToken) {
    console.log('No FCM token provided for user. Skipping notification.');
    return;
  }

  // This is the notification payload
  const message = {
    notification: {
      title: title, // e.g., "Appointment Confirmed!"
      body: body,   // e.g., "Dr. Smith has confirmed your appointment."
    },
    token: fcmToken, // The specific device to send to
  };

  try {
    // Send the message using the Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.log('Error sending message:', error);
  }
};

// Export the function so we can use it in index.js
module.exports = { sendPushNotification };