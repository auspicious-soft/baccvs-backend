import { Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { LikeProductsModel } from "src/models/likeProducts/likeProductsModel";
import Stripe from "stripe";


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// export const loginService = async (payload: any, res: Response) => {
//     const { username, password } = payload;
//     const countryCode = "+45"; 
//     const toNumber = Number(username);
//     const isEmail = isNaN(toNumber); 
//     let user: any = null;

//     if (isEmail) {

//         user = await adminModel.findOne({ email: username }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ email: username }).select('+password');
//         }
//     } else {

//         const formattedPhoneNumber = `${countryCode}${username}`;
//         user = await adminModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         }
//     }

//     if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//         return errorResponseHandler('Invalid password', httpStatusCode.UNAUTHORIZED, res);
//     }
//     const userObject = user.toObject();
//     delete userObject.password;

//     return {
//         success: true,
//         message: "Login successful",
//         data: {
//             user: userObject,
//         },
//     };
// };


// export const forgotPasswordService = async (payload: any, res: Response) => {
//     const { username } = payload;
//     const countryCode = "+45";
//     const toNumber = Number(username);
//     const isEmail = isNaN(toNumber);
//     let user: any = null;
//     if (isEmail) {
   
//         user = await adminModel.findOne({ email: username }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ email: username }).select('+password');
//         }
//         if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
     
//         const passwordResetToken = await generatePasswordResetToken(username);
//         if (passwordResetToken) {
//             await sendPasswordResetEmail(username, passwordResetToken.token);
//             return { success: true, message: "Password reset email sent with OTP" };
//         }
//     } else {
//         const formattedPhoneNumber = `${countryCode}${username}`;
//         user = await adminModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         }
//         if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
       
//         const passwordResetTokenBySms = await generatePasswordResetTokenByPhone(formattedPhoneNumber);
//         if (passwordResetTokenBySms) {
//             await generatePasswordResetTokenByPhoneWithTwilio(formattedPhoneNumber, passwordResetTokenBySms.token);
//             return { success: true, message: "Password reset SMS sent with OTP" };
//         }
//     }

//     return errorResponseHandler('Failed to generate password reset token', httpStatusCode.INTERNAL_SERVER_ERROR, res);
// };


// export const newPassswordAfterOTPVerifiedService = async (payload: { password: string, otp: string }, res: Response) => {
//     // console.log('payload: ', payload);
//     const { password, otp } = payload

//     const existingToken = await getPasswordResetTokenByToken(otp)
//     if (!existingToken) return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res)

//     const hasExpired = new Date(existingToken.expires) < new Date()
//     if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res)

//         let existingAdmin:any;

//         if (existingToken.email) {
//           existingAdmin = await adminModel.findOne({ email: existingToken.email });
//         } 
//         else if (existingToken.phoneNumber) {
//           existingAdmin = await adminModel.findOne({ phoneNumber: existingToken.phoneNumber });
//         }

//     const hashedPassword = await bcrypt.hash(password, 10)
//     const response = await adminModel.findByIdAndUpdate(existingAdmin._id, { password: hashedPassword }, { new: true });
//     await passwordResetTokenModel.findByIdAndDelete(existingToken._id);

//     return {
//         success: true,
//         message: "Password updated successfully",
//         data: response
//     }
// }



export const createLikeProductService = async (req: any, res: Response) => {
  const { title, credits, price, interval } = req.body;

  // Validation
  if (!title || !credits || !price) {
    return errorResponseHandler(
      "title, credits & price are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Create Stripe product
  const stripeProduct = await stripe.products.create({
    name: title,
    metadata: {
      type: "likes",
      credits: credits.toString(),
    },
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: price * 100, // convert $ -> cents
    currency: "usd",
    recurring: { interval: interval || "month" },
    metadata: {
      type: "likes",
      credits: credits.toString(),
    },
  });

  // Save to MongoDB
  const product = await LikeProductsModel.create({
    title,
    credits,
    price,
    interval: interval || "month",
    stripeProductId: stripeProduct.id,
    stripePriceId: stripePrice.id,
  });

  return {
    success: true,
    message: "Like product created successfully",
    data: product,
  };
};
export const updateLikeProductService = async (req: any, res: Response) => {
  const { productId } = req.params;
  const { title, credits, price, interval } = req.body;

  const product = await LikeProductsModel.findById(productId);
  if (!product) {
    return errorResponseHandler(
      "Product not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Update Stripe product
  if (title) {
    await stripe.products.update(product.stripeProductId!, {
      name: title,
    });
  }

  // Create new Stripe price if price/credits changed
  let newStripePrice;
  if (price || credits || interval) {
    newStripePrice = await stripe.prices.create({
      product: product.stripeProductId!,
      unit_amount: (price || product.price) * 100,
      currency: "usd",
      recurring: { interval: interval || product.interval },
      metadata: {
        type: "likes",
        credits: (credits || product.credits).toString(),
      },
    });
  }

  // Update MongoDB record
  const updated = await LikeProductsModel.findByIdAndUpdate(
    productId,
    {
      title: title ?? product.title,
      credits: credits ?? product.credits,
      price: price ?? product.price,
      interval: interval ?? product.interval,
      stripePriceId: newStripePrice?.id || product.stripePriceId,
    },
    { new: true }
  );

  return {
    success: true,
    message: "Like product updated successfully",
    data: updated,
  };
};
export const getLikeProductsService = async (req: any, res: Response) => {
  const products = await LikeProductsModel.find().sort({ price: 1 });

  return {
    success: true,
    message: "Like products fetched successfully",
    data: products,
  };
};
