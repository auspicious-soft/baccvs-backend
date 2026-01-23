import { google } from "googleapis";
import crypto from "crypto";

const GOOGLE_PUBLIC_KEY = process.env.GOOGLE_PLAY_PUBLIC_KEY || "";
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || "com.deepfeels";
let androidPublisher: any = null;

export const determineBillingPeriod = (
  productId: string,
): "weekly" | "monthly" | "yearly" | "lifetime" => {
  const pid = productId.toLowerCase();

  if (pid.includes("weekly") || pid.includes("week")) return "weekly";
  if (pid.includes("yearly") || pid.includes("annual") || pid.includes("year"))
    return "yearly";
  if (pid.includes("lifetime") || pid.includes("forever")) return "lifetime";

  return "monthly"; // Default
};
export const mapPurchaseStateToStatus = (
  purchaseState: number,
  autoRenewing: boolean,
  expiryTimeMillis?: string,
  paymentState?: number,
  priceAmountMicros?: string,
  introductoryPriceInfo?: any, // From Google Play API
):
  | "active"
  | "cancelled"
  | "expired"
  | "pending"
  | "grace_period"
  | "on_hold"
  | "trialing" => {
  // Purchase states: 0 = purchased, 1 = cancelled, 2 = pending
  if (purchaseState === 2) return "pending";
  if (purchaseState === 1) return "cancelled";

  // Check if user is in trial period
  // Method 1: Check if priceAmountMicros is 0 (free trial)
  if (priceAmountMicros && parseInt(priceAmountMicros) === 0) {
    return "trialing";
  }

  // Method 2: Check paymentState (0 = pending, 1 = received, 2 = free trial, 3 = pending deferred)
  if (paymentState === 2) {
    return "trialing";
  }

  // Method 3: Check if there's introductory price info and it's active
  if (introductoryPriceInfo) {
    return "trialing";
  }

  // Check expiry
  if (expiryTimeMillis) {
    const expiryDate = new Date(parseInt(expiryTimeMillis));
    const now = new Date();

    if (expiryDate < now) {
      return "expired";
    }
  }

  // Check auto-renewing
  if (!autoRenewing) return "cancelled";

  return "active";
};
const initializeGooglePlayAPI = async () => {
  if (androidPublisher) return androidPublisher;

  try {
    if (!GOOGLE_SERVICE_ACCOUNT) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set",
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT),
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    androidPublisher = google.androidpublisher({
      version: "v3",
      auth,
    });

    return androidPublisher;
  } catch (error: any) {
    console.error("Failed to initialize Google Play API:", error.message);
    throw new Error("googlePlayInitFailed");
  }
};

export const verifyPurchaseWithGoogle = async (
  productId: string,
  purchaseToken: string,
): any => {
  try {
    const api = await initializeGooglePlayAPI();

    const response = await api.purchases.subscriptions.get({
      packageName: PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
    });

    return response.data;
  } catch (error: any) {
    console.error("Google Play verification error:", error);

    if (error.code === 401) {
      throw new Error("googlePlayAuthFailed");
    } else if (error.code === 404) {
      throw new Error("purchaseNotFound");
    } else if (error.code === 410) {
      throw new Error("purchaseExpired");
    }

    throw new Error("googlePlayVerificationFailed");
  }
};
export const verifyPurchaseSignature = (
  purchaseData: string,
  signature: string,
): boolean => {
  try {
    if (!GOOGLE_PUBLIC_KEY) {
      throw new Error("GOOGLE_PLAY_PUBLIC_KEY not configured");
    }

    const verifier = crypto.createVerify("SHA1");
    verifier.update(purchaseData);
    verifier.end();

    const publicKey = `-----BEGIN PUBLIC KEY-----\n${GOOGLE_PUBLIC_KEY}\n-----END PUBLIC KEY-----`;
    const isValid = verifier.verify(publicKey, signature, "base64");

    return isValid;
  } catch (error: any) {
    console.error("Signature verification error:", error.message);
    return false;
  }
};
export const isPurchaseValidForRestore = async (
  googlePlayData: any
): any => {
  
  // Check if purchase exists
  if (!googlePlayData) {
    return {
      valid: false,
      reason: 'purchaseNotFoundInGoogle',
      message: 'Purchase not found in Google Play',
    };
  }

  // // Check if purchase is revoked (refunded)
  // if (googlePlayData.cancelReason === 0) {
  //   return {
  //     valid: false,
  //     reason: 'purchaseRevoked',
  //     message: 'Purchase has been refunded and cannot be restored',
  //   };
  // }

  // Check acknowledgment state
  // 0 = not acknowledged, 1 = acknowledged
  if (googlePlayData.acknowledgementState === 0) {
    console.warn('⚠️  Purchase not acknowledged yet');
  }

  // Check expiry date
  const expiryDate = googlePlayData.expiryTimeMillis
    ? new Date(parseInt(googlePlayData.expiryTimeMillis))
    : null;
  
  const now = new Date();
  const isExpired = expiryDate && expiryDate < now;

  // Allow expired subscriptions to be restored (user can see their history)
  // But inform them it's expired
  if (isExpired && !googlePlayData.autoRenewing) {
    return {
      valid: true,
      reason: 'expired',
      message: 'Purchase is expired but can be restored for history',
    };
  }

  // Valid purchase
  return {
    valid: true,
    message: 'Purchase is valid for restore',
  };
};