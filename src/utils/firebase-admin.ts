import admin from "firebase-admin";

export const initFirebaseAdmin = () => {
  try {
    if (admin.apps && admin.apps.length > 0) return;
    const firebaseJson = process.env.FIREBASE_PROJECT_JSON;
    if (!firebaseJson) {
      console.warn(
        "FIREBASE_PROJECT_JSON not set; skipping Firebase Admin init"
      );
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(firebaseJson);
    } catch (err) {
      // Try to unescape newlines then parse
      const cleaned = firebaseJson.replace(/\\n/g, "\\n");
      parsed = JSON.parse(cleaned);
    }

    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
    console.log("Firebase Admin initialized");
  } catch (err) {
    console.warn("Failed to initialize Firebase Admin:", err);
  }
};

export const sendPushToToken = async (
  token: string,
  title: string,
  body: string,
  data?: { [k: string]: string }
) => {
  try {
    if (!admin.apps || admin.apps.length === 0) {
      console.warn("Firebase Admin not initialized; skipping push send");
      return;
    }

    const message: admin.messaging.Message = {
      token,
      notification: { title, body },
      data: data || {},
    };

    const resp = await admin.messaging().send(message);
    return resp;
  } catch (err) {
    console.warn("Failed to send push:", err);
    throw err;
  }
};

export default { initFirebaseAdmin, sendPushToToken };
