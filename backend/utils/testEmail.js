/**
 * Run this to test your SMTP config:
 *   node backend/utils/testEmail.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  requireTLS: true,
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3',
  },
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function testEmail() {
  console.log('\n📧 Testing SMTP configuration...');
  console.log('─────────────────────────────────');
  console.log(`Host:  ${process.env.SMTP_HOST}`);
  console.log(`Port:  ${process.env.SMTP_PORT}`);
  console.log(`User:  ${process.env.SMTP_USER}`);
  console.log(`Pass:  ${process.env.SMTP_PASS ? '✓ set (' + process.env.SMTP_PASS.length + ' chars)' : '✗ NOT SET'}`);
  console.log(`From:  ${process.env.EMAIL_FROM}`);
  console.log('─────────────────────────────────\n');

  try {
    console.log('Step 1: Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');

    const testAddress = process.env.SMTP_USER;
    console.log(`Step 2: Sending test email to ${testAddress}...`);

    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: testAddress,
      subject: '✅ TransAtlantia SMTP Test — It Works!',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#0D1526;color:#E8EDF5;border-radius:12px">
          <h2 style="color:#0094FF">✅ SMTP is working!</h2>
          <p>Your TransAtlantia Trades email configuration is set up correctly.</p>
          <p style="color:#7A8BA8;font-size:13px">
            Host: ${process.env.SMTP_HOST}<br>
            Port: ${process.env.SMTP_PORT}<br>
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    });

    console.log('✅ Test email sent!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Check your inbox at: ${testAddress}\n`);
    console.log('🎉 Your SMTP config is working! Restart your server with: npm start\n');

  } catch (error) {
    console.error('❌ SMTP Error:', error.message, '\n');
    console.log('── Troubleshooting ──────────────────────────────');
    if (error.code === 'ECONNREFUSED')
      console.log('→ Connection refused. Check SMTP_HOST and SMTP_PORT.');
    else if (error.code === 'ETIMEDOUT')
      console.log('→ Timed out. Your network/firewall may be blocking SMTP ports.');
    else if (error.code === 'EAUTH' || error.responseCode === 535)
      console.log('→ Auth failed. For Gmail: use an App Password (myaccount.google.com → App passwords).');
    else if (error.code === 'ESOCKET')
      console.log('→ TLS error. This should be fixed now. Try running again.');
    else
      console.log('→ Unknown error. Check credentials and host settings.');
    console.log('────────────────────────────────────────────────\n');
    process.exit(1);
  }
}

testEmail();
