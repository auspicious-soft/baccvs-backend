import axios from "axios";
import { jwtVerify, importJWK, importX509 } from "jose";
import { PlanModel } from "src/models/plan-schema";
import { SubscriptionModel } from "src/models/subscriptions/dating-subscription-schema";
import { TransactionModel } from "src/models/transaction/subscription-transaction";
import { usersModel } from "src/models/user/user-schema";
import { google } from "googleapis";
import { Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import {
  AppStoreServerAPIClient,
  Environment,
  GetTransactionHistoryVersion,
  ReceiptUtility,
  Order,
  ProductType,
  HistoryResponse,
  TransactionHistoryRequest,
  // decodeTransaction,
} from "@apple/app-store-server-library";

class ValidationError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

class NotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

class DuplicateError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
    this.statusCode = 409;
  }
}

async function validateStoreKit2JWS(
  signedJWS: string,
): Promise<{ valid: boolean; data?: any; error?: string }> {
  try {
    const decodedHeader = jwt.decode(signedJWS, { complete: true })?.header;
    const header = decodedHeader as any;
    if (
      header.alg !== "ES256" ||
      !Array.isArray(header.x5c) ||
      header.x5c.length === 0
    ) {
      return { valid: false, error: "Invalid header: missing ES256 or x5c" };
    }
    // Step 2: Extract Apple's intermediate cert (the first one in x5c)
    const appleCertBase64 = header.x5c[0];
    const applePublicKey = `-----BEGIN CERTIFICATE-----\n${appleCertBase64}\n-----END CERTIFICATE-----`;

    // Step 3: Verify signature using the embedded cert
    const payload = jwt.verify(signedJWS, applePublicKey, {
      algorithms: ["ES256"],
    }) as any;

    console.log(payload);

    return {
      valid: true,
      data: {
        transactionId: payload.transactionId,
        originalTransactionId:
          payload.originalTransactionId || payload.transactionId,
        productId: payload.productId,
        purchaseDate: new Date(Number(payload.purchaseDate)),
        expiresDate: payload.expiresDate
          ? new Date(Number(payload.expiresDate))
          : null,
        environment: payload.environment, // "Sandbox" or "Production"
        isTrial: payload.offerDiscountType === "FREE_TRIAL" ? true : false,
        price: payload.price,
        currency: payload.currency,
        transactionReason: payload.transactionReason,
        appAccountToken: payload.appAccountToken, // very useful to match user
      },
    };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export const rawBodyMiddleware = (req: any, res: any, next: any) => {
  // TypeScript types adjust kar lo
  if (req.method !== "POST") return next();
  let data = Buffer.alloc(0);
  req.on("data", (chunk: Buffer) => (data = Buffer.concat([data, chunk])));
  req.on("end", () => {
    req.body = data;
    // console.log('Captured body length:', data.length); // 332 aana chahiye
    // console.log('Body preview:', data.toString('utf8').substring(0, 200)); // JSON start dekh lo
    next();
  });
  req.on("error", () => res.status(400).send("Bad Request"));
};

export async function decodeSignedPayload(signedPayload: string) {
  try {
    const [headerB64] = signedPayload.split(".");
    const header = JSON.parse(
      Buffer.from(headerB64, "base64").toString("utf8"),
    );

    let publicKey;

    if (header.x5c && header.x5c.length > 0) {
      // ✅ Case 1: Certificate chain provided in the header
      const cert = `-----BEGIN CERTIFICATE-----\n${header.x5c[0]}\n-----END CERTIFICATE-----`;
      publicKey = await importX509(cert, header.alg);
      console.log("✅ Using x5c public certificate from header");
    } else if (header.kid) {
      // ✅ Case 2: Only key ID provided → fetch Apple JWKS
      const { data } = await axios.get(
        "https://apple-public.keys.appstoreconnect.apple.com/keys",
      );
      const appleKey = data.keys.find((k: any) => k.kid === header.kid);
      if (!appleKey)
        throw new Error(`Apple public key not found for kid: ${header.kid}`);
      publicKey = await importJWK(appleKey, "ES256");
      console.log("✅ Using Apple JWKS public key");
    } else {
      throw new Error("No valid public key source found (x5c or kid missing)");
    }

    const { payload } = await jwtVerify(signedPayload, publicKey);
    return payload;
  } catch (err) {
    console.error("⚠️ Failed to decode signed payload:", err);
    return null;
  }
}
export const planServices = {
  // async getPlans(payload: any) {
  //   const plans = await PlanModel.find();
  //   return { plans, features, regionalAccess };
  // },
  async create(data: any) {
    const {
      key,
      name,
      description,
      features = [],
      androidProductId,
      iosProductId,
      usdAmount,
      benefits,
      isActive = true,
      isFeatured = false,
      sortOrder = 0,
    } = data;

    // Validate required fields
    if (!key) {
      throw new ValidationError("Plan key is required");
    }

    if (!name || !name.en) {
      throw new ValidationError("Plan name (en) is required");
    }

    if (!description || !description.en) {
      throw new ValidationError("Plan description (en) is required");
    }

    if (!androidProductId) {
      throw new ValidationError("Android product ID is required");
    }

    if (!iosProductId) {
      throw new ValidationError("iOS product ID is required");
    }

    if (!usdAmount || usdAmount <= 0) {
      throw new ValidationError(
        "Valid USD amount is required (greater than 0)",
      );
    }

    if (!benefits) {
      throw new ValidationError("Benefits object is required");
    }

    // Validate key format
    const validKeys = ["basic", "elite", "prestige"];
    if (!validKeys.includes(key)) {
      throw new ValidationError(
        `Invalid plan key. Must be one of: ${validKeys.join(", ")}`,
      );
    }

    // Check if plan with same key already exists
    const existingPlan = await PlanModel.findOne({ key });
    if (existingPlan) {
      throw new DuplicateError(`Plan with key '${key}' already exists`);
    }

    // Check if product IDs are already in use
    const existingAndroidPlan = await PlanModel.findOne({ androidProductId });
    if (existingAndroidPlan) {
      throw new DuplicateError(
        `Android product ID '${androidProductId}' is already in use`,
      );
    }

    const existingIosPlan = await PlanModel.findOne({ iosProductId });
    if (existingIosPlan) {
      throw new DuplicateError(
        `iOS product ID '${iosProductId}' is already in use`,
      );
    }

    // Validate benefits structure
    if (typeof benefits !== "object") {
      throw new ValidationError("Benefits must be an object");
    }

    // Auto-generate features based on benefits if not provided
    const generatedFeatures = [];

    if (benefits.seeWhoLikedProfile) {
      generatedFeatures.push({
        en: "See who liked your profile",
      });
    }

    if (benefits.superLikesPerDay > 0) {
      generatedFeatures.push({
        en: benefits.unlimitedSuperLikesAndBoosts
          ? "Unlimited Super Likes"
          : `Send up to ${benefits.superLikesPerDay} Super Likes per day`,
      });
    }

    if (benefits.unlimitedSwipes) {
      generatedFeatures.push({
        en: "Unlock unlimited swipes",
      });
    }

    if (benefits.priorityVisibilityInMatches) {
      generatedFeatures.push({
        en: "Get priority visibility in matches",
      });
    }

    if (benefits.unlimitedMessagingWithMatches) {
      generatedFeatures.push({
        en: "Unlimited messaging with new matches",
      });
    }

    if (benefits.profileBoostPerWeek && benefits.profileBoostPerWeek > 0) {
      generatedFeatures.push({
        en: benefits.unlimitedSuperLikesAndBoosts
          ? "Unlimited profile boosts"
          : `Boost your profile ${
              benefits.profileBoostPerWeek === 1
                ? "once"
                : benefits.profileBoostPerWeek + " times"
            } a week`,
      });
    }

    if (benefits.exclusiveAccessToEvents) {
      generatedFeatures.push({
        en: "Exclusive access to trending events",
      });
    }

    if (benefits.directContactByOrganizers) {
      generatedFeatures.push({
        en: "Get matched directly by professional event organizers",
      });
    }

    if (benefits.directMessageWithoutMatching) {
      generatedFeatures.push({
        en: "Direct message without matching (limited per day)",
      });
    }

    if (benefits.vipInvitesToEvents) {
      generatedFeatures.push({
        en: "VIP invites to exclusive events",
      });
    }

    // Merge custom features with generated ones
    const allFeatures = [...generatedFeatures, ...features];

    // Create the plan document
    const planDoc = await PlanModel.create({
      key,
      name,
      description,
      features: allFeatures,
      androidProductId,
      iosProductId,
      unitAmounts: {
        usd: Math.round(usdAmount * 100),
      },
      displayPrice: {
        usd: `$${usdAmount.toFixed(2)}/month`,
      },
      benefits,
      isActive,
      isFeatured,
      sortOrder,
    });

    return planDoc;
  },

  /**
   * Update an existing subscription plan
   */
  async update(planId: string, data: any) {
    const {
      name,
      description,
      features,
      androidProductId,
      iosProductId,
      usdAmount,
      benefits,
      isActive,
      isFeatured,
      sortOrder,
    } = data;

    // Validate planId
    if (!planId) {
      throw new ValidationError("Plan ID is required");
    }

    // Validate MongoDB ObjectId format
    if (!planId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new ValidationError("Invalid plan ID format");
    }

    // Find the plan
    const plan = await PlanModel.findById(planId);
    if (!plan) {
      throw new NotFoundError(`Plan with ID '${planId}' not found`);
    }

    // Validate usdAmount if provided
    if (usdAmount !== undefined && usdAmount <= 0) {
      throw new ValidationError("USD amount must be greater than 0");
    }

    // Check for duplicate product IDs if updating
    if (androidProductId && androidProductId !== plan.androidProductId) {
      const existingAndroidPlan = await PlanModel.findOne({
        androidProductId,
        _id: { $ne: planId },
      });
      if (existingAndroidPlan) {
        throw new DuplicateError(
          `Android product ID '${androidProductId}' is already in use`,
        );
      }
    }

    if (iosProductId && iosProductId !== plan.iosProductId) {
      const existingIosPlan = await PlanModel.findOne({
        iosProductId,
        _id: { $ne: planId },
      });
      if (existingIosPlan) {
        throw new DuplicateError(
          `iOS product ID '${iosProductId}' is already in use`,
        );
      }
    }

    // Update fields if provided
    if (name) {
      if (!name.en) {
        throw new ValidationError("Plan name must include 'en' language");
      }
      plan.name = { ...plan.name, ...name };
    }

    if (description) {
      if (!description.en) {
        throw new ValidationError(
          "Plan description must include 'en' language",
        );
      }
      plan.description = { ...plan.description, ...description };
    }

    if (androidProductId) {
      plan.androidProductId = androidProductId;
    }

    if (iosProductId) {
      plan.iosProductId = iosProductId;
    }

    if (usdAmount) {
      plan.unitAmounts.usd = Math.round(usdAmount * 100);
      plan.displayPrice.usd = `$${usdAmount.toFixed(2)}/month`;
    }

    if (benefits) {
      plan.benefits = { ...plan.benefits, ...benefits };

      // Regenerate features based on updated benefits if features not explicitly provided
      if (!features) {
        const generatedFeatures = [];

        if (plan.benefits.seeWhoLikedProfile) {
          generatedFeatures.push({
            en: "See who liked your profile",
          });
        }

        if (plan.benefits.superLikesPerDay > 0) {
          generatedFeatures.push({
            en: plan.benefits.unlimitedSuperLikesAndBoosts
              ? "Unlimited Super Likes"
              : `Send up to ${plan.benefits.superLikesPerDay} Super Likes per day`,
          });
        }

        if (plan.benefits.unlimitedSwipes) {
          generatedFeatures.push({
            en: "Unlock unlimited swipes",
          });
        }

        if (plan.benefits.priorityVisibilityInMatches) {
          generatedFeatures.push({
            en: "Get priority visibility in matches",
          });
        }

        if (plan.benefits.unlimitedMessagingWithMatches) {
          generatedFeatures.push({
            en: "Unlimited messaging with new matches",
          });
        }

        if (
          plan.benefits.profileBoostPerWeek &&
          plan.benefits.profileBoostPerWeek > 0
        ) {
          generatedFeatures.push({
            en: plan.benefits.unlimitedSuperLikesAndBoosts
              ? "Unlimited profile boosts"
              : `Boost your profile ${
                  plan.benefits.profileBoostPerWeek === 1
                    ? "once"
                    : plan.benefits.profileBoostPerWeek + " times"
                } a week`,
          });
        }

        if (plan.benefits.exclusiveAccessToEvents) {
          generatedFeatures.push({
            en: "Exclusive access to trending events",
          });
        }

        if (plan.benefits.directContactByOrganizers) {
          generatedFeatures.push({
            en: "Get matched directly by professional event organizers",
          });
        }

        if (plan.benefits.directMessageWithoutMatching) {
          generatedFeatures.push({
            en: "Direct message without matching (limited per day)",
          });
        }

        if (plan.benefits.vipInvitesToEvents) {
          generatedFeatures.push({
            en: "VIP invites to exclusive events",
          });
        }

        plan.features = generatedFeatures;
      }
    }

    if (features) {
      if (!Array.isArray(features)) {
        throw new ValidationError("Features must be an array");
      }
      plan.features = features;
    }

    if (typeof isActive === "boolean") {
      plan.isActive = isActive;
    }

    if (typeof isFeatured === "boolean") {
      plan.isFeatured = isFeatured;
    }

    if (typeof sortOrder === "number") {
      plan.sortOrder = sortOrder;
    }

    await plan.save();
    return plan;
  },

  /**
   * Get all plans
   */
  async getAll(includeInactive = false) {
    const query = includeInactive ? {} : { isActive: true };
    return await PlanModel.find(query).sort({ sortOrder: 1 });
  },

  async handleInAppAndroidWebhook(payload: any, req: any) {
    const eventTime = Number(payload.eventTimeMillis);
    const packageName = payload.packageName;
    const subNotif = payload.subscriptionNotification;

    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT || "{}",
    );

    if (!subNotif) {
      console.error("No subscription notification in payload");
      return;
    }

    const { notificationType, purchaseToken, subscriptionId } = subNotif;

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const androidPublisher = google.androidpublisher({
      version: "v3",
      auth: auth,
    });

    const response = await androidPublisher.purchases.subscriptions.get({
      packageName: packageName,
      subscriptionId: subscriptionId,
      token: purchaseToken,
    });

    const userId = response.data.obfuscatedExternalAccountId;
    const sub = response.data;

    const planData = (await PlanModel.findOne({
      $or: [
        {
          androidProductId: subscriptionId,
        },
        {
          iosProductId: subscriptionId,
        },
      ],
    })) as any;

    if (!planData) {
      // throw new Error("planNotFound");
      console.warn("Plan not found for subscription ID:", subscriptionId);
    }

    const {
      startTimeMillis,
      expiryTimeMillis,
      priceCurrencyCode,
      priceAmountMicros,
      paymentState,
      orderId,
    } = sub as any;

    let data;

    console.log(response.data);

    // Notification type ke base pe action log karo
    let actionMessage = "";
    switch (notificationType) {
      case 1:
        actionMessage =
          "SUBSCRIPTION_RECOVERED - Subscription account hold se recover ho gayi ya pause se resume hui";
        data = await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              amount: priceAmountMicros / 1000000,
              currentPeriodStart: startTimeMillis
                ? new Date(Number(startTimeMillis))
                : null,
              currentPeriodEnd: expiryTimeMillis
                ? new Date(Number(expiryTimeMillis))
                : null,
              currency: priceCurrencyCode.toLowerCase(),
              planId: planData._id,
              status: "active",
            },
          },
          { new: true },
        );

        if (data?.userId) {
          const originalAmount = priceAmountMicros / 1000000; // convert micros → base currency
          const convertedAmountGBP = originalAmount;
          await TransactionModel.create({
            userId: data.userId,
            planId: planData._id,
            status: "succeeded",
            amount: convertedAmountGBP,
            currency: priceCurrencyCode.toLowerCase(),
            paidAt: new Date(eventTime) ?? new Date(),
          });
          // await usersModel.findByIdAndUpdate(data.userId, {
          //   $set: { hasUsedTrial: true },
          // });
          // await NotificationService(
          //   [data?.userId] as any,
          //   "SUBSCRIPTION_RENEWED",
          //   data?._id as ObjectId
          // );
        }
        break;
      case 2:
        actionMessage =
          "SUBSCRIPTION_RENEWED - Active subscription renew ho gayi (payment successful)";
        data = await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              amount: priceAmountMicros / 1000000,
              currentPeriodStart: startTimeMillis
                ? new Date(Number(startTimeMillis))
                : null,
              currentPeriodEnd: expiryTimeMillis
                ? new Date(Number(expiryTimeMillis))
                : null,
              currency: priceCurrencyCode.toLowerCase(),
              planId: planData._id,
              status: "active",
            },
          },
          { new: true },
        );

        if (data?.userId) {
          const originalAmount = priceAmountMicros / 1000000; // convert micros → base currency
          const convertedAmountGBP = originalAmount;
          await TransactionModel.create({
            userId: data.userId,
            planId: planData._id,
            status: "succeeded",
            amount: convertedAmountGBP,
            currency: priceCurrencyCode.toLowerCase(),
            paidAt: new Date(eventTime) ?? new Date(),
          });
          // await usersModel.findByIdAndUpdate(data.userId, {
          //   $set: { hasUsedTrial: true },
          // });
          // await NotificationService(
          //   [data?.userId] as any,
          //   "SUBSCRIPTION_RENEWED",
          //   data?._id as ObjectId
          // );
        }

        break;
      case 3:
        actionMessage =
          "SUBSCRIPTION_CANCELED - Subscription cancel ho gayi (user ne voluntarily/involuntarily cancel ki)";
        data = await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              status: "canceling",
            },
          },
          { new: true },
        );
        if (data?.userId) {
          // await NotificationService(
          //   [data?.userId] as any,
          //   "SUBSCRIPTION_CANCELLED",
          //   data?._id as ObjectId
          // );
        }

        break;
      case 4:
        actionMessage =
          "SUBSCRIPTION_PURCHASED - Naya subscription purchase ho gaya";

        await SubscriptionModel.findOneAndUpdate(
          {
            userId,
          },
          {
            $set: {
              deviceType: "ANDROID",
              subscriptionId,
              amount:
                paymentState === 2
                  ? 0
                  : paymentState === 1
                    ? priceAmountMicros / 1000000
                    : 0,
              currentPeriodStart:
                paymentState === 1 ? new Date(Number(startTimeMillis)) : null,
              currentPeriodEnd:
                paymentState === 1 ? new Date(Number(expiryTimeMillis)) : null,
              startDate: startTimeMillis
                ? new Date(Number(startTimeMillis))
                : null,
              // trialStart:
              //   paymentState === 2 ? new Date(Number(startTimeMillis)) : null,
              // trialEnd:
              //   paymentState === 2 ? new Date(Number(expiryTimeMillis)) : null,
              currency: priceCurrencyCode.toLowerCase(),
              planId: planData._id,
              status:
                paymentState === 2
                  ? "trialing"
                  : paymentState === 1
                    ? "active"
                    : "incomplete",
            },
          },
          {
            upsert: true,
          },
        );

        break;
      case 5:
        actionMessage =
          "SUBSCRIPTION_ON_HOLD - Subscription account hold pe chali gayi (payment issue)";
        break;
      case 6:
        actionMessage =
          "SUBSCRIPTION_IN_GRACE_PERIOD - Grace period mein enter ho gayi (trial/renewal delay)";

        data = await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              status: "past_due",
            },
          },
          { new: true },
        );
        if (data?.userId) {
          // await NotificationService(
          //   [data?.userId] as any,
          //   "SUBSCRIPTION_FAILED",
          //   data?._id as ObjectId
          // );
        }
        break;
      case 7:
        actionMessage =
          "SUBSCRIPTION_RESTARTED - User ne canceled subscription ko restore kar liya (Play > Account > Subscriptions se)";
        data = await SubscriptionModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              amount: priceAmountMicros / 1000000,
              currentPeriodStart: startTimeMillis
                ? new Date(Number(startTimeMillis))
                : null,
              currentPeriodEnd: expiryTimeMillis
                ? new Date(Number(expiryTimeMillis))
                : null,
              currency: priceCurrencyCode.toLowerCase(),
              planId: planData._id,
              status: "active",
            },
          },
          { new: true },
        );

        if (data?.userId) {
          const originalAmount = priceAmountMicros / 1000000; // convert micros → base currency
          const convertedAmountGBP = originalAmount;
          await TransactionModel.findOneAndUpdate({
            userId: data.userId,
            planId: planData._id,
            status: "succeeded",
            amount: convertedAmountGBP,
            currency: priceCurrencyCode.toLowerCase(),
            paidAt: new Date(eventTime) ?? new Date(),
          });
          // await usersModel.findByIdAndUpdate(data.userId, {
          //   $set: { hasUsedTrial: true },
          // });
          // await NotificationService(
          //   [data?.userId] as any,
          //   "SUBSCRIPTION_RENEWED",
          //   data?._id as ObjectId
          // );
        }

        break;
      case 8:
        actionMessage =
          "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED (DEPRECATED) - User ne price change confirm kar liya";
        break;
      case 9:
        actionMessage =
          "SUBSCRIPTION_DEFERRED - Subscription ka recurrence time extend ho gaya (future date pe shift)";
        break;
      case 10:
        actionMessage =
          "SUBSCRIPTION_PAUSED - User ne subscription pause kar di";
        break;
      case 11:
        actionMessage =
          "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED - Pause schedule change ho gaya";
        break;
      case 12:
        actionMessage =
          "SUBSCRIPTION_REVOKED - Subscription user se revoke ho gayi (refund/chargeback se pehle expire)";
        break;
      case 13:
        actionMessage =
          "SUBSCRIPTION_EXPIRED - Subscription expire ho gayi, ab inactive hai";

        if (
          response?.data?.cancelReason &&
          response?.data?.cancelReason === 2
        ) {
          break;
        } else {
          data = await SubscriptionModel.findOneAndUpdate(
            { userId },
            {
              $set: {
                status: "canceled",
              },
            },
          ).lean();

          if (data?.userId) {
            // await usersModel.findByIdAndUpdate(data.userId, {
            //   $set: { hasUsedTrial: true },
            // });
          }
        }

        break;
      case 19:
        actionMessage =
          "SUBSCRIPTION_PRICE_CHANGE_UPDATED - Subscription item ka price change details update ho gaye";
        break;
      case 20:
        actionMessage =
          "SUBSCRIPTION_PENDING_PURCHASE_CANCELED - Pending subscription transaction cancel ho gaya";
        break;
      case 22:
        actionMessage =
          "SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED - Price step-up ke liye user consent diya ya period shuru hua";
        break;
      default:
        actionMessage = `UNKNOWN_TYPE_${notificationType} - Google docs check karo latest ke liye`;
    }

    console.log("🚨 ACTION:", actionMessage);
    console.log("--- Subscription Status Update Complete ---");

    // Yahan MongoDB logic add karo based on type, e.g.:
    // if (notificationType === 13) {
    //   await db.collection('users').updateOne({ purchaseToken }, { $set: { subscriptionStatus: 'expired', expiredAt: new Date() } });
    // } else if (notificationType === 1) {
    //   await db.collection('users').updateOne({ purchaseToken }, { $set: { subscriptionStatus: 'active', renewedAt: new Date() } });
    // }
    // ... etc. for other types
  },

  async handleInAppIOSWebhook(payload: any, req: any, res: any) {
    try {
      const webHookData = payload?.data;
      console.log('payload:', payload);

      const environment =
        webHookData?.environment || payload?.environment || "Production";

      if (environment !== "Sandbox") {
        return res.status(200).json({
          received: true,
          warning: "Invalid environment",
        });
      }

      console.log(
        `[iOS WEBHOOK] Environment: ${environment}, Type: ${payload?.notificationType}`,
      );

      const [transactionInfo, renewalInfo] = await Promise.all([
        webHookData.signedTransactionInfo
          ? decodeSignedPayload(webHookData.signedTransactionInfo)
          : null,
        webHookData.signedRenewalInfo
          ? decodeSignedPayload(webHookData.signedRenewalInfo)
          : null,
      ]);

      const notificationType = payload?.notificationType;
      const subtype = payload?.subtype;

      const productId =
        renewalInfo?.autoRenewProductId || transactionInfo?.productId;

      const originalTransactionId =
        transactionInfo?.originalTransactionId ||
        renewalInfo?.originalTransactionId;

      const transactionId = transactionInfo?.transactionId;
      const priceMicros = renewalInfo?.renewalPrice ?? transactionInfo?.price;
      const currency =
        (transactionInfo?.currency as string) ||
        (renewalInfo?.currency as string);

      const purchaseDate = transactionInfo?.purchaseDate as Date;
      const expiresDate = transactionInfo?.expiresDate as Date;

      const appAccountToken =
        transactionInfo?.appAccountToken || renewalInfo?.appAccountToken;

      const existingSubscription = await SubscriptionModel.findOne({
        orderId: originalTransactionId,
      });

      if (!existingSubscription) {
        console.warn(
          `⚠️ iOS Webhook for unknown subscription: ${originalTransactionId}`,
        );
        return res.status(200).json({
          received: true,
          warning: "Subscription not found",
        });
      }

      const [userData, planData] = await Promise.all([
        usersModel.findById(existingSubscription.userId),
        PlanModel.findOne({
          $or: [{ androidProductId: productId }, { iosProductId: productId }],
        }),
      ]);

      if (!planData)
        return res.status(200).json({
          received: true,
          warning: "Plan not found",
        });

      const userId = userData?._id ?? null;
      const amountBase =
        typeof priceMicros === "number" ? priceMicros / 1000 : 0;
      const linkedPurchaseToken = originalTransactionId;

      let data: any = null;

      // console.log(
      //   `[${notificationType}]`,
      //   `Subtype: ${subtype || "None"}`,
      //   `Env: ${environment}`,
      //   `Price: ${amountBase}`,
      //   `UserId: ${userId || "Not Present"}`,
      //   `User: ${userData?.fullName || ""}`
      // );

      switch (notificationType) {
        case "SUBSCRIBED":
        case "DID_CHANGE_RENEWAL_PREF":
          if (subtype === "RESUBSCRIBE") {
            const existingSubscription = await SubscriptionModel.findOne({
              userId: userId,
              environment,
            });

            if (!existingSubscription) {
              break;
            } else {
              data = await SubscriptionModel.findByIdAndUpdate(
                existingSubscription._id,
                {
                  $set: {
                    subscriptionId: productId,
                    amount: amountBase ?? 0,
                    currentPeriodStart: purchaseDate,
                    currentPeriodEnd: expiresDate,
                    currency: currency.toLowerCase(),
                    planId: planData._id,
                    status: "active",
                    environment: environment,
                  },
                },
                { new: true },
              );

              console.log(
                `✅ Reactivated subscription ${existingSubscription._id}`,
              );
            }

            // Handle notifications and transactions
            if (userId) {
              await TransactionModel.create({
                orderId: transactionId,
                userId: userId,
                planId: planData._id,
                status: "succeeded",
                amount: amountBase,
                currency: currency.toLowerCase(),
                paidAt: new Date(purchaseDate) ?? new Date(),
                environment: environment,
              });
              // await usersModel.findByIdAndUpdate(userId, {
              //   $set: { hasUsedTrial: true },
              // });

              // await NotificationService(
              //   [userId] as any,
              //   "SUBSCRIPTION_RENEWED",
              //   existingSubscription._id as any
              // );
            }

            break; // Exit switch after handling RESUBSCRIBE
          }

          if (subtype === "INITIAL_BUY") {
            // const data = await SubscriptionModel.create({
            //   orderId: linkedPurchaseToken,
            //   userId: userId,
            //   deviceType: "IOS",
            //   subscriptionId: productId,
            //   amount: 0,
            //   currentPeriodStart: null,
            //   currentPeriodEnd: null,
            //   startDate: purchaseDate,
            //   trialStart: purchaseDate,
            //   trialEnd: expiresDate,
            //   currency: currency,
            //   planId: planData._id,
            //   status: "trialing",
            //   environment: environment,
            // });

            if (userId) {
              // await NotificationService(
              //   [userId as any],
              //   "FREETRIAL_STARTED",
              //   data._id as Types.ObjectId
              // );
            }

            break; // Exit switch after handling INITIAL_BUY
          }
          break;

        case "DID_RENEW":
          const subscriptionToRenew = await SubscriptionModel.findOne({
            userId: userId,
            environment,
          });

          if (!subscriptionToRenew) {
            console.warn(
              `⚠️ DID_RENEW for unknown subscription: ${linkedPurchaseToken}`,
            );
            break;
          }

          if (subscriptionToRenew.status === "canceled") {
            console.warn(
              `⚠️ Ignoring renewal for canceled subscription: ${linkedPurchaseToken}`,
            );
            break;
          }

          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            {
              $set: {
                amount: amountBase ?? 0,
                currentPeriodStart: purchaseDate
                  ? new Date(Number(purchaseDate))
                  : null,
                currentPeriodEnd: expiresDate
                  ? new Date(Number(expiresDate))
                  : null,
                currency: currency.toLowerCase() || "usd",
                planId: planData._id,
                subscriptionId: productId,
                status: "active",
                // trialStart: null,
                // trialEnd: null,
                environment: environment,
              },
            },
            { new: true },
          );

          if (data?.userId) {
            await TransactionModel.create({
              userId: data.userId,
              orderId: transactionId,
              planId: planData._id,
              status: "succeeded",
              amount: amountBase,
              currency: currency.toLowerCase(),
              paidAt: new Date(purchaseDate) ?? new Date(),
              environment: environment,
            });

            // await usersModel.findByIdAndUpdate(data.userId, {
            //   $set: { hasUsedTrial: true },
            // });

            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_RENEWED",
            //   data._id as any
            // );
          }
          break;

        case "DID_FAIL_TO_RENEW":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            { $set: { status: "past_due" } },
            { new: true },
          );
          if (data?.userId) {
            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_FAILED",
            //   data._id as any
            // );
          }
          break;

        case "REVOKE":
        case "EXPIRED":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            { $set: { status: "canceled" } },
            { new: true },
          );
          if (data?.userId) {
            // await usersModel.findByIdAndUpdate(data.userId, {
            //   $set: { hasUsedTrial: true },
            // });
            // await TokenModel.findOneAndDelete({ userId: data.userId });
            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_CANCELLED",
            //   data._id as any
            // );
          }
          break;

        case "REFUND":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            { $set: { status: "canceled" } },
            { new: true },
          );

          if (data?.userId) {
            await TransactionModel.findOneAndUpdate(
              { orderId: transactionId, userId: data.userId },
              { $set: { status: "refunded" } },
            );

            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_CANCELLED",
            //   data._id as any
            // );
          }
          break;

        case "DID_CHANGE_RENEWAL_STATUS":
          if (subtype === "AUTO_RENEW_DISABLED") {
            data = await SubscriptionModel.findOneAndUpdate(
              { userId: userId, environment },
              { $set: { status: "canceling" } },
              { new: true },
            );

            if (data?.userId) {
              // await NotificationService(
              //   [data.userId] as any,
              //   "SUBSCRIPTION_CANCELLED",
              //   data._id as any
              // );
            }
          } else if (subtype === "AUTO_RENEW_ENABLED") {
            data = await SubscriptionModel.findOneAndUpdate(
              { userId: userId, environment },
              { $set: { status: "active" } },
              { new: true },
            );
          }
          break;

        case "DID_RECOVER":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            {
              $set: {
                status: "active",
                currentPeriodStart: purchaseDate,
                currentPeriodEnd: expiresDate,
                environment: environment,
              },
            },
            { new: true },
          );

          if (data?.userId) {
            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_RENEWED",
            //   data._id as any
            // );
          }
          break;

        case "TEST":
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("Error handling iOS webhook:", err);
      return;
    }
  },
  async handleInAppIOSWebhookProduction(payload: any, req: any, res: any) {
    try {
      const webHookData = payload?.data;

      const environment =
        webHookData?.environment || payload?.environment || "Production";

      if (environment !== "Production") {
        return res.status(200).json({
          received: true,
          warning: "Invalid environment",
        });
      }

      // console.log(
      //   `[iOS WEBHOOK] Environment: ${environment}, Type: ${payload?.notificationType}`
      // );

      const [transactionInfo, renewalInfo] = await Promise.all([
        webHookData.signedTransactionInfo
          ? decodeSignedPayload(webHookData.signedTransactionInfo)
          : null,
        webHookData.signedRenewalInfo
          ? decodeSignedPayload(webHookData.signedRenewalInfo)
          : null,
      ]);

      const notificationType = payload?.notificationType;
      const subtype = payload?.subtype;

      const productId =
        renewalInfo?.autoRenewProductId || transactionInfo?.productId;

      const originalTransactionId =
        transactionInfo?.originalTransactionId ||
        renewalInfo?.originalTransactionId;

      const transactionId = transactionInfo?.transactionId;
      const priceMicros = renewalInfo?.renewalPrice ?? transactionInfo?.price;
      const currency =
        (transactionInfo?.currency as string) ||
        (renewalInfo?.currency as string);

      const purchaseDate = transactionInfo?.purchaseDate as Date;
      const expiresDate = transactionInfo?.expiresDate as Date;

      const appAccountToken =
        transactionInfo?.appAccountToken || renewalInfo?.appAccountToken;

      const existingSubscription = await SubscriptionModel.findOne({
        orderId: originalTransactionId,
      });

      const [userData, planData] = await Promise.all([
        usersModel.findOne({ uuid: appAccountToken }),
        PlanModel.findOne({
          $or: [{ androidProductId: productId }, { iosProductId: productId }],
        }),
      ]);

      if (!planData)
        return res.status(200).json({
          received: true,
          warning: "Plan not found",
        });

      const userId = userData?._id ?? null;
      const amountBase =
        typeof priceMicros === "number" ? priceMicros / 1000 : 0;
      const linkedPurchaseToken = originalTransactionId;

      let data: any = null;

      console.log(
        `[${notificationType}]`,
        `Subtype: ${subtype || "None"}`,
        `Env: ${environment}`,
        `Price: ${amountBase}`,
        `UserId: ${userId || "Not Present"}`,
        `User: ${userData?.userName || ""}`,
      );

      switch (notificationType) {
        case "SUBSCRIBED":
        case "DID_CHANGE_RENEWAL_PREF":
          if (subtype === "RESUBSCRIBE") {
            const existingSubscription = await SubscriptionModel.findOne({
              userId: userId,
              environment,
            });

            if (!existingSubscription) {
              break;
            } else {
              data = await SubscriptionModel.findByIdAndUpdate(
                existingSubscription._id,
                {
                  $set: {
                    subscriptionId: productId,
                    amount: amountBase ?? 0,
                    currentPeriodStart: purchaseDate,
                    currentPeriodEnd: expiresDate,
                    currency: currency.toLowerCase(),
                    planId: planData._id,
                    status: "active",
                    // trialStart: null,
                    // trialEnd: null,
                    environment: environment,
                  },
                },
                { new: true },
              );

              console.log(
                `✅ Reactivated subscription ${existingSubscription._id}`,
              );
            }

            // Handle notifications and transactions
            if (userId) {
              await TransactionModel.create({
                orderId: transactionId,
                userId: userId,
                planId: planData._id,
                status: "succeeded",
                amount: amountBase,
                currency: currency.toLowerCase(),
                paidAt: new Date(purchaseDate) ?? new Date(),
                environment: environment,
              });
              // await usersModel.findByIdAndUpdate(userId, {
              //   $set: { hasUsedTrial: true },
              // });

              // await NotificationService(
              //   [userId] as any,
              //   "SUBSCRIPTION_RENEWED",
              //   existingSubscription._id as any
              // );
            }

            break; // Exit switch after handling RESUBSCRIBE
          }

          if (subtype === "INITIAL_BUY") {
            // const data = await SubscriptionModel.create({
            //   orderId: linkedPurchaseToken,
            //   userId: userId,
            //   deviceType: "IOS",
            //   subscriptionId: productId,
            //   amount: 0,
            //   currentPeriodStart: null,
            //   currentPeriodEnd: null,
            //   startDate: purchaseDate,
            //   trialStart: purchaseDate,
            //   trialEnd: expiresDate,
            //   currency: currency,
            //   planId: planData._id,
            //   status: "trialing",
            //   environment: environment,
            // });

            // if (userId) {
            //   await NotificationService(
            //     [userId as any],
            //     "FREETRIAL_STARTED",
            //     data._id as Types.ObjectId
            //   );
            // }

            break; // Exit switch after handling INITIAL_BUY
          }
          break;

        case "DID_RENEW":
          const subscriptionToRenew = await SubscriptionModel.findOne({
            userId: userId,
            environment,
          });

          if (!subscriptionToRenew) {
            console.warn(
              `⚠️ DID_RENEW for unknown subscription: ${linkedPurchaseToken}`,
            );
            break;
          }

          if (subscriptionToRenew.status === "canceled") {
            console.warn(
              `⚠️ Ignoring renewal for canceled subscription: ${linkedPurchaseToken}`,
            );
            break;
          }

          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            {
              $set: {
                amount: amountBase ?? 0,
                currentPeriodStart: purchaseDate
                  ? new Date(Number(purchaseDate))
                  : null,
                currentPeriodEnd: expiresDate
                  ? new Date(Number(expiresDate))
                  : null,
                currency: currency.toLowerCase() || "usd",
                planId: planData._id,
                subscriptionId: productId,
                status: "active",
                // trialStart: null,
                // trialEnd: null,
                environment: environment,
              },
            },
            { new: true },
          );

          if (data?.userId) {
            await TransactionModel.create({
              userId: data.userId,
              orderId: transactionId,
              planId: planData._id,
              status: "succeeded",
              amount: amountBase,
              currency: currency.toLowerCase(),
              paidAt: new Date(purchaseDate) ?? new Date(),
              environment: environment,
            });

            // await usersModel.findByIdAndUpdate(data.userId, {
            //   $set: { hasUsedTrial: true },
            // });

            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_RENEWED",
            //   data._id as any
            // );
          }
          break;

        case "DID_FAIL_TO_RENEW":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            { $set: { status: "past_due" } },
            { new: true },
          );
          if (data?.userId) {
            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_FAILED",
            //   data._id as any
            // );
          }
          break;

        case "REVOKE":
        case "EXPIRED":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            { $set: { status: "canceled" } },
            { new: true },
          );
          if (data?.userId) {
            // await usersModel.findByIdAndUpdate(data.userId, {
            //   $set: { hasUsedTrial: true },
            // });
            // await TokenModel.findOneAndDelete({ userId: data.userId });
            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_CANCELLED",
            //   data._id as any
            // );
          }
          break;

        case "REFUND":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            { $set: { status: "canceled" } },
            { new: true },
          );

          if (data?.userId) {
            await TransactionModel.findOneAndUpdate(
              { orderId: transactionId, userId: data.userId },
              { $set: { status: "refunded" } },
            );

            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_CANCELLED",
            //   data._id as any
            // );
          }
          break;

        case "DID_CHANGE_RENEWAL_STATUS":
          if (subtype === "AUTO_RENEW_DISABLED") {
            data = await SubscriptionModel.findOneAndUpdate(
              { userId: userId, environment },
              { $set: { status: "canceling" } },
              { new: true },
            );

            if (data?.userId) {
              // await NotificationService(
              //   [data.userId] as any,
              //   "SUBSCRIPTION_CANCELLED",
              //   data._id as any
              // );
            }
          } else if (subtype === "AUTO_RENEW_ENABLED") {
            data = await SubscriptionModel.findOneAndUpdate(
              { userId: userId, environment },
              { $set: { status: "active" } },
              { new: true },
            );
          }
          break;

        case "DID_RECOVER":
          data = await SubscriptionModel.findOneAndUpdate(
            { userId: userId, environment },
            {
              $set: {
                status: "active",
                currentPeriodStart: purchaseDate,
                currentPeriodEnd: expiresDate,
                environment: environment,
              },
            },
            { new: true },
          );

          if (data?.userId) {
            // await NotificationService(
            //   [data.userId] as any,
            //   "SUBSCRIPTION_RENEWED",
            //   data._id as any
            // );
          }
          break;

        case "TEST":
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("Error handling iOS webhook:", err);
      return;
    }
  },
};
export const validateIosReceipt = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { receiptData } = req.body;

    // console.log(receiptData);

    if (!receiptData) {
      return res.status(400).json({ message: "receiptMissing" });
    }

    const result = await validateStoreKit2JWS(receiptData);

    const {
      transactionId,
      originalTransactionId,
      productId,
      purchaseDate,
      expiresDate,
      environment,
      currency,
      isTrial,
      price,
      transactionReason,
    } = result.data;

    const issuerId = process.env.APPLE_ISSUER_ID || "";
    const keyId = process.env.APPLE_KEY_ID || "";
    const bundleId = process.env.APPLE_BUNDEL_ID || "";
    const signingKey = process.env.APPLE_PRIVATE_KEY || "";
    const environmentUsed =
      environment === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;

    const client = new AppStoreServerAPIClient(
      signingKey,
      keyId,
      issuerId,
      bundleId,
      environmentUsed,
    );

    let response: any = null;
    let transactions: string[] = [];

    const transactionHistoryRequest: TransactionHistoryRequest = {
      sort: Order.ASCENDING,
      revoked: false,
      productTypes: [ProductType.AUTO_RENEWABLE],
    };

    do {
      if (!response) {
        // FIRST request: DO NOT pass revision at all
        response = await client.getTransactionHistory(
          originalTransactionId,
          null,
          transactionHistoryRequest,
          GetTransactionHistoryVersion.V2,
        );
      } else {
        // SUBSEQUENT requests: pass the received revision
        response = await client.getTransactionHistory(
          originalTransactionId,
          response.revision,
          transactionHistoryRequest,
          GetTransactionHistoryVersion.V2,
        );
      }

      if (response.signedTransactions) {
        transactions.push(...response.signedTransactions);
      }
    } while (response.hasMore);

    console.log(transactions);
    console.log(
      "xxxxxxx---xxxxxxxx",
      response,
      transactions,
      "xxxxxxx---xxxxxxxx",
    );

    const decodedTransactions = [];

    for (const signedTx of transactions) {
      const decoded = await validateStoreKit2JWS(signedTx);
      decodedTransactions.push(decoded);
    }

    console.log("Decoded Transactions:", decodedTransactions);

    const latest: any = decodedTransactions.sort(
      (a: any, b: any) => b.data.purchaseDate - a.data.purchaseDate,
    )[0];

    console.log("XXXXX", latest, "xxxxxx");

    if (!latest.valid) {
      throw new Error("Invalid Receipt");
    }

    const planData = await PlanModel.findOne({
      iosProductId: latest.data.productId,
    });

    if (!planData) {
      throw new Error("No Plan Found");
    }

    const userId = user.id;

    const checkExist = await SubscriptionModel.findOne({ userId });

    if (latest.data.price === 0 && !checkExist) {
      await SubscriptionModel.create({
        userId,
        subscriptionId: latest.data.productId,
        planId: planData._id,
        deviceType: "IOS",
        orderId: originalTransactionId,
        amount: latest.data.price / 1000 || 0, // Apple doesn't give price in receipt
        currency: currency.toLowerCase(),
        status: "active",
        currentPeriodStart: new Date(latest.data.purchaseDate),
        currentPeriodEnd: new Date(latest.data.purchaseDate),
        // trialStart: new Date(latest.data.purchaseDate),
        // trialEnd: new Date(latest.data.expiresDate),
        environment: latest.data.environment,
      });
    } else {
      if (latest.data.expiresDate > new Date()) {
        await SubscriptionModel.findOneAndUpdate(
          { userId, environment: latest.data.environment },
          {
            $set: {
              subscriptionId: latest.data.productId,
              planId: planData._id,
              orderId: originalTransactionId,
              deviceType: "IOS",
              currentPeriodStart: new Date(latest.data.purchaseDate),
              currentPeriodEnd: new Date(latest.data.expiresDate),
              status:
                latest.data.expiresDate > new Date()
                  ? "active"
                  : checkExist?.status,
              trialStart: null,
              trialEnd: null,
              currency: currency.toLowerCase(),
              amount: latest.data.price / 1000,
              environment: environment,
            },
          },
          { new: true, upsert: true },
        );
      } else {
        throw new Error("No Plan Found");
      }
    }

    return res.status(200).json({
      message: "receiptValid",
    });

    // // STEP 4: Create or update subscription
    // const existingSub = await SubscriptionModel.findOne({
    //   orderId: originalTransactionId,
    // });

    // let subscription;
    // if (!existingSub && isTrial) {
    //   // create new subscription
    //   subscription = await SubscriptionModel.create({
    //     userId,
    //     subscriptionId: productId,
    //     planId: planData._id,
    //     deviceType: "IOS",
    //     orderId: originalTransactionId,
    //     amount: 0, // Apple doesn't give price in receipt
    //     currency: currency.toLowerCase(),
    //     status: "trialing",
    //     currentPeriodStart: purchaseDate,
    //     currentPeriodEnd: expiresDate,
    //     trialStart: purchaseDate,
    //     trialEnd: expiresDate,
    //     environment: environment,
    //   });

    //   return res.status(200).json({
    //     message: "receiptValid",
    //     subscription,
    //   });
    // } else if (
    //   transactionReason === "PURCHASE" &&
    //   (existingSub?.status === "canceled" ||
    //     existingSub?.status === "active") &&
    //   existingSub?.userId === userId
    // ) {
    //   // update existing subscription
    //   subscription = await SubscriptionModel.findOneAndUpdate(
    //     { userId },
    //     {
    //       $set: {
    //         subscriptionId: productId,
    //         planId: planData._id,
    //         currentPeriodStart: purchaseDate,
    //         currentPeriodEnd: expiresDate,
    //         status: expiresDate > new Date() ? "active" : "past_due",
    //         trialStart: null,
    //         trialEnd: null,
    //         currency: currency.toLowerCase(),
    //         price: price / 1000,
    //         environment: environment,
    //       },
    //     },
    //     { new: true }
    //   );

    //   return res.status(200).json({
    //     message: "receiptValid",
    //     subscription,
    //   });
    // } else if (existingSub && existingSub?.userId !== userId) {
    //   throw Error("Subscription belongs to another account");
    // } else {
    //   throw Error("No Active Subscription Found");
    // }
  } catch (err: any) {
    if (err.message) {
      return BADREQUEST(res, err.message, req.body.language || "en");
    }
    return INTERNAL_SERVER_ERROR(res, req.body.language || "en");
  }
};
