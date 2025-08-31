const { User, RafflePool, Entry } = require('../models');
const { showStartScreen, cleanupSelectionMessages } = require('../startFunction');


module.exports = (bot) => {
//   bot.on("text", async (ctx) => {
//   console.log('Text received:', ctx.message.text);
  
//   // Skip if it's a command (starts with /)
//   if (ctx.message.text.startsWith('/')) {
//     console.log('Skipping - this is a command');
//         await showStartScreen(ctx);
//     bot.start();
//     return;
//   }
//   // If waiting for quantity, let the quantity handler deal with it
//   if (ctx.session?.nextAction === "prompt_quantity") {
//     console.log('Skipping - letting quantity handler process this');
//     return; // This lets the message continue to the quantity handler below
//   }

//   // Check if we're in any other active flow
//   const isInActiveFlow = 
//     ctx.session?.poolName ||
//     ctx.session?.quantity ||
//     ctx.session?.selectedNumbers ||
//     ctx.session?.assignmentMethod;

//   if (isInActiveFlow) {
//     console.log('Skipping - user is in an active flow');
//     return;
//   }

//   // If there's a previous prompt, delete it
//   if (ctx.session?.startPromptMessageId) {
//     try {
//       await ctx.deleteMessage(ctx.session.startPromptMessageId);
//     } catch (e) {
//       console.log("Message already deleted or can't delete");
//     }
//   }

//   // Send new prompt
//   const startPromptMessage = await ctx.reply(
//     "Please use /start to begin the lottery process:",
//     {
//       reply_markup: {
//         inline_keyboard: [
//           [{ text: "🚀 Start Lottery", callback_data: "start_over" }],
//         ],
//       },
//     }
//   );

//   // Save message ID in session
//   if (!ctx.session) ctx.session = {};
//   ctx.session.startPromptMessageId = startPromptMessage.message_id;
// });

  bot.start(async (ctx) => {
      await cleanupSelectionMessages(ctx);
      try {
    // Try to delete the current message (the one with buttons)
    await ctx.deleteMessage();
  } catch (error) {
    // Message might not be deletable, that's okay
    console.log('Could not delete message:', error.message);
  }
  
    await showStartScreen(ctx);
  });

  bot.action('how_it_works', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply('How a winner is selected:\n\n' +
      'We select one winner from each of our three pools every Saturday at 3:00 PM. The process is 100% transparent and provably fair using a single, verifiable Bitcoin block hash.\n\n' +
      '1. A Winning Number is Generated: We use specific sections of the first Bitcoin block hash mined after the draw time. Each section corresponds to a different pool.\n\n' +
      '2. A Winner is Guaranteed: We apply the modulo operator to the winning number against the total number of entries in that pool. This ensures a valid entry is always selected, even if the pool isn\'t full!\n\n' +
      '3. You Can Verify: You can verify the block hash yourself on any public blockchain explorer like blockchain.com.');
  });

bot.action("start_over_", async (ctx) => {
  ctx.answerCbQuery();
  await cleanupSelectionMessages(ctx);
  // Clear all session data completely
  ctx.session = {};
  
  try {
    // Try to delete the current message (the one with buttons)
    await ctx.deleteMessage();
  } catch (error) {
    // Message might not be deletable, that's okay
    console.log('Could not delete message:', error.message);
  }
  
  // Show the start screen as a NEW message instead of editing
  await ctx.reply('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Alpha Pool (₦100)', callback_data: `select_pool:Alpha` }],
        [{ text: '💰 Beta Pool (₦200)', callback_data: `select_pool:Beta` }],
        [{ text: '💎 High Rollers (₦500)', callback_data: `select_pool:HighRollers` }],
        [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }]
      ]
    }
  });
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
  
  // Clear session and show start screen
  // ctx.session = {};
   await ctx.reply('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Alpha Pool (₦100)', callback_data: `select_pool:Alpha` }],
        [{ text: '💰 Beta Pool (₦200)', callback_data: `select_pool:Beta` }],
        [{ text: '💎 High Rollers (₦500)', callback_data: `select_pool:HighRollers` }],
        [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }]
      ]
    }
  });
});
};