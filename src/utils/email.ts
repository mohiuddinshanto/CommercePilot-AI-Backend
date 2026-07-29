import nodemailer from "nodemailer";
import { environment } from "../config/environment.js";
import { logger } from "./logger.js";

function createTransporter() {
  const user = environment.EMAIL_USER;
  const pass = environment.EMAIL_PASS;
  const host = environment.EMAIL_HOST;
  const port = environment.EMAIL_PORT;

  // If no email config, use Ethereal (fake SMTP for dev/test)
  if (!user || !pass) {
    logger.warn("[Email] No EMAIL_USER/EMAIL_PASS set. Emails will be logged only.");
    return null;
  }

  return nodemailer.createTransport({
    host: host || "smtp.gmail.com",
    port: port || 587,
    secure: (port || 587) === 465,
    auth: { user, pass },
  });
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendMailOptions): Promise<void> {
  const from = environment.EMAIL_FROM || environment.EMAIL_USER || "noreply@commercepilot.app";
  const transporter = createTransporter();

  if (!transporter) {
    // Dev fallback — just log
    logger.info(`[Email] Would send to: ${options.to}`);
    logger.info(`[Email] Subject: ${options.subject}`);
    logger.info(`[Email] Body preview: ${options.text || "(html only)"}`);
    return;
  }

  await transporter.sendMail({
    from: `"CommercePilot" <${from}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  logger.info(`[Email] Sent to ${options.to} — ${options.subject}`);
}
