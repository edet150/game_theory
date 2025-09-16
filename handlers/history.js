// handlers/history.js
const redisService = require('../services/redisService');
const { User, RafflePool, Entry, Week, sequelize } = require('../models');
const { Op } = require("sequelize");
module.exports = (bot) => {
    // Command to view all entries
    bot.command('my_entries', async (ctx) => {
        try {
            const entries = await redisService.getFinalizedEntries(ctx.from.id);
            
            if (entries.length === 0) {
                return ctx.reply('You have no active entries. Purchase some with /start');
            }

            let message = '📋 Your Entries:\n\n';
            
            entries.forEach((entry, index) => {
                message += `🎯 **Entry ${index + 1}**\n`;
                message += `🏷️ **Arena:** ${entry.poolName}\n`;
                message += `🔢 **Numbers:** ${entry.numbers.join(', ')}\n`;
                message += `📊 **Quantity:** ${entry.quantity}\n`;
                message += `🎲 **Method:** ${entry.method}\n`;
                message += `🏆 **Week:** ${entry.lottery_week_number}\n`;
                message += `⏰ **Date:** ${new Date(entry.timestamp).toLocaleString()}\n`;
                message += '─'.repeat(30) + '\n\n';
            });

            ctx.reply(message, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error('Error fetching entries:', error);
            ctx.reply('❌ Could not retrieve your entries. Please try again.');
        }
    });

    // Button handler for viewing entries
const keyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🔄 Start Over", callback_data: "start_over" }],
      [{ text: "🎯 Referral Dashboard", callback_data: "referral_dashboard" }]
    ]
  }
};

bot.action('view_entries', async (ctx) => {
  await ctx.answerCbQuery();

  try {
    // 1. Get current week
    const today = new Date();
    const currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today }
      }
    });
console.log(currentWeek.code, ctx.from.id)
    if (!currentWeek) {
      return ctx.reply('❌ No active game week found.');
    }

    // 2. Get user’s entries for the current week
    const entries = await Entry.findAll({
      where: {
        user_id: ctx.from.id,
        week_code: currentWeek.code,
        status: 'paid'
      },
      include: [{ model: RafflePool, as: 'RafflePool' }]
    });

    if (!entries || entries.length === 0) {
      return ctx.reply('📭 You have no active entries this week. Purchase some with /start', keyboard);
    }

    let message = `📋 <b>Your Entries for Week ${currentWeek.code}:</b>\n\n`;

    // Group entries by pool
    const pools = {};
    for (const entry of entries) {
      if (!pools[entry.pool_id]) pools[entry.pool_id] = [];
      pools[entry.pool_id].push(entry);
    }

    // 3. Loop each pool and calculate modulo positions
    for (const [poolId, poolEntries] of Object.entries(pools)) {
      const poolName = poolEntries[0].RafflePool.name;

      // Get all paid entries in this pool for current week
      const allPoolEntries = await Entry.findAll({
        where: { pool_id: poolId, week_id: currentWeek.id, status: 'paid' },
        order: [['entry_number', 'ASC']]
      });

      // Map entry_number → position
      const entryPositionMap = new Map();
      allPoolEntries.forEach((entry, idx) => {
        entryPositionMap.set(entry.entry_number, idx + 1); // position is index+1
      });

      message += `🏟️ <b>${poolName}</b>\n`;

      for (const entry of poolEntries) {
        const position = entryPositionMap.get(entry.entry_number);
        message += `🎯 #${entry.entry_number} (Pos: ${position})\n`;
      }

      message += `📦 Total: ${poolEntries.length} entries\n`;
      message += '─'.repeat(30) + '\n\n';
    }

    try {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } catch {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }

  } catch (error) {
    console.error('❌ Error fetching entries:', error);
    ctx.reply('❌ Could not retrieve your entries. Please try again.', keyboard);
  }
});


};