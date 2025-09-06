// In a new file, or at the top of an existing one.
// Let's create a new file `utils/startFlow.js`

const { User , Week} = require('./models');

async function showStartScreen_(ctx) {
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
          [{ text: '💰 Alpha Draw (₦100)', callback_data: `select_pool:Alpha` }],
          // [{ text: '💰 Beta Draw (₦200)', callback_data: `select_pool:Beta` }],
          // [{ text: '💎 High Rollers (₦500)', callback_data: `select_pool:HighRollers` }],
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
async function showStartScreen(ctx) {
  const telegramId = ctx.from.id;
  const telegramUsername = ctx.from.username || `user_${telegramId}`;

  try {
    // Ensure user exists in DB
    await User.findOrCreate({
      where: { telegram_id: telegramId },
      defaults: { telegram_username: telegramUsername },
    });

    // Get current lottery week
    const currentLotteryWeek = await Week.findOne({
      order: [['week_number', 'DESC']]
    });

    const weekLabel = currentLotteryWeek 
      ? `${currentLotteryWeek.week_name} (Week ${currentLotteryWeek.week_number}, ${currentLotteryWeek.year})`
      : 'Current Week';

    // Example prize pool (later make dynamic: 80% of all entries)
    const prizeMoney = "₦100,000";

    // Welcome text with branding
    const welcomeText = `👋 Welcome to *Alpha Entries*!  
Get a chance to win exciting jackpots every Saturday 🎉  

📅 *This Week:* ${weekLabel}  
💰 *Prize Pool:* ${prizeMoney}  

Please select your draw below to enter:`;

  const options = {
          parse_mode: 'HTML',
          reply_markup: {
              inline_keyboard: [
                  [{ text: '💰 Alpha Draw (₦100)', callback_data: `select_pool:Alpha` }],
                  [{ text: 'ℹ️ How It Works', callback_data: 'how_it_works' }],
                  [{ text: '📋 My Entries', callback_data: 'view_entries' }],
                  [{ text: '🎯 Referral Dashboard', callback_data: 'referral_dashboard' }], // Added referral button
              ]
          }
      };

    let messageId;

    if (ctx.callbackQuery) {
      // Editing existing message (button press)
      await ctx.editMessageText(welcomeText, options);
      messageId = ctx.callbackQuery.message.message_id;
    } else {
      // Fresh start
      const welcomeMessage = await ctx.reply(welcomeText, options);
      messageId = welcomeMessage.message_id;
    }

    // Store welcome message ID in session
    if (!ctx.session) ctx.session = {};
    ctx.session.welcomeMessageId = messageId;

    return messageId;

  } catch (error) {
    console.error('Error handling start flow:', error);
    ctx.reply('Oops! Something went wrong. Please try again later.');
    return null;
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


// Enhanced cleanup function that combines both approaches
async function cleanupSelectionMessages(ctx) {
    try {
        // Array of all possible message IDs to clean up
        const messagesToDelete = [
            // Your existing message IDs
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
            ctx.session.welcomeMessageId,
            
            // Additional message IDs from my implementation
            ctx.session.startPromptMessageId,
            ctx.session.loginPrompt,
            ctx.session.passwordPrompt,
            ctx.session.adminDashboard,
            ctx.session.winningNumberPrompt,
            ctx.session.winningAmountPrompt,
            ctx.session.poolNamePrompt,
            ctx.session.winnersList,
            ctx.session.poolStats,
            
            // Referral system message IDs
            ...(ctx.session.referralMessages || [])
        ].filter(id => id); // Remove undefined/null values

        // Delete all messages in parallel
        await Promise.all(
            messagesToDelete.map(async (messageId) => {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (deleteError) {
                    // Ignore errors for messages that don't exist or can't be deleted
                    console.log('Could not delete message:', deleteError.message);
                }
            })
        );

        // Clear all message IDs from session (comprehensive list)
        const sessionKeysToDelete = [
            // Your existing keys
            'poolSelectionMessageId',
            'quantityMessageId',
            'quantitySelectionMessageId',
            'assignmentMessageId',
            'customQuantityMessageId',
            'customPromptMessageId',
            'gridMessageId',
            'randomGridMessageId',
            'confirmationMessageId',
            'paymentMessageId',
            'welcomeMessageId',
            
            // Additional keys
            'startPromptMessageId',
            'adminMessages',
            'referralMessages',
            
            // Admin state keys
            'loginPrompt',
            'passwordPrompt',
            'adminDashboard',
            'winningNumberPrompt',
            'winningAmountPrompt',
            'poolNamePrompt',
            'winnersList',
            'poolStats',
            
            // Temporary messages
            'tempMessages'
        ];

        // Delete each key from session
        sessionKeysToDelete.forEach(key => {
            if (ctx.session[key]) {
                delete ctx.session[key];
            }
        });

        // Clean up any admin state
        if (ctx.session.adminState) {
            delete ctx.session.adminState;
        }

        // Clean up bonus entry flow state
        if (ctx.session.bonusEntryFlow) {
            delete ctx.session.bonusEntryFlow;
            delete ctx.session.availableBonusEntries;
            delete ctx.session.waitingForBonusQuantity;
        }

        console.log('Cleanup completed successfully');

    } catch (error) {
        console.error('Error in cleanupSelectionMessages:', error);
        // Don't throw the error to avoid breaking the flow
    }
}

// Alternative: Modular cleanup functions
async function cleanupAllMessages(ctx) {
    try {
        // Clean different types of messages in sequence
        await cleanupMainFlowMessages(ctx);
        await cleanupAdminMessages(ctx);
        await cleanupReferralMessages(ctx);
        await cleanupTemporaryMessages(ctx);
        
        console.log('All messages cleaned up successfully');
    } catch (error) {
        console.error('Error in cleanupAllMessages:', error);
    }
}

async function cleanupMainFlowMessages(ctx) {
    const mainFlowMessages = [
        'poolSelectionMessageId',
        'quantityMessageId',
        'quantitySelectionMessageId',
        'assignmentMessageId',
        'customQuantityMessageId',
        'customPromptMessageId',
        'gridMessageId',
        'randomGridMessageId',
        'confirmationMessageId',
        'paymentMessageId',
        'welcomeMessageId',
        'startPromptMessageId'
    ];

    await deleteMessagesByIds(ctx, mainFlowMessages);
}

async function cleanupAdminMessages(ctx) {
    const adminMessages = [
        'loginPrompt',
        'passwordPrompt',
        'adminDashboard',
        'winningNumberPrompt',
        'winningAmountPrompt',
        'poolNamePrompt',
        'winnersList',
        'poolStats'
    ];

    await deleteMessagesByIds(ctx, adminMessages);
    
    // Also clean up the adminMessages object if it exists
    if (ctx.session.adminMessages) {
        for (const messageId of Object.values(ctx.session.adminMessages)) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
                console.log('Could not delete admin message:', error.message);
            }
        }
        delete ctx.session.adminMessages;
    }
}

async function cleanupReferralMessages(ctx) {
    if (ctx.session.referralMessages && Array.isArray(ctx.session.referralMessages)) {
        await deleteMessagesByIds(ctx, ctx.session.referralMessages);
        delete ctx.session.referralMessages;
    }
}

async function cleanupTemporaryMessages(ctx) {
    if (ctx.session.tempMessages && Array.isArray(ctx.session.tempMessages)) {
        await deleteMessagesByIds(ctx, ctx.session.tempMessages);
        delete ctx.session.tempMessages;
    }
}

// Helper function to delete messages by IDs
async function deleteMessagesByIds(ctx, messageIdsOrKeys) {
    // Check if it's an array of message IDs or session keys
    const isArrayOfIds = Array.isArray(messageIdsOrKeys) && 
                         messageIdsOrKeys.every(id => typeof id === 'number' || typeof id === 'string');
    
    const messageIds = isArrayOfIds 
        ? messageIdsOrKeys 
        : messageIdsOrKeys.map(key => ctx.session[key]).filter(id => id);

    await Promise.all(
        messageIds.map(async (messageId) => {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
                console.log('Could not delete message:', error.message);
            }
        })
    );

    // If it was session keys, also delete them from session
    if (!isArrayOfIds) {
        messageIdsOrKeys.forEach(key => {
            if (ctx.session[key]) {
                delete ctx.session[key];
            }
        });
    }
}

// Specific cleanup for different flows
async function cleanupAfterPayment(ctx) {
    await deleteMessagesByIds(ctx, [
        'paymentMessageId',
        'confirmationMessageId',
        'gridMessageId',
        'randomGridMessageId'
    ]);
}

async function cleanupAfterEntrySelection(ctx) {
    await deleteMessagesByIds(ctx, [
        'gridMessageId',
        'randomGridMessageId',
        'assignmentMessageId',
        'quantitySelectionMessageId'
    ]);
}

async function cleanupAfterAdminAction(ctx) {
    await cleanupAdminMessages(ctx);
}

// Add this to your bot setup to automatically clean up on new commands
// bot.use(async (ctx, next) => {
//     // Store the original message if it's a command
//     if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
//         ctx.session.lastCommandMessageId = ctx.message.message_id;
//     }
    
//     await next();
// });

// Function to clean up the command message after processing
async function cleanupCommandMessage(ctx) {
    if (ctx.session.lastCommandMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.lastCommandMessageId);
            delete ctx.session.lastCommandMessageId;
        } catch (error) {
            console.log('Could not delete command message:', error.message);
        }
    }
}

// Usage example in your handlers:
// bot.action('some_action', async (ctx) => {
//     await ctx.answerCbQuery();
    
//     // Clean up previous messages before showing new content
//     await cleanupSelectionMessages(ctx);
    
//     // Your action logic here
//     // ...
// });

// Export the functions for use in other files
module.exports = {
  showStartScreen, getLast4Digits,
    cleanupSelectionMessages,
    cleanupAllMessages,
    cleanupMainFlowMessages,
    cleanupAdminMessages,
    cleanupReferralMessages,
    cleanupTemporaryMessages,
    cleanupAfterPayment,
    cleanupAfterEntrySelection,
    cleanupAfterAdminAction,
    cleanupCommandMessage,
    deleteMessagesByIds
};

// module.exports = { showStartScreen, getLast4Digits, cleanupSelectionMessages };