import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string, type: 'signup' | 'password_reset' = 'signup') {
  try {
    const isPasswordReset = type === 'password_reset';
    const subject = isPasswordReset ? "Reset your Instant Admin password" : "Verify your Instant Admin account";
    
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "noreply@instantdashboard.org",
      to: [email],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin-bottom: 10px;">Instant Admin</h1>
            <p style="color: #64748b;">Your PostgreSQL databases, simply managed</p>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <h2 style="color: #1e293b; margin-bottom: 20px;">
              ${isPasswordReset ? 'Reset your password' : 'Verify your email address'}
            </h2>
            <p style="color: #475569; margin-bottom: 20px;">
              ${isPasswordReset 
                ? 'You requested to reset your password. Please enter this verification code to set a new password:'
                : 'Thanks for signing up! To complete your registration, please enter this verification code:'
              }
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; background: #2563eb; color: white; font-size: 24px; font-weight: bold; padding: 15px 25px; border-radius: 8px; letter-spacing: 3px;">
                ${code}
              </div>
            </div>
            <p style="color: #64748b; font-size: 14px; text-align: center;">
              This code will expire in 10 minutes.
            </p>
          </div>
          
          <div style="text-align: center; color: #94a3b8; font-size: 12px;">
            <p>${isPasswordReset 
              ? 'If you didn\'t request this password reset, you can safely ignore this email.'
              : 'If you didn\'t request this verification, you can safely ignore this email.'
            }</p>
            <p>© 2024 Instant Admin. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
}
