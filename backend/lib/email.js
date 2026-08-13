import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Until a custom domain is verified in Resend, this default only actually
// delivers to the email address of the Resend account itself — fine for
// testing the flow end-to-end, not for real client emails yet.
const FROM = process.env.EMAIL_FROM || "RIOS <onboarding@resend.dev>";

// Public URL of the deployed frontend, used to build links inside emails.
// Falls back to localhost for local dev.
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

function brandWrapper(bodyHtml) {
  return `
    <div style="font-family: 'Poppins', Arial, sans-serif; background: #FBF9F6; padding: 32px 16px;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px; border: 1px solid #E7E2DC;">
        <div style="display:inline-flex; align-items:center; gap:8px; margin-bottom: 24px;">
          <div style="width:28px; height:28px; border-radius:7px; background:#EF4C4F; color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:14px;">R</div>
          <span style="font-weight:600; font-size:16px; color:#272525;">RIoS</span>
        </div>
        ${bodyHtml}
        <div style="margin-top:32px; padding-top:20px; border-top:1px solid #E7E2DC; font-size:11px; color:#9B958F;">
          RIOS Discover — Retail Innovation Ventures. If you didn't expect this email, you can safely ignore it.
        </div>
      </div>
    </div>
  `;
}

async function send({ to, subject, html }) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send. Would have sent "${subject}" to ${to}`);
    return { skipped: true };
  }
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    return result;
  } catch (err) {
    console.error("[email] Send failed:", err);
    throw err;
  }
}

export async function sendVerificationEmail(to, name, token) {
  const link = `${APP_URL}/?action=verify-email&token=${encodeURIComponent(token)}`;
  const html = brandWrapper(`
    <h2 style="font-size:20px; color:#272525; margin:0 0 12px;">Verify your email</h2>
    <p style="font-size:14px; color:#272525; line-height:1.6;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:14px; color:#272525; line-height:1.6;">Your RIOS account was just created. Confirm this is your email address to finish setting things up:</p>
    <a href="${link}" style="display:inline-block; margin-top:16px; background:#EF4C4F; color:#fff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 22px; border-radius:9px;">Verify email address</a>
    <p style="font-size:12px; color:#9B958F; margin-top:20px;">This link expires in 48 hours. If the button doesn't work, copy this URL:<br>${link}</p>
  `);
  return send({ to, subject: "Verify your RIOS account", html });
}

export async function sendPasswordResetEmail(to, name, token) {
  const link = `${APP_URL}/?action=reset-password&token=${encodeURIComponent(token)}`;
  const html = brandWrapper(`
    <h2 style="font-size:20px; color:#272525; margin:0 0 12px;">Reset your password</h2>
    <p style="font-size:14px; color:#272525; line-height:1.6;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:14px; color:#272525; line-height:1.6;">We got a request to reset the password on your RIOS account. Set a new one here:</p>
    <a href="${link}" style="display:inline-block; margin-top:16px; background:#EF4C4F; color:#fff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 22px; border-radius:9px;">Reset password</a>
    <p style="font-size:12px; color:#9B958F; margin-top:20px;">This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change. If the button doesn't work, copy this URL:<br>${link}</p>
  `);
  return send({ to, subject: "Reset your RIOS password", html });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
