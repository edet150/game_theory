// In a new file, or at the top of an existing one.
// Let's create a new file `utils/startFlow.js`

const { User, Week, Winning, Entry, Payment } = require('./models');
const { Op } = require("sequelize");


async function showStartScreen(ctx) {
  const telegramId = ctx.from.id;
  const telegramUsername = ctx.from.username || `user_${telegramId}`;

  try {
    // Ensure user exists in DB
    await User.findOrCreate({
      where: { telegram_id: telegramId },
      defaults: { telegram_username: telegramUsername },
    });

    // Get current game week
    const currentLotteryWeek = await Week.findOne({
      order: [['week_number', 'DESC']]
    });
      
      
        // Fetch latest week info
            const today = new Date();
      
              // Get current week (based on dates)
              const currentWeek = await Week.findOne({
              where: {
                  starts_at: { [Op.lte]: today },
                  ends_at: { [Op.gte]: today }
              }
              });
          // If no current week found, get the latest week
          let weekLabel = 'Current Week';
          let weekCode = '';
          
          if (currentWeek) {
            weekLabel = `${currentWeek.week_name} (Week ${currentWeek.week_number}, ${currentWeek.year})`;
            weekCode = currentWeek.code;
          } else {
            // Fallback: get the most recent week
            const latestWeek = await Week.findOne({
              order: [['createdAt', 'DESC']]
            });
            if (latestWeek) {
              weekLabel = `${latestWeek.week_number} `;
              weekCode = latestWeek.code;
            }
      }
      

      console.log(currentWeek)
      
   const winningRecord = await Winning.findOne({
            where: { week_code: currentWeek.code }
        });

    // Example prize pool (later make dynamic: 80% of all entries)
    const prizeMoney = winningRecord.winning_amount ?? "100,000";


    // Fixed welcome text with proper HTML formatting
    const welcomeText = 
        `👋 Welcome to <b>Game Theory </b>\n\n` +
        `Where numbers meet strategy.\n\n` +
        `<b style="color:blue;">This Round:</b>  ${weekLabel}\n` +
        `<b>Winner Gets:</b>  ₦ ${Number(prizeMoney).toLocaleString()}\n\n` +
        `<b>Entry Window:</b>  Monday–Saturday\n` +
        `<b>Result Drop:</b>  Sunday 6:00 PM (Africa/Lagos)\n\n` +
        `Choose your arena below to make your move:`;

    const options = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                // [{ text: 'How It Works', callback_data: 'how_it_works' }],
                [{ text: 'Alpha Arena (₦200 / entry)', callback_data: `select_pool:Alpha` }],
                [{ text: 'Beta Arena (₦500 for 5 entries)', callback_data: `select_pool:Beta` }],
                [{ text: 'HighRollers Arena (₦1000 for 15 entries)', callback_data: `select_pool:HighRollers` }],
                // [{ text: '🔒 Bonus Arena (₦1000 for 25 entries)', callback_data: `select_pool:Bonus` }],
                // [{ text: 'My Entries', callback_data: 'view_entries' }],
                // [{ text: 'Referral Dashboard', callback_data: 'referral_dashboard' }],
    //             [
    //     { text: '🏦 Setup Bank Account', callback_data: 'bank_setup' },
    //     { text: '📋 My Bank Details', callback_data: 'bank_details' }
    //   ],
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
async function deleteMessagesByIds_(ctx, messageIdsOrKeys) {
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
async function deleteMessagesByIds(ctx, messageIdsOrKeys) {
  // Resolve chat ID safely
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  if (!chatId) {
    console.log('⚠️ Could not determine chat ID.');
    return;
  }

  // Determine if argument is an array of IDs or session keys
  const isArrayOfIds = Array.isArray(messageIdsOrKeys) && 
                       messageIdsOrKeys.every(id => typeof id === 'number' || typeof id === 'string');

  const messageIds = isArrayOfIds 
    ? messageIdsOrKeys.map(id => Number(id))
    : messageIdsOrKeys
        .map(key => ctx.session[key])
        .filter(id => id)
        .map(id => Number(id));

  for (const messageId of messageIds) {
    try {
      await ctx.telegram.deleteMessage(chatId, messageId);
      console.log(`🗑️ Deleted message: ${messageId}`);
    } catch (error) {
      console.log(`⚠️ Could not delete message ${messageId}: ${error.message}`);
    }
  }

  // Clean up session keys if applicable
  if (!isArrayOfIds) {
    for (const key of messageIdsOrKeys) {
      if (ctx.session[key]) {
        delete ctx.session[key];
      }
    }
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

// Show assignment method selection
async function showAssignmentMethodSelection(ctx) {
    const message = `
<b>🎯 How would you like to place your ${ctx.session.quantity} entries?</b>

Select your strategy below:
    `;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🎲 Random Pick', callback_data: 'assign_method:random' },
                    { text: '📝 ', callback_data: 'assign_method:choose' }
                ],
                [
                    { text: '🔙 Back', callback_data: 'use_bonus_entries' }
                ]
            ]
        }
    };

    await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
    });
}


async function showBonusEntrySelection(ctx, user) {
    const availableEntries = user.bonus_entries;
    
    const entryOptions = [];
    
    if (availableEntries <= 8) {
        // Show all options individually for small numbers
        for (let i = 1; i <= availableEntries; i++) {
            if (i % 4 === 1) entryOptions.push([]); // New row every 4 items
            entryOptions[entryOptions.length - 1].push({ 
                text: `${i}`, 
                callback_data: `bonus_quantity:${i}` 
            });
        }
    } else {
        // For larger numbers, show common options + custom
        entryOptions.push([
            { text: '1', callback_data: 'bonus_quantity:1' },
            { text: '2', callback_data: 'bonus_quantity:2' },
            { text: '3', callback_data: 'bonus_quantity:3' },
            { text: '5', callback_data: 'bonus_quantity:5' }
        ]);
        
        entryOptions.push([
            { text: '10', callback_data: 'bonus_quantity:10' },
            { text: '15', callback_data: 'bonus_quantity:15' },
            { text: '20', callback_data: 'bonus_quantity:20' },
            { text: '25', callback_data: 'bonus_quantity:25' }
        ]);
        
        // Add max option if reasonable
        if (availableEntries <= 30) {
            entryOptions.push([{ 
                text: `Max (${availableEntries})`, 
                callback_data: `bonus_quantity:${availableEntries}` 
            }]);
        }
    }
    
    // Always add custom option for flexibility
    entryOptions.push([{ 
        text: 'Custom Amount', 
        callback_data: 'bonus_custom' 
    }]);
    
    // Add back button
    entryOptions.push([{ 
        text: '🔙 Back', 
        callback_data: 'referral_dashboard' 
    }]);

const message = `
<b>🎁 Bonus entries</b>

You have <b>${availableEntries}</b> bonus entries available.  

How many would you like to apply?
`;


    const keyboard = {
        reply_markup: {
            inline_keyboard: entryOptions
        }
    };

    await ctx.editMessageText(message, { 
        parse_mode: 'HTML', 
        reply_markup: keyboard.reply_markup 
    });
}

async function awardReferralBonusIfFirstPurchase(userId, currentQuantity, transactionId, bot, t) {
    try {
        console.log('transaction', t)
   const users = await User.findAll({
            where: { id: userId },
            attributes: ['id', 'referred_by'],
           transaction:t // Pass transaction here
        });
    
    const user = users[0]; // Get first result
    // console.log('User found:', user);
    
    if (!user || !user.referred_by) {
        console.log('No user or no referrer found');
        return false;
    }
    
        // SIMPLIFIED: Check if user has any previous successful payments
        // This avoids complex WHERE clauses that might cause the UUID error
        const allUserPayments = await Payment.findAll({
            where: { user_id: userId },
            attributes: ['id', 'status'],
             transaction:t
            
        });
        // Filter successful payments manually
        const successfulPayments = allUserPayments.filter(payment => payment.status === 'success');
        console.log('allUserPayments', allUserPayments)
        // console.log('successfulPayments', successfulPayments)
        console.log('successfulPayments.length', successfulPayments.length)
        // If this is the first successful payment, award bonus
        if (successfulPayments.length === 1) { // Current payment + 0 previous = 1 total
            console.log('enter')
            await awardReferralBonus(user.referred_by, currentQuantity, user.id, bot, t);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking first purchase:', error);
        return false;
    }
}

async function awardReferralBonus(referrerId, purchasedEntriesCount, referredUserId, bot,t ) {
    console.log('adding referral bonus')
    console.log('adding referral bonus')
    console.log('adding referral bonus')
    console.log('adding referral bonus')
    console.log('adding purchasedEntriesCount', purchasedEntriesCount)
    try {
        const referrer = await User.findByPk(referrerId);
        if (!referrer) {
            console.log('Referrer not found with ID:', referrerId);
            return;
        }
    console.log(referrer)

        // Award bonus entries based on the first purchase quantity
        const bonusEntriesToAward = purchasedEntriesCount; // 1:1 ratio
           console.log('bonusEntriesToAward', bonusEntriesToAward) 
        if (bonusEntriesToAward > 0) {
    
            await referrer.increment({
                bonus_entries: bonusEntriesToAward,
                active_referrals: 1
            });

            
            // Notify referrer
            try {
                await bot.telegram.sendMessage(
                    referrer.telegram_id,
                    `🎉 Your referral just made their first move with ${purchasedEntriesCount} entries!\n` +
                    `You earned ${bonusEntriesToAward} bonus ${bonusEntriesToAward === 1 ? 'entry' : 'entries'}.\n` +
                    `Total bonus entries: ${referrer.bonus_entries}`,
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.log('Could not notify referrer:', error.message);
            }
            
            console.log(`Awarded ${bonusEntriesToAward} bonus entries to referrer ${referrerId}`);
        }

    } catch (error) {
        console.error('Error awarding referral bonus:', error);
    }
}
// utils/loadingMessage.js
async function startLoadingDots(ctx, text = "⏳ Verifying payment") {
  // Send initial loading message
  const loadingMsg = await ctx.reply(text);

  const dots = ["", ".", "..", "..."];
  let i = 0;

  // Interval for animation
  const interval = setInterval(async () => {
    try {
      i = (i + 1) % dots.length;
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `${text}${dots[i]}`
      );
    } catch (err) {
      console.log("Loading animation error:", err.message);
    }
  }, 500);

  // Return controller
  return {
    messageId: loadingMsg.message_id,
    stop: async (finalText = null) => {
      clearInterval(interval);
      try {
        if (finalText) {
          // Replace with final message
          await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, null, finalText);
        } else {
          // Or just delete the loading message
          await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        }
      } catch (err) {
        console.log("Error stopping loading message:", err.message);
      }
    }
  };
}


// Then in your handleSuccessfulPayment function:
// ✅ AWARD REFERRAL BONUS HERE (if applicable)
// await awardReferralBonusIfFirstPurchase(user.id, quantity, t);

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
    deleteMessagesByIds,
    showAssignmentMethodSelection,
    showBonusEntrySelection,
    awardReferralBonusIfFirstPurchase,
    startLoadingDots
};

// module.exports = { showStartScreen, getLast4Digits, cleanupSelectionMessages };