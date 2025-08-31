// In a new file, or at the top of an existing one.
// Let's create a new file `utils/startFlow.js`

const { User } = require('./models');

/**
 * Reusable function to start the raffle flow.
 * @param {Telegraf.Context} ctx - The Telegraf context object.
 */
async function showStartScreen(ctx) {
  const telegramId = ctx.from.id;
  const telegramUsername = ctx.from.username || `user_${telegramId}`;

  try {
    await User.findOrCreate({
      where: { telegram_id: telegramId },
      defaults: { telegram_username: telegramUsername },
    });

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Alpha Pool (₦100)', callback_data: `select_pool:Alpha` }],
          [{ text: '💰 Beta Pool (₦200)', callback_data: `select_pool:Beta` }],
          [{ text: '💎 High Rollers (₦500)', callback_data: `select_pool:HighRollers` }],
          [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }]
        ]
      }
    };

    // You might want to use editMessageText for a cleaner UX on a button press
    if (ctx.callbackQuery) {
      await ctx.editMessageText('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', options);
    } else {
      await ctx.reply('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', options);
    }

  } catch (error) {
    console.error('Error handling start flow:', error);
    ctx.reply('Oops! Something went wrong. Please try again later.');
  }
}

async function _cleanupSelectionMessages(ctx) {
    try {
        const messagesToDelete = [
            ctx.session.poolSelectionMessageId,
            ctx.session.quantityMessageId,
            ctx.session.quantitySelectionMessageId,
            ctx.session.assignmentMessageId,
            ctx.session.customQuantityMessageId,
            ctx.session.customPromptMessageId // Add this line
        ].filter(id => id); // Remove undefined values

        // Use Promise.all for parallel deletion (better performance)
        await Promise.all(
            messagesToDelete.map(async (messageId) => {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (deleteError) {
                    console.log('Could not delete message:', deleteError.message);
                    // Ignore errors for messages that don't exist or can't be deleted
                }
            })
        );

        // Clear the message IDs from session
        delete ctx.session.poolSelectionMessageId;
        delete ctx.session.quantityMessageId;
        delete ctx.session.quantitySelectionMessageId;
        delete ctx.session.assignmentMessageId;
        delete ctx.session.customQuantityMessageId;
        delete ctx.session.customPromptMessageId; // Add this line

    } catch (error) {
        console.error('Error in cleanupSelectionMessages:', error);
        // Don't throw error, continue with the flow
    }
}
async function cleanupSelectionMessages(ctx) {
    try {
        const messagesToDelete = [
            ctx.session.poolSelectionMessageId,
            ctx.session.quantityMessageId,
            ctx.session.quantitySelectionMessageId,
            ctx.session.assignmentMessageId,
            ctx.session.customQuantityMessageId,
            ctx.session.customPromptMessageId,
            ctx.session.gridMessageId,          // Add grid messages
            ctx.session.randomGridMessageId     // Add random grid messages
        ].filter(id => id); // Remove undefined values

        // Use Promise.all for parallel deletion
        await Promise.all(
            messagesToDelete.map(async (messageId) => {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (deleteError) {
                    console.log('Could not delete message:', deleteError.message);
                }
            })
        );

        // Clear the message IDs from session
        delete ctx.session.poolSelectionMessageId;
        delete ctx.session.quantityMessageId;
        delete ctx.session.quantitySelectionMessageId;
        delete ctx.session.assignmentMessageId;
        delete ctx.session.customQuantityMessageId;
        delete ctx.session.customPromptMessageId;
        delete ctx.session.gridMessageId;         // Clear grid ID
        delete ctx.session.randomGridMessageId;   // Clear random grid ID

    } catch (error) {
        console.error('Error in cleanupSelectionMessages:', error);
    }
}
// utils/getLast4Digits.js
function getLast4Digits(hexString) {
  // Ensure it's a string
  const cleanHex = hexString.toString().replace(/^0+/, ""); // remove leading zeros
  
  // Convert to BigInt
  const bigIntValue = BigInt("0x" + cleanHex);
  
  // Get last 4 digits
  const last4 = Number(bigIntValue % 10000n);
  
  // Pad with leading zeros if necessary
  return last4.toString().padStart(4, "0");
}




module.exports = { showStartScreen, getLast4Digits, cleanupSelectionMessages };