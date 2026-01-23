import { Request, Response, NextFunction } from "express";
import { ReferralClickModel } from "src/models/referalclick/referal-click-schema";
import { ReferralCodeModel } from "src/models/referalcode/referal-schema";

export default async function referralClickMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Only record clicks for POST requests (frontend can send referral code on actions)
    if (req.method !== "POST") return next();

    // If user is authenticated and has a referredBy reference, prefer that code
    let resolvedCode: string | undefined;
    let resolvedReferralId: any = undefined;
    let userId: any = undefined;

    try {
      const user = (req as any).user;
      if (user) {
        userId = user._id || user.id || null;
        const referredBy = user.referredBy || user.referredby || user.referred;
        if (referredBy) {
          try {
            const doc =
              await ReferralCodeModel.findById(referredBy).select("code");
            if (doc) {
              resolvedCode = doc.code;
              resolvedReferralId = doc._id;
            }
          } catch (err) {
            // ignore
          }
        }
      }
    } catch (err) {
      // ignore
    }

    // fallback to code provided in header/query/body
    const providedCode =
      (req.headers["x-referral-code"] as string) ||
      (req.query && (req.query.ref as string)) ||
      (req.query && (req.query.referral as string)) ||
      (req.body && (req.body.referralCode || req.body.ref || req.body.code));

    const codeToRecord =
      resolvedCode ||
      (typeof providedCode === "string" ? providedCode : undefined);

    if (!codeToRecord) return next();

    // If we only have a provided code, try to resolve referral doc id
    if (!resolvedReferralId && providedCode) {
      try {
        const referralDoc = await ReferralCodeModel.findOne({
          code: providedCode,
        }).select("_id");
        if (referralDoc) resolvedReferralId = referralDoc._id;
      } catch (err) {
        // ignore
      }
    }

    await ReferralClickModel.create({
      code: codeToRecord,
      referralCode: resolvedReferralId,
      user: userId,
      ip: req.ip || (req.headers["x-forwarded-for"] as string) || "",
      userAgent: req.headers["user-agent"] || "",
    });
  } catch (err) {
    // swallow errors to avoid breaking existing routes
    console.warn(
      "referralClickMiddleware error:",
      (err as Error).message || err,
    );
  }

  return next();
}
