import { environment } from "../../config/environment.js";

function buildInviteEmailHtml(params: {
  staffName: string;
  storeName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresIn: string;
}): string {
  const { staffName, storeName, inviterName, role, acceptUrl, expiresIn } = params;

  const roleLabel = role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Staff Invitation - CommercePilot</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:40px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-flex;align-items:center;gap:10px;">
                      <span style="background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 12px;font-size:20px;">🚀</span>
                      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">CommercePilot</span>
                    </div>
                    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">AI-Powered Commerce Operations</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;color:#0f172a;font-size:26px;font-weight:700;line-height:1.3;">
                You've been invited! 🎉
              </h1>
              <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">
                Hi <strong style="color:#0f172a;">${staffName}</strong>,<br/>
                <strong style="color:#0f172a;">${inviterName}</strong> has invited you to join
                <strong style="color:#0f172a;">${storeName}</strong> on CommercePilot as a
                <strong style="color:#3b82f6;">${roleLabel}</strong>.
              </p>

              <!-- Role Badge -->
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin:0 0 28px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:12px;font-size:22px;">👤</td>
                    <td>
                      <p style="margin:0;color:#1e40af;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Role</p>
                      <p style="margin:4px 0 0;color:#0f172a;font-size:16px;font-weight:700;">${roleLabel}</p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin:0 0 28px;">
                <a href="${acceptUrl}"
                  style="display:inline-block;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#ffffff;text-decoration:none;
                         padding:16px 40px;border-radius:10px;font-size:16px;font-weight:700;
                         letter-spacing:0.2px;box-shadow:0 4px 14px rgba(59,130,246,0.4);">
                  Accept Invitation →
                </a>
              </div>

              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;text-align:center;">
                Or paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;word-break:break-all;text-align:center;">
                <a href="${acceptUrl}" style="color:#3b82f6;font-size:12px;text-decoration:none;">${acceptUrl}</a>
              </p>

              <!-- Expiry Warning -->
              <div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:0 0 8px;">
                <p style="margin:0;color:#854d0e;font-size:13px;">
                  ⏰ <strong>This invitation expires in ${expiresIn}.</strong>
                  If you don't accept it in time, ask your store owner to send a new invitation.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;">
              <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;text-align:center;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:11px;text-align:center;">
                © ${new Date().getFullYear()} CommercePilot AI · All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function buildStaffInviteEmail(params: {
  staffName: string;
  staffEmail: string;
  storeName: string;
  inviterName: string;
  role: string;
  invitationToken: string;
}) {
  const clientUrl = environment.CLIENT_URL || "http://localhost:3000";
  const acceptUrl = `${clientUrl}/accept-invite?token=${params.invitationToken}`;
  const expiresIn = "7 days";

  const html = buildInviteEmailHtml({
    staffName: params.staffName,
    storeName: params.storeName,
    inviterName: params.inviterName,
    role: params.role,
    acceptUrl,
    expiresIn,
  });

  const text = [
    `Hi ${params.staffName},`,
    ``,
    `${params.inviterName} has invited you to join ${params.storeName} on CommercePilot as ${params.role}.`,
    ``,
    `Accept your invitation here:`,
    acceptUrl,
    ``,
    `This link expires in ${expiresIn}.`,
    ``,
    `If you didn't expect this invitation, please ignore this email.`,
  ].join("\n");

  return {
    to: params.staffEmail,
    subject: `You're invited to join ${params.storeName} on CommercePilot`,
    html,
    text,
  };
}
