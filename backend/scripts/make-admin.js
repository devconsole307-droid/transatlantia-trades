/**
 * Promote a registered user to admin.
 *
 * HOW TO RUN ON RENDER:
 *   1. Go to your Render dashboard
 *   2. Click your backend service
 *   3. Click the "Shell" tab
 *   4. Type: node scripts/make-admin.js your@email.com
 *
 * LOCALLY:
 *   node backend/scripts/make-admin.js your@email.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, query } = require('../utils/db');

async function makeAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('\nUsage: node scripts/make-admin.js your@email.com\n');
    process.exit(1);
  }

  console.log(`\nPromoting ${email} to admin...`);

  try {
    const result = await query(
      'UPDATE users SET is_admin = TRUE, email_verified = TRUE WHERE email = $1 RETURNING id, first_name, last_name, email',
      [email]
    );

    if (!result.rows.length) {
      console.error(`\n❌ No user found with email: ${email}`);
      console.error('   Register at your live URL first, then run this script.\n');
      process.exit(1);
    }

    const u = result.rows[0];
    console.log(`\n✅ Success! ${u.first_name} ${u.last_name} is now an admin`);
    console.log(`   Email: ${u.email}`);
    console.log(`   Login → you will be redirected to /admin/dashboard.html\n`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

makeAdmin();
