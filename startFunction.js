// In a new file, or at the top of an existing one.
// Let's create a new file `utils/startFlow.js`

const { User } = require('./models');

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
          [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
          [{ text: '📋 My Entries', callback_data: 'view_entries' }],
        ]
      }
    };

    let messageId;

    // Use editMessageText for a cleaner UX on a button press
    if (ctx.callbackQuery) {
      await ctx.editMessageText('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', options);
      // When editing, the message ID remains the same
      messageId = ctx.callbackQuery.message.message_id;
    } else {
      const welcomeMessage = await ctx.reply('👋 Welcome! Get a chance to win a jackpot every Saturday! We have 3 different pools to play in. Choose your pool below:', options);
      messageId = welcomeMessage.message_id;
    }

    // Store the welcome message ID in session
    if (!ctx.session) ctx.session = {};
    ctx.session.welcomeMessageId = messageId;

    return messageId;

  } catch (error) {
    console.error('Error handling start flow:', error);
    ctx.reply('Oops! Something went wrong. Please try again later.');
    return null;
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
            ctx.session.gridMessageId,
            ctx.session.randomGridMessageId,
            ctx.session.confirmationMessageId,
            ctx.session.paymentMessageId,
            ctx.session.welcomeMessageId // Add welcome message
        ].filter(id => id);

        await Promise.all(
            messagesToDelete.map(async (messageId) => {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (deleteError) {
                    console.log('Could not delete message:', deleteError.message);
                }
            })
        );

        // Clear all message IDs from session
        delete ctx.session.poolSelectionMessageId;
        delete ctx.session.quantityMessageId;
        delete ctx.session.quantitySelectionMessageId;
        delete ctx.session.assignmentMessageId;
        delete ctx.session.customQuantityMessageId;
        delete ctx.session.customPromptMessageId;
        delete ctx.session.gridMessageId;
        delete ctx.session.randomGridMessageId;
        delete ctx.session.confirmationMessageId;
        delete ctx.session.paymentMessageId;
        delete ctx.session.welcomeMessageId;

    } catch (error) {
        console.error('Error in cleanupSelectionMessages:', error);
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