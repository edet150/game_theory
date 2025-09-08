// handlers/history.js
const redisService = require('../services/redisService');

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
                message += `🏷️ **Pool:** ${entry.poolName}\n`;
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
    const entries = await redisService.getFinalizedEntries(ctx.from.id);

    if (!entries || entries.length === 0) {
      return ctx.reply('You have no active entries. Purchase some with /start', keyboard);
    }

    let message = '📋 <b>Your Entries:</b>\n\n';

    entries.forEach((entry, index) => {
      message += `🎯 <b>Entry ${index + 1}</b>\n`;
      message += `🏷️ <b>Pool:</b> ${entry.poolName}\n`;
      message += `🔢 <b>Numbers:</b> ${entry.numbers.join(', ')}\n`;
      message += `📊 <b>Quantity:</b> ${entry.quantity}\n`;
      message += `🎲 <b>Method:</b> ${entry.method}\n`;
      message += `🏆 <b>Week:</b> ${entry.lottery_week_number}\n`;
      message += `⏰ <b>Date:</b> ${new Date(entry.timestamp).toLocaleString()}\n`;
      message += '─'.repeat(30) + '\n\n';
    });

    try {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } catch {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }

  } catch (error) {
    console.error('Error fetching entries:', error);
    ctx.reply('❌ Could not retrieve your entries. Please try again.', keyboard);
  }
});

};