export type EmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
  details?: unknown;
};

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

export function getEmailConfig() {
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  return {
    emailProvider: process.env.EMAIL_PROVIDER || "resend",
    resendApiKey: process.env.RESEND_API_KEY,
    resendFromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    institutionalEmail: process.env.INSTITUTIONAL_EMAIL || "reflab.institucional@gmail.com",
    supportEmail:
      process.env.SUPPORT_EMAIL ||
      process.env.INSTITUTIONAL_EMAIL ||
      "reflab.institucional@gmail.com",
    appUrl: process.env.APP_URL || "https://reflab.app",
  };
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<EmailResult> {
  const config = getEmailConfig();

  if (config.emailProvider === "smtp") {
    return sendSmtpEmail(input, config);
  }

  return sendResendEmail(input, config);
}

async function sendSmtpEmail(
  input: SendEmailInput,
  config: ReturnType<typeof getEmailConfig>
): Promise<EmailResult> {
  const { smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromEmail } = config;

  if (!smtpHost || !smtpUser || !smtpPassword) {
    return {
      ok: false,
      error: "SMTP_HOST, SMTP_USER o SMTP_PASSWORD no configurados.",
    };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword.replace(/\s/g, ""),
      },
    });

    const result = await transporter.sendMail({
      from: formatFrom(smtpFromEmail || smtpUser),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return { ok: true, id: result.messageId };
  } catch (error) {
    console.error("SMTP emailError", {
      to: input.to,
      subject: input.subject,
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      error,
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido al enviar email SMTP.",
      details: error,
    };
  }
}

async function sendResendEmail(
  input: SendEmailInput,
  config: ReturnType<typeof getEmailConfig>
): Promise<EmailResult> {
  const { resendApiKey, resendFromEmail } = config;

  if (!resendApiKey) {
    return {
      ok: false,
      error: "RESEND_API_KEY no configurada.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: formatFrom(resendFromEmail),
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: string }
      | null;

    if (!response.ok) {
      console.error("Resend emailError", {
        status: response.status,
        to: input.to,
        subject: input.subject,
        from: formatFrom(resendFromEmail),
        details: data,
      });

      return {
        ok: false,
        error: data?.message || data?.error || `Resend respondio con estado ${response.status}.`,
        status: response.status,
        details: data,
      };
    }

    return { ok: true, id: data?.id };
  } catch (error) {
    console.error("Resend emailError", {
      to: input.to,
      subject: input.subject,
      from: formatFrom(resendFromEmail),
      error,
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido al enviar email.",
      details: error,
    };
  }
}

function formatFrom(value: string) {
  if (value.includes("<") && value.includes(">")) {
    return value;
  }

  return `RefLab <${value}>`;
}
