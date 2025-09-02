const { User, RafflePool, Entry } = require('../models');
const { showStartScreen, cleanupSelectionMessages } = require('../startFunction');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');

module.exports = (bot) => {

  bot.start(async (ctx) => {
    await cleanupSelectionMessages(ctx);
    messageManager.cleanupAllMessages(ctx)
      try {
        // Try to delete the current message (the one with buttons)
        await ctx.deleteMessage();
      } catch (error) {
        // Message might not be deletable, that's okay
        console.log('Could not delete message:', error.message);
      }
  
    await showStartScreen(ctx);
  });

bot.action('how_it_works', async (ctx) => {
    ctx.answerCbQuery();
    
    const message = await messageManager.sendAndTrack(ctx, 
        'How a winner is selected:\n\n' +
        'We select one winner from each of our three pools every Saturday at 3:00 PM. The process is 100% transparent and provably fair using a single, verifiable Bitcoin block hash.\n\n' +
        '1. A Winning Number is Generated: We use specific sections of the first Bitcoin block hash mined after the draw time. Each section corresponds to a different pool.\n\n' +
        '2. A Winner is Guaranteed: We apply the modulo operator to the winning number against the total number of entries in that pool. This ensures a valid entry is always selected, even if the pool isn\'t full!\n\n' +
        '3. You Can Verify: You can verify the block hash yourself on any public blockchain explorer like blockchain.com.'
    );
});



  
bot.action("start_over", async (ctx) => {
  ctx.answerCbQuery();
  
  try {
    // Delete the bot's prompt message if it exists
    if (ctx.session.startPromptMessageId) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.startPromptMessageId);
      } catch (error) {
        console.log('Could not delete prompt message:', error.message);
      }
      delete ctx.session.startPromptMessageId;
    }
    
    // Delete the current message with the button
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.log('Could not delete callback message:', error.message);
      }
    }
  } catch (error) {
    console.log('Error deleting messages:', error.message);
  }
  
  // Clear session (but keep some essential data if needed)
  const essentialData = {
    // Preserve any data you want to keep across sessions
  };
  ctx.session = essentialData;
  
  // Send welcome message and store its ID
  const welcomeMessage = await ctx.reply('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Alpha Pool (₦100)', callback_data: `select_pool:Alpha` }],
        [{ text: '💰 Beta Pool (₦200)', callback_data: `select_pool:Beta` }],
        [{ text: '💎 High Rollers (₦500)', callback_data: `select_pool:HighRollers` }],
        [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
        [{ text: '📋 My Entries', callback_data: 'view_entries' }]
      ]
    }
  });
  
  // Store the welcome message ID for future cleanup
  ctx.session.welcomeMessageId = welcomeMessage.message_id;
});
};