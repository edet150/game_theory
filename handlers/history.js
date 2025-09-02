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
    bot.action('view_entries', async (ctx) => {
        ctx.answerCbQuery();
        
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

            // Edit the original message or send new one
            try {
                await ctx.editMessageText(message, { parse_mode: 'Markdown' });
            } catch {
                await ctx.reply(message, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            console.error('Error fetching entries:', error);
            ctx.reply('❌ Could not retrieve your entries. Please try again.');
        }
    });
};