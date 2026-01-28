import admin from "firebase-admin";
import { usersModel } from "src/models/user/user-schema";

export const initFirebaseAdmin = () => {
  try {
    if (admin.apps && admin.apps.length > 0) return;
    const firebaseJson = process.env.FIREBASE_PROJECT_JSON;
    if (!firebaseJson) {
      console.warn(
        "FIREBASE_PROJECT_JSON not set; skipping Firebase Admin init",
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
  data?: { [k: string]: string },
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

export const sendBulkPushNotification = async (opts: {
  userIds?: Array<string> | Array<any>;
  fcmTokens?: string[];
  title: string;
  message: string;
  data?: { [k: any]: any };
}) => {
  try {
    if (!admin.apps || admin.apps.length === 0) {
      console.warn("Firebase Admin not initialized; skipping bulk push send");
      return { successCount: 0, failureCount: 0 };
    }

    let tokens: string[] = [];

    if (opts.fcmTokens && opts.fcmTokens.length) {
      tokens = opts.fcmTokens.filter(Boolean);
    }

    if (opts.userIds && opts.userIds.length) {
      const users = await usersModel
        .find({ _id: { $in: opts.userIds } })
        .select("fcmToken")
        .lean();
      const fetched = users.map((u: any) => u.fcmToken).filter(Boolean);
      tokens = [...tokens, ...fetched];
    }

    // Deduplicate tokens
    tokens = Array.from(new Set(tokens));

    if (!tokens.length) {
      return { successCount: 0, failureCount: 0 };
    }

    // Firebase allows up to 500 tokens per sendMulticast
    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);

      const message: admin.messaging.MulticastMessage = {
        tokens: chunk,
        notification: { title: opts.title, body: opts.message },
        data: opts.data || {},
      };

      const resp = await admin.messaging().sendEachForMulticast(message);
      successCount += resp.successCount || 0;
      failureCount += resp.failureCount || 0;

      if (resp.failureCount && resp.responses && resp.responses.length) {
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            console.warn(
              "Failed push for token:",
              chunk[idx],
              r.error?.message || r.error,
            );
          }
        });
      }
    }

    return { successCount, failureCount, total: tokens.length };
  } catch (err) {
    console.warn("Failed to send bulk push:", err);
    throw err;
  }
};

export default { initFirebaseAdmin, sendPushToToken, sendBulkPushNotification };
