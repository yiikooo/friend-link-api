import * as mailer from 'nodemailer';

export interface MailOptions {
  to: string;
  subject?: string;
  html: string;
  from?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export async function sendNotifyMail(
  options: MailOptions,
  smtpConfig: SmtpConfig
): Promise<boolean> {
  const transporter = mailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  try {
    const fromAddress = options.from
      ? `${options.from} <${smtpConfig.user}>`
      : `Friend API <${smtpConfig.user}>`;
    await transporter.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject || '邮件通知',
      html: options.html,
    });
    return true;
  } catch (error) {
    console.error('发送通知邮件失败:', error);
    return false;
  }
}
