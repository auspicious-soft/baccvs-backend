export const getResetPasswordEmailTemplate = (token: string) => {
  const resetUrl = `${process.env.BASE_URL}/reset-password/${token}`;
  
  return `
    <h2>Reset Your Password</h2>
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `;
};