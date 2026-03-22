-- ============================================================
-- TransAtlantia Trades — Professional Email Templates
-- Run this against your database to update all templates
-- ============================================================

-- 1. WELCOME (sent on registration)
UPDATE email_templates SET
  subject = 'Welcome to {{site_name}} — Verify Your Email',
  body = '
<div style="text-align:center;margin-bottom:32px;">
  <div style="display:inline-block;background:linear-gradient(135deg,#0094FF22,#00D4AA22);border:1px solid #0094FF44;border-radius:16px;padding:20px 32px;">
    <p style="font-size:32px;margin:0;">👋</p>
    <h2 style="color:#FFFFFF;font-size:22px;margin:12px 0 4px;font-family:Arial,sans-serif;">Welcome aboard, {{first_name}}!</h2>
    <p style="color:#A0AEC0;margin:0;font-size:14px;">You are one step away from growing your wealth.</p>
  </div>
</div>
<p style="color:#E8EDF5;font-size:15px;margin-bottom:16px;">Thank you for creating your <strong style="color:#0094FF;">{{site_name}}</strong> account. To keep your account secure and activate all features, please verify your email address.</p>
<div style="background:#0D1526;border:1px solid rgba(0,148,255,0.2);border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
  <p style="color:#A0AEC0;font-size:13px;margin:0 0 16px;">Click the button below to verify your email address</p>
  <a href="{{verify_link}}" style="display:inline-block;background:linear-gradient(135deg,#0094FF,#0070CC);color:#ffffff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">Verify My Email</a>
  <p style="color:#7A8BA8;font-size:12px;margin:16px 0 0;">This link expires in <strong style="color:#FFA502;">24 hours</strong></p>
</div>
<div style="background:#111827;border-radius:10px;padding:20px;margin-top:24px;">
  <p style="color:#A0AEC0;font-size:12px;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">What you can do with your account</p>
  <p style="color:#E8EDF5;font-size:13px;margin:6px 0;">📈 &nbsp; Access premium investment plans</p>
  <p style="color:#E8EDF5;font-size:13px;margin:6px 0;">💰 &nbsp; Track earnings in real-time</p>
  <p style="color:#E8EDF5;font-size:13px;margin:6px 0;">👥 &nbsp; Earn referral commissions</p>
  <p style="color:#E8EDF5;font-size:13px;margin:6px 0;">📤 &nbsp; Withdraw funds securely</p>
</div>
<p style="color:#7A8BA8;font-size:12px;margin-top:24px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">If you did not create this account, you can safely ignore this email.</p>
',
  variables = ARRAY['first_name', 'site_name', 'verify_link']
WHERE name = 'welcome';


-- 2. EMAIL VERIFICATION
UPDATE email_templates SET
  subject = 'Verify your {{site_name}} email address',
  body = '
<div style="text-align:center;margin-bottom:28px;">
  <div style="display:inline-block;background:#0094FF22;border:1px solid #0094FF44;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:32px;">📧</div>
  <h2 style="color:#FFFFFF;font-size:20px;margin:16px 0 6px;font-family:Arial,sans-serif;">Confirm Your Email Address</h2>
  <p style="color:#A0AEC0;margin:0;font-size:14px;">Hi {{first_name}}, please verify your email to continue.</p>
</div>
<p style="color:#E8EDF5;font-size:15px;margin-bottom:20px;">We received a request to verify the email address associated with your <strong style="color:#0094FF;">{{site_name}}</strong> account. Click the button below to complete verification.</p>
<div style="background:#0D1526;border:1px solid rgba(0,148,255,0.2);border-radius:12px;padding:28px;margin:24px 0;text-align:center;">
  <a href="{{verify_link}}" style="display:inline-block;background:linear-gradient(135deg,#0094FF,#0070CC);color:#ffffff;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none;">Verify Email Address</a>
  <p style="color:#7A8BA8;font-size:12px;margin:16px 0 0;">Link expires in <strong style="color:#FFA502;">24 hours</strong></p>
</div>
<p style="color:#7A8BA8;font-size:12px;margin-top:20px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">If you did not request this, please ignore this email. Your account remains secure.</p>
',
  variables = ARRAY['first_name', 'site_name', 'verify_link']
WHERE name = 'email_verification';


-- 3. PASSWORD RESET
UPDATE email_templates SET
  subject = 'Reset Your {{site_name}} Password',
  body = '
<div style="text-align:center;margin-bottom:28px;">
  <div style="display:inline-block;background:#FF475722;border:1px solid #FF475744;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:32px;">🔐</div>
  <h2 style="color:#FFFFFF;font-size:20px;margin:16px 0 6px;font-family:Arial,sans-serif;">Password Reset Request</h2>
  <p style="color:#A0AEC0;margin:0;font-size:14px;">Hi {{first_name}}, we received a request to reset your password.</p>
</div>
<p style="color:#E8EDF5;font-size:15px;margin-bottom:20px;">No worries — it happens to everyone. Click the button below to choose a new password for your <strong style="color:#0094FF;">{{site_name}}</strong> account.</p>
<div style="background:#0D1526;border:1px solid rgba(255,71,87,0.2);border-radius:12px;padding:28px;margin:24px 0;text-align:center;">
  <a href="{{reset_link}}" style="display:inline-block;background:linear-gradient(135deg,#FF4757,#cc2333);color:#ffffff;font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none;">Reset My Password</a>
  <p style="color:#7A8BA8;font-size:12px;margin:16px 0 0;">This link expires in <strong style="color:#FFA502;">1 hour</strong></p>
</div>
<div style="background:#FFA50211;border:1px solid #FFA50233;border-radius:10px;padding:16px;margin-top:20px;">
  <p style="color:#FFA502;font-size:13px;margin:0;font-weight:600;">⚠️ Security Notice</p>
  <p style="color:#A0AEC0;font-size:13px;margin:8px 0 0;">If you did not request a password reset, please secure your account immediately by logging in and changing your password.</p>
</div>
<p style="color:#7A8BA8;font-size:12px;margin-top:20px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">If you did not request this reset, simply ignore this email — your password will not change.</p>
',
  variables = ARRAY['first_name', 'site_name', 'reset_link']
WHERE name = 'password_reset';


-- 4. DEPOSIT RECEIVED
UPDATE email_templates SET
  subject = 'Deposit Received — Under Review | {{site_name}}',
  body = '
<div style="text-align:center;margin-bottom:28px;">
  <div style="display:inline-block;background:#0094FF22;border:1px solid #0094FF44;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:32px;">📥</div>
  <h2 style="color:#FFFFFF;font-size:20px;margin:16px 0 6px;font-family:Arial,sans-serif;">Deposit Received</h2>
  <p style="color:#A0AEC0;margin:0;font-size:14px;">Hi {{first_name}}, we have received your deposit and it is under review.</p>
</div>
<div style="background:#0D1526;border:1px solid rgba(0,148,255,0.2);border-radius:12px;padding:24px;margin:20px 0;">
  <p style="color:#7A8BA8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;">Deposit Summary</p>
  <table style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Amount</td><td style="padding:10px 0;color:#FFFFFF;font-size:16px;font-weight:700;text-align:right;">${{amount}}</td></tr>
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Currency</td><td style="padding:10px 0;color:#FFFFFF;font-size:14px;text-align:right;">{{currency}}</td></tr>
    <tr><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Status</td><td style="padding:10px 0;text-align:right;"><span style="background:#FFA50222;color:#FFA502;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #FFA50244;">⏳ Under Review</span></td></tr>
  </table>
</div>
<p style="color:#E8EDF5;font-size:15px;margin:20px 0;">Our team is reviewing your deposit. This typically takes up to <strong style="color:#FFA502;">24 hours</strong>. Once confirmed, your investment plan will be activated and you will receive a confirmation email.</p>
<div style="background:#2ED57311;border:1px solid #2ED57333;border-radius:10px;padding:16px;">
  <p style="color:#2ED573;font-size:13px;margin:0;font-weight:600;">✅ What happens next?</p>
  <p style="color:#A0AEC0;font-size:13px;margin:8px 0 0;line-height:1.7;">Our admin team will verify your payment proof and confirm your deposit. You will be notified by email as soon as your deposit is approved and your plan goes live.</p>
</div>
',
  variables = ARRAY['first_name', 'amount', 'currency', 'site_name']
WHERE name = 'deposit_received';


-- 5. DEPOSIT CONFIRMED
UPDATE email_templates SET
  subject = 'Deposit Confirmed — Your Plan is Now Active | {{site_name}}',
  body = '
<div style="text-align:center;margin-bottom:28px;">
  <div style="display:inline-block;background:#2ED57322;border:1px solid #2ED57344;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:32px;">🎉</div>
  <h2 style="color:#FFFFFF;font-size:20px;margin:16px 0 6px;font-family:Arial,sans-serif;">Deposit Confirmed!</h2>
  <p style="color:#A0AEC0;margin:0;font-size:14px;">Hi {{first_name}}, great news — your investment is now live!</p>
</div>
<div style="background:#2ED57311;border:1px solid #2ED57333;border-radius:12px;padding:24px;margin:20px 0;">
  <p style="color:#7A8BA8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;">Confirmed Deposit</p>
  <table style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Amount Confirmed</td><td style="padding:10px 0;color:#2ED573;font-size:18px;font-weight:700;text-align:right;">${{amount}}</td></tr>
    <tr><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Status</td><td style="padding:10px 0;text-align:right;"><span style="background:#2ED57322;color:#2ED573;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #2ED57344;">✅ Confirmed</span></td></tr>
  </table>
</div>
<p style="color:#E8EDF5;font-size:15px;margin:20px 0;">Your deposit has been approved and your investment plan is now <strong style="color:#2ED573;">actively generating returns</strong>. You can track your earnings in real-time from your dashboard.</p>
<div style="text-align:center;margin:28px 0;">
  <a href="{{site_url}}/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#2ED573,#1db954);color:#ffffff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;">View My Dashboard</a>
</div>
<div style="background:#0D1526;border-radius:10px;padding:16px;">
  <p style="color:#A0AEC0;font-size:13px;margin:0;line-height:1.7;">💡 <strong style="color:#0094FF;">Pro tip:</strong> Refer friends to {{site_name}} and earn commission bonuses on every deposit they make. Check your referral link in the dashboard.</p>
</div>
',
  variables = ARRAY['first_name', 'amount', 'site_name', 'site_url']
WHERE name = 'deposit_confirmed';


-- 6. WITHDRAWAL APPROVED
UPDATE email_templates SET
  subject = 'Withdrawal Approved — Processing Now | {{site_name}}',
  body = '
<div style="text-align:center;margin-bottom:28px;">
  <div style="display:inline-block;background:#2ED57322;border:1px solid #2ED57344;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:32px;">📤</div>
  <h2 style="color:#FFFFFF;font-size:20px;margin:16px 0 6px;font-family:Arial,sans-serif;">Withdrawal Approved</h2>
  <p style="color:#A0AEC0;margin:0;font-size:14px;">Hi {{first_name}}, your withdrawal request has been approved.</p>
</div>
<div style="background:#0D1526;border:1px solid rgba(46,213,115,0.2);border-radius:12px;padding:24px;margin:20px 0;">
  <p style="color:#7A8BA8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;">Withdrawal Details</p>
  <table style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Amount</td><td style="padding:10px 0;color:#2ED573;font-size:18px;font-weight:700;text-align:right;">${{amount}}</td></tr>
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Currency</td><td style="padding:10px 0;color:#FFFFFF;font-size:14px;text-align:right;">{{currency}}</td></tr>
    <tr><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Status</td><td style="padding:10px 0;text-align:right;"><span style="background:#2ED57322;color:#2ED573;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #2ED57344;">✅ Approved</span></td></tr>
  </table>
</div>
<p style="color:#E8EDF5;font-size:15px;margin:20px 0;">Your withdrawal has been approved and is currently being processed. Funds will be sent to your registered wallet address within <strong style="color:#0094FF;">24–48 hours</strong> depending on network conditions.</p>
<div style="background:#0094FF11;border:1px solid #0094FF33;border-radius:10px;padding:16px;margin-top:8px;">
  <p style="color:#0094FF;font-size:13px;margin:0;font-weight:600;">ℹ️ What to expect</p>
  <p style="color:#A0AEC0;font-size:13px;margin:8px 0 0;line-height:1.7;">Once the transaction is broadcast to the blockchain, you will receive a confirmation. Transaction times may vary based on network congestion. Contact support if funds have not arrived after 48 hours.</p>
</div>
',
  variables = ARRAY['first_name', 'amount', 'currency', 'site_name']
WHERE name = 'withdrawal_approved';


-- 7. WITHDRAWAL REJECTED
UPDATE email_templates SET
  subject = 'Withdrawal Update — Action Required | {{site_name}}',
  body = '
<div style="text-align:center;margin-bottom:28px;">
  <div style="display:inline-block;background:#FF475722;border:1px solid #FF475744;border-radius:50%;width:72px;height:72px;line-height:72px;font-size:32px;">⚠️</div>
  <h2 style="color:#FFFFFF;font-size:20px;margin:16px 0 6px;font-family:Arial,sans-serif;">Withdrawal Not Approved</h2>
  <p style="color:#A0AEC0;margin:0;font-size:14px;">Hi {{first_name}}, your withdrawal request could not be processed.</p>
</div>
<div style="background:#0D1526;border:1px solid rgba(255,71,87,0.2);border-radius:12px;padding:24px;margin:20px 0;">
  <p style="color:#7A8BA8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px;">Request Details</p>
  <table style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Amount Requested</td><td style="padding:10px 0;color:#FFFFFF;font-size:16px;font-weight:700;text-align:right;">${{amount}}</td></tr>
    <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Status</td><td style="padding:10px 0;text-align:right;"><span style="background:#FF475722;color:#FF4757;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #FF475744;">❌ Not Approved</span></td></tr>
    <tr><td style="padding:10px 0;color:#A0AEC0;font-size:14px;">Reason</td><td style="padding:10px 0;color:#FFA502;font-size:14px;font-weight:600;text-align:right;">{{reason}}</td></tr>
  </table>
</div>
<p style="color:#E8EDF5;font-size:15px;margin:20px 0;">We were unable to process your withdrawal request at this time. Please review the reason above and take the necessary action to resolve the issue.</p>
<div style="background:#FFA50211;border:1px solid #FFA50233;border-radius:10px;padding:16px;margin:20px 0;">
  <p style="color:#FFA502;font-size:13px;margin:0;font-weight:600;">🔧 How to resolve this</p>
  <p style="color:#A0AEC0;font-size:13px;margin:8px 0 0;line-height:1.7;">Log in to your account to review your withdrawal details and resubmit your request after addressing the issue. If you believe this is an error, please contact our support team.</p>
</div>
<div style="text-align:center;margin:24px 0;">
  <a href="{{site_url}}/withdraw.html" style="display:inline-block;background:linear-gradient(135deg,#0094FF,#0070CC);color:#ffffff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;">Resubmit Withdrawal</a>
</div>
<p style="color:#7A8BA8;font-size:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">Need help? Contact our support team through the live chat on the platform.</p>
',
  variables = ARRAY['first_name', 'amount', 'reason', 'site_name', 'site_url']
WHERE name = 'withdrawal_rejected';
