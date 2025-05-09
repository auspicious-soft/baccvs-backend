import { z } from "zod";

export const clientSignupSchema = z.object({
    email: z.string().email(),
    phoneNumber: z.string().min(1),
    password: z.string().min(8),
    username: z.string().min(1),
    dob: z.coerce.date(),
    gender: z.enum(['male', 'female', 'other']),
    interestedIn: z.enum(['male', 'female', 'everyone']),
    photos: z.array(z.string()).optional(),
    location: z.object({
        type: z.literal('Point').default('Point'),
        coordinates: z.array(z.number()).length(2), // [longitude, latitude]
        address: z.string().optional()
    }).optional(),
    referralCode: z.string().optional(),
}).strict({
    message: "Bad payload present in the user signup data"
});

export const clientEditSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dob: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    homeAddress: z.string().min(1),
    profilePic: z.string().min(1),
    phoneNumber: z.string().min(1)
}).strict({
    message: "Bad payload present in the data"
}).partial()


export const passswordResetSchema = z.object({
    currentPassword: z.string(),
    newPassword: z.string(),
}).refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password"
})

export const requestTextToVideoSchema = z.object({
    text: z.string().min(1),
    projectAvatar: z.string().min(1),
    textLanguage: z.string().min(1),
    preferredVoice: z.string().min(1),
    subtitles: z.boolean(),
    subtitlesLanguage: z.string().optional(),
}).strict({
    message: "Bad payload present in the data"
})

export const requestAudioToVideoSchema = z.object({
    audio: z.string().min(1),
    audioLength: z.number().min(1),
    projectAvatar: z.string().min(1),
    subtitles: z.boolean(),
    subtitlesLanguage: z.string().optional(),
}).strict({
    message: "Bad payload present in the data"
})

export const requestVideoTranslationSchema = z.object({
    video: z.string().min(1),
    preferredVoice: z.string().min(1),
    projectAvatar: z.string().min(1),
    subtitles: z.boolean(),
    subtitlesLanguage: z.string().optional(),
    videoLength: z.number().min(1),
    originalText: z.string().min(1),
    translatedText: z.string().min(1)
}).strict({
    message: "Bad payload present in the data"
})

// First screen - password verification
export const verifyPasswordSchema = z.object({
    password: z.string().min(2)
}).strict();

// Second screen - new email
export const changeEmailSchema = z.object({
    newEmail: z.string().email()
}).strict();

// Second screen - new phone
export const changePhoneSchema = z.object({
    newPhoneNumber: z.string()
}).strict();

// Third screen - OTP verification
export const verifyOtpSchema = z.object({
    otp: z.string().length(6)
}).strict();

