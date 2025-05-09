import mongoose from "mongoose"

const passwordResetSchema = new mongoose.Schema({
    email: {
        type: String,
        required: false
    },
    token: {
        type: String,
        unique: true,
        required: true
    },
    expires: {
        type: Date,
        required: true
    },
    phoneNumber : {
        type: String,
        required: false
    }

});

export const passwordResetTokenModel = mongoose.model("passwordResetToken", passwordResetSchema);