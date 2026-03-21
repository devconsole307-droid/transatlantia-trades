require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, query } = require('../utils/db');
const fs = require('fs');
const path = require('path');

async function initDatabase() {
  console.log('\n🗄️  Initializing TransAtlantia Trades database...\n');

  try {
    // Test connection first
    const timeResult = await query('SELECT NOW()');
    console.log('✅ Database connected:', timeResult.rows[0].now, '\n');

    // Check if schema already exists
    const tableCheck = await query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tableCount = parseInt(tableCheck.rows[0].count);
    console.log(`📊 Tables already in DB: ${tableCount}`);

    if (tableCount >= 10) {
      console.log('✅ Schema already applied — skipping\n');
    } else {
      console.log('Applying main schema...');
      const mainSchema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
      await pool.query(mainSchema);
      console.log('✅ Main schema done\n');

      console.log('Applying chat schema...');
      const chatSchema = fs.readFileSync(path.join(__dirname, '../chat-schema.sql'), 'utf8');
      await pool.query(chatSchema);
      console.log('✅ Chat schema done\n');
    }

    // Show what's in the DB
    const plans = await query('SELECT COUNT(*) FROM investment_plans');
    const settings = await query('SELECT COUNT(*) FROM site_settings');
    const users = await query('SELECT COUNT(*) FROM users');

    console.log('📋 Database contents:');
    console.log(`   Investment plans : ${plans.rows[0].count}`);
    console.log(`   Site settings    : ${settings.rows[0].count}`);
    console.log(`   Users registered : ${users.rows[0].count}`);

    console.log('\n🎉 Database is ready!\n');
    console.log('Next: register at https://transatlantiatrades.fly.dev');
    console.log('Then: node backend/scripts/make-admin.js your@email.com\n');

  } catch (err) {
    console.error('❌ Full error details:');
    console.error('   Message :', err.message || '(no message)');
    console.error('   Code    :', err.code || '(no code)');
    console.error('   Detail  :', err.detail || '(no detail)');
    console.error('   Stack   :', err.stack || '(no stack)');
    console.error('\n   DATABASE_URL set:', !!process.env.DATABASE_URL);
    console.error('   DATABASE_URL preview:', (process.env.DATABASE_URL || '').substring(0, 50) + '...');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
