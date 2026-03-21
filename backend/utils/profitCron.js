const cron = require('node-cron');
const { query } = require('../utils/db');

// Run every day at midnight
const startProfitCron = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running daily profit crediting job...');

    try {
      // Get all active investments
      const investments = await query(`
        SELECT ui.*, ip.roi_percent, ip.roi_period
        FROM user_investments ui
        JOIN investment_plans ip ON ui.plan_id = ip.id
        WHERE ui.status = 'active' AND ui.ends_at > NOW()
      `);

      let credited = 0;
      for (const inv of investments.rows) {
        const dailyProfit = parseFloat(inv.amount) * (parseFloat(inv.roi_percent) / 100);

        // Add to user's withdrawable balance and earnings
        await query(`
          UPDATE user_balances
          SET withdrawable_balance = withdrawable_balance + $1,
              total_earnings = total_earnings + $1
          WHERE user_id = $2
        `, [dailyProfit, inv.user_id]);

        // Update investment total earned
        await query(`
          UPDATE user_investments
          SET total_earned = total_earned + $1, last_profit_credited = NOW()
          WHERE id = $2
        `, [dailyProfit, inv.id]);

        // Log transaction
        await query(`
          INSERT INTO transactions (user_id, type, amount, description, reference_id, balance_after)
          SELECT $1, 'profit', $2, $3, $4, withdrawable_balance
          FROM user_balances WHERE user_id = $1
        `, [inv.user_id, dailyProfit, `Daily profit from ${inv.roi_percent}% ROI`, inv.id]);

        // Notify user
        await query(`
          INSERT INTO notifications (user_id, title, message, type)
          VALUES ($1, 'Profit Credited', $2, 'success')
        `, [inv.user_id, `$${dailyProfit.toFixed(2)} daily profit has been added to your withdrawable balance.`]);

        credited++;
      }

      // Check for expired investments
      const expired = await query(`
        UPDATE user_investments
        SET status = 'completed'
        WHERE status = 'active' AND ends_at <= NOW()
        RETURNING user_id, amount, plan_id
      `);

      for (const inv of expired.rows) {
        // Return principal to withdrawable balance
        await query(`
          UPDATE user_balances
          SET withdrawable_balance = withdrawable_balance + $1,
              active_investment = active_investment - $1
          WHERE user_id = $2
        `, [inv.amount, inv.user_id]);

        await query(`
          INSERT INTO notifications (user_id, title, message, type)
          VALUES ($1, 'Investment Matured', $2, 'success')
        `, [inv.user_id, `Your investment of $${parseFloat(inv.amount).toFixed(2)} has matured. Principal returned to your withdrawable balance.`]);
      }

      console.log(`[CRON] Profit job complete: ${credited} investments credited, ${expired.rows.length} matured`);
    } catch (error) {
      console.error('[CRON] Profit job error:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('[CRON] Daily profit job scheduled');
};

module.exports = { startProfitCron };
