const nodemailer = require('nodemailer');
const { query } = require('./db');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,            // false = STARTTLS on port 587
  requireTLS: true,         // force STARTTLS upgrade
  tls: {
    rejectUnauthorized: false,  // fixes self-signed cert error in certificate chain
    ciphers: 'SSLv3',
  },
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const renderTemplate = (body, variables) => {
  let rendered = body;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return rendered;
};

const sendEmail = async (to, templateName, variables = {}) => {
  try {
    const result = await query('SELECT * FROM email_templates WHERE name = $1', [templateName]);
    if (result.rows.length === 0) {
      console.error(`Email template '${templateName}' not found`);
      return false;
    }

    const template = result.rows[0];
    const allVars = {
      site_name: process.env.SITE_NAME || 'TransAtlantia Trades',
      site_url: process.env.SITE_URL || 'http://localhost:5000',
      ...variables,
    };

    const subject = renderTemplate(template.subject, allVars);
    const htmlBody = renderTemplate(template.body, allVars);

    const emailWrapper = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0e1a; color: #e0e0e0; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #111827; border-radius: 12px; overflow: hidden; border: 1px solid #1e3a5f; }
          .header { background: linear-gradient(135deg, #0094FF, #0062cc); padding: 30px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 24px; }
          .body { padding: 30px; line-height: 1.7; }
          .body h2 { color: #0094FF; }
          .body a { background: #0094FF; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin: 16px 0; }
          .footer { background: #0a0e1a; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>${allVars.site_name}</h1></div>
          <div class="body">${htmlBody}</div>
          <div class="footer">
            <p>&copy; 2026 ${allVars.site_name}. All rights reserved.</p>
            <p>This is an automated message, please do not reply directly.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || allVars.site_name}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html: emailWrapper,
    });

    return true;
  } catch (error) {
    console.error('[EMAIL] Send failed:');
    console.error('  To:', to);
    console.error('  Template:', templateName);
    console.error('  Error:', error.message);
    if (error.code === 'ECONNREFUSED') console.error('  → SMTP server refused connection. Check SMTP_HOST and SMTP_PORT in .env');
    if (error.code === 'EAUTH') console.error('  → Authentication failed. Check SMTP_USER and SMTP_PASS in .env');
    if (error.responseCode === 535) console.error('  → Wrong email/password. For Gmail use an App Password, not your account password.');
    if (error.code === 'ESOCKET') console.error('  → TLS/SSL error. Already handled with rejectUnauthorized:false — check port and host.');
    return false;
  }
};

module.exports = { sendEmail };
