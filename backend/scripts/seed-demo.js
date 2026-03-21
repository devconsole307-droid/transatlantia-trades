/**
 * Creates demo accounts for testing.
 * On Railway:  railway run node backend/scripts/seed-demo.js
 * Locally:     node backend/scripts/seed-demo.js
 *
 * Creates:
 *   - demo@transatlantiatrades.com  (regular user with balance + active investment)
 *   - tester@transatlantiatrades.com (fresh user, no activity)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, query } = require('../utils/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DEMO_PASSWORD = 'Demo@12345';

async function seedDemo() {
  console.log('\n🌱 Seeding demo accounts...\n');

  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const accounts = [
      {
        id: uuidv4(),
        first_name: 'Demo',
        last_name: 'Investor',
        email: 'demo@transatlantiatrades.com',
        referral_code: 'DEMO01',
        // Pre-loaded with balance and an active investment
        balance: {
          total_deposited: 5000,
          active_investment: 5000,
          total_earnings: 800,
          withdrawable_balance: 800,
          total_withdrawn: 0,
          referral_earnings: 0,
        },
      },
      {
        id: uuidv4(),
        first_name: 'Test',
        last_name: 'User',
        email: 'tester@transatlantiatrades.com',
        referral_code: 'TEST01',
        // Fresh account — no activity
        balance: {
          total_deposited: 0,
          active_investment: 0,
          total_earnings: 0,
          withdrawable_balance: 0,
          total_withdrawn: 0,
          referral_earnings: 0,
        },
      },
    ];

    for (const acc of accounts) {
      // Check if already exists
      const exists = await query('SELECT id FROM users WHERE email = $1', [acc.email]);
      if (exists.rows.length > 0) {
        console.log(`⏭️  ${acc.email} already exists — skipping`);
        continue;
      }

      // Create user
      await query(`
        INSERT INTO users (id, first_name, last_name, email, password_hash, referral_code, email_verified)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      `, [acc.id, acc.first_name, acc.last_name, acc.email, passwordHash, acc.referral_code]);

      // Create balance record
      await query(`
        INSERT INTO user_balances (
          user_id, total_deposited, active_investment,
          total_earnings, withdrawable_balance, total_withdrawn, referral_earnings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        acc.id,
        acc.balance.total_deposited,
        acc.balance.active_investment,
        acc.balance.total_earnings,
        acc.balance.withdrawable_balance,
        acc.balance.total_withdrawn,
        acc.balance.referral_earnings,
      ]);

      // For demo account: add a confirmed deposit and active investment
      if (acc.balance.total_deposited > 0) {
        // Get Silver plan (or first available plan)
        const plan = await query("SELECT * FROM investment_plans WHERE is_active = TRUE ORDER BY tier_order LIMIT 1 OFFSET 1");
        if (plan.rows.length > 0) {
          const p = plan.rows[0];
          const depositId = uuidv4();

          await query(`
            INSERT INTO deposits (id, user_id, plan_id, amount, currency, wallet_address, status, confirmed_at)
            VALUES ($1, $2, $3, $4, 'BTC', 'bc1qdemoaddress', 'confirmed', NOW())
          `, [depositId, acc.id, p.id, acc.balance.total_deposited]);

          const endsAt = new Date(Date.now() + p.duration_days * 86400000);
          const totalProfit = acc.balance.total_deposited * (p.roi_percent / 100) * p.duration_days;

          await query(`
            INSERT INTO user_investments (
              user_id, plan_id, amount, roi_percent, roi_period,
              duration_days, total_expected_profit, total_earned, status, ends_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
          `, [acc.id, p.id, acc.balance.total_deposited, p.roi_percent, p.roi_period,
              p.duration_days, totalProfit, acc.balance.total_earnings, endsAt]);

          // Add some transaction history
          await query(`
            INSERT INTO transactions (user_id, type, amount, description, balance_after)
            VALUES
              ($1, 'deposit', $2, 'Initial deposit via BTC', $2),
              ($1, 'profit', 200, 'Daily profit (Day 1)', $3),
              ($1, 'profit', 200, 'Daily profit (Day 2)', $4),
              ($1, 'profit', 200, 'Daily profit (Day 3)', $5),
              ($1, 'profit', 200, 'Daily profit (Day 4)', $6)
          `, [acc.id, acc.balance.total_deposited, 200, 400, 600, 800]);
        }
      }

      console.log(`✅ Created: ${acc.email}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Demo accounts ready!\n');
    console.log('  📧 demo@transatlantiatrades.com    — has $5,000 invested + $800 earned');
    console.log('  📧 tester@transatlantiatrades.com  — fresh account, no activity');
    console.log(`\n  🔑 Password for both: ${DEMO_PASSWORD}`);
    console.log('\n  Share these credentials with your testers.');
    console.log('  ⚠️  Change or delete demo accounts before going live!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDemo();
