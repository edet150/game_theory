const { RafflePool, Entry, User, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const axios = require("axios");
const { trackMessage } = require('../utils/messageManager');
const bankSetupState = new Map();
  

module.exports = (bot, bankSetupState) => {
  // State management for bank setup flow
console.log('bankSetupState', bankSetupState)
  
  // Helper function to fetch banks from Paystack
async function fetchBanksFromPaystack() {
  try {
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`
      }
    });
    
    return response.data.data;
  } catch (error) {
    console.error('Error fetching banks:', error);
    throw error;
  }
}
  // Helper function to verify account with Paystack
  async function verifyAccountWithPaystack(accountNumber, bankCode) {
    try {
      const response = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error verifying account:', error);
      throw error;
    }
  }

  // Register commands FIRST (before message handlers)
  bot.command('bank_setup', async (ctx) => {
    console.log('bank_setup command received'); // Debug log
    const userId = ctx.from.id;
    bankSetupState.set(userId, { step: 'account_number' });
    
    await ctx.reply(
      '🏦 Let\'s set up your bank account for payments.\n\n' +
      'Please enter your 10-digit account number:',
      { reply_markup: { force_reply: true } }
    );
  });

  bot.command('bank_details', async (ctx) => {
    console.log('bank_details command received'); // Debug log
    try {
      const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
      
      if (!user || !user.bank_verified) {
        await ctx.reply(
          'You haven\'t set up your bank account yet. Use /bank_setup to get started.'
        );
        return;
      }
      
      await ctx.reply(
        `🏦 Your Bank Details:\n\n` +
        `Account Name: ${user.account_holder_name}\n` +
        `Account Number: ${user.bank_account_number}\n` +
        `Bank: ${user.bank_name}\n\n` +
        `To update your details, use /bank_setup again.`
      );
    } catch (error) {
      console.error('Error fetching bank details:', error);
      await ctx.reply('❌ Error retrieving your bank details.');
    }
  });


  // MIRRORED AS CALLBACKS
  // Action for setting up bank
bot.action('bank_setup', async (ctx) => {
  await ctx.answerCbQuery(); // clears loading spinner
  const userId = ctx.from.id;
  bankSetupState.set(userId, { step: 'account_number' });

  await ctx.reply(
    '🏦 Let\'s set up your bank account for withdrawals.\n\n' +
    'Please enter your 10-digit account number:',
    { reply_markup: { force_reply: true } }
  );
});

// Action for viewing bank details
bot.action('bank_details', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    
    if (!user || !user.bank_verified) {
      await ctx.reply(
        'You haven\'t set up your bank account yet. Use "Setup Bank Account" below to get started.'
      );
      return;
    }
    
    await ctx.reply(
      `🏦 Your Bank Details:\n\n` +
      `Account Name: ${user.account_holder_name}\n` +
      `Account Number: ${user.bank_account_number}\n` +
      `Bank: ${user.bank_name}\n\n` +
      `To update your details, use "Setup Bank Account".`
    );
  } catch (error) {
    console.error('Error fetching bank details:', error);
    await ctx.reply('❌ Error retrieving your bank details.');
  }
});


  // Register action handlers
bot.action(/select_bank:(\w+):(.+)/, async (ctx) => {
  console.log('Bank selection action received');
  const userId = ctx.from.id;
  const state = bankSetupState.get(userId);

  if (!state || state.step !== 'bank_selection') {
    await ctx.answerCbQuery('Session expired. Please start again with /bank_setup');
    return;
  }

  const bankCode = ctx.match[1];
  const bankName = decodeURIComponent(ctx.match[2]);

  // Store bank details
  state.bank_code = bankCode;
  state.bank_name = bankName;
  state.step = 'verification';
  bankSetupState.set(userId, state);

  await ctx.editMessageText(
    `✅ Selected: ${bankName}\n\nVerifying your account details...`
  );
  try {
    const verification = await verifyAccountWithPaystack(
      state.account_number,
      bankCode
    );

    if (verification.status) {
      state.account_name = verification.data.account_name;
      state.step = 'complete';
      bankSetupState.set(userId, state);

      await ctx.reply(
        `✅ Account verified!\n\n` +
        `Account Name: ${verification.data.account_name}\n` +
        `Account Number: ${state.account_number}\n` +
        `Bank: ${bankName}\n\nIs this correct?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Yes, Save Details', callback_data: 'confirm_bank_details' },
                { text: '❌ No, Start Over', callback_data: 'cancel_bank_setup' }
              ]
            ]
          }
        }
      );
    } else {
      await ctx.reply('❌ Account verification failed. Please check your account number and bank, then try again.');
      bankSetupState.delete(userId);
    }
  } catch (error) {
    console.error('Verification error:', error);
    await ctx.reply('❌ Error verifying account. Please try again later.');
    bankSetupState.delete(userId);
  }
});


  
  bot.action('confirm_bank_details', async (ctx) => {
    console.log('Confirm bank details action received'); // Debug log
    const userId = ctx.from.id;
    const state = bankSetupState.get(userId);
    
    if (!state || state.step !== 'complete') {
      await ctx.answerCbQuery('Session expired. Please start again with /bank_setup');
      return;
    }
    
    try {
      // Save to database
      await User.update(
        {
          bank_name: state.bank_name,
          bank_code: state.bank_code,
          bank_account_number: state.account_number,
          account_holder_name: state.account_name,
          bank_verified: true
        },
        { where: { telegram_id: userId } }
      );
      
      await ctx.editMessageText(
        '✅ Bank details saved successfully!\n\n' +
        `Account Name: ${state.account_name}\n` +
        `Account Number: ${state.account_number}\n` +
        `Bank: ${state.bank_name}\n\n` +
        'You can now receive payments to this account.\n\n' +
        '👉 Use /bank_details to view your saved bank details at any time.\n' +
        'Click /start to begin entries.'
      );

      
      bankSetupState.delete(userId);
    } catch (error) {
      console.error('Error saving bank details:', error);
      await ctx.editMessageText('❌ Error saving details. Please try again.');
      bankSetupState.delete(userId);
    }
  });
  
  bot.action('cancel_bank_setup', async (ctx) => {
    console.log('Cancel bank setup action received'); // Debug log
    const userId = ctx.from.id;
    bankSetupState.delete(userId);
    
    await ctx.editMessageText(
      'Bank setup cancelled. You can start again anytime with /bank_setup'
    );
  });

  // Now register the message handler
  setTimeout(function () {
    
  }, 3000)
  // bot.on('message', async (ctx) => {
  //   console.log('Message received:', ctx.message.text); // Debug log
    
  //   // Skip processing if it's a command (starts with /)
  //   if (ctx.message.text && ctx.message.text.startsWith('/')) {
  //     console.log('Skipping command message'); // Debug log
  //     return;
  //   }

  //   const userId = ctx.from.id;
  //   const state = bankSetupState.get(userId);
    
  //   // 0. Check for bank setup flow first
  //   if (state && state.step === 'account_number' && ctx.message.text) {
  //     console.log('Processing bank account number input'); // Debug log
  //     const text = ctx.message.text;
      
  //     // Validate account number
  //     if (!/^\d{10}$/.test(text)) {
  //       await ctx.reply('❌ Please enter a valid 10-digit account number:');
  //       return;
  //     }
      
  //     // Store account number and move to next step
  //     state.account_number = text;
  //     state.step = 'awaiting_bank_name_prefix';
  //     bankSetupState.set(userId, state);
      
  //     // Fetch banks from Paystack
  //     try {
  //       const banks = await fetchBanksFromPaystack();
        
  //       if (!banks || banks.length === 0) {
  //         await ctx.reply('❌ Unable to fetch banks at the moment. Please try again later.');
  //         bankSetupState.delete(userId);
  //         return;
  //       }
        
  //       // Create keyboard with banks (first 50 to avoid too many buttons)
  //       // const bankButtons = banks.slice(0, 50).map(bank => [
  //       //   { text: bank.name, callback_data: `select_bank:${bank.code}:${encodeURIComponent(bank.name)}` }
  //       // ]);
  //       // safer: only bank.code
  //       const bankButtons = banks.slice(0, 50).map(bank => [
  //         { text: bank.name, callback_data: `select_bank:${bank.code}` }
  //       ]);

        
  //       await ctx.reply(
  //         '✅ Account number received.\n\n' +
  //         'Now enter the *first 3 letters* of your bank name (e.g. "zen" for Zenith Bank):',
  //         { parse_mode: 'Markdown' }
  //       );

  //     } catch (error) {
  //       console.error('Error fetching banks:', error);
  //       await ctx.reply('❌ Error fetching banks. Please try again later.');
  //       bankSetupState.delete(userId);
  //     }
      
  //     return; // Important: return after handling bank setup
  //   }

  //   // 0.1. Check for bank setup flow first
  //   if (state && state.step === 'awaiting_bank_name_prefix' && ctx.message.text) {
  //     const prefix = ctx.message.text.trim().toLowerCase();

  //     if (!/^[a-z]{3,}$/.test(prefix)) {
  //       await ctx.reply('❌ Please enter at least 3 letters of your bank name.');
  //       return;
  //     }

  //     try {
  //       const banks = await fetchBanksFromPaystack();
  //       const matches = banks.filter(b => b.name.toLowerCase().startsWith(prefix));

  //       if (matches.length === 0) {
  //         await ctx.reply('❌ No banks found with that name. Try again:');
  //         return;
  //       }

  //       state.step = 'bank_selection';
  //       bankSetupState.set(userId, state);

  //       const bankButtons = matches.map(bank => [
  //         { text: bank.name, callback_data: `select_bank:${bank.code}:${encodeURIComponent(bank.name)}` }
  //       ]);

  //       await ctx.reply(
  //         `🏦 Found ${matches.length} bank(s). Please select:`,
  //         { reply_markup: { inline_keyboard: bankButtons } }
  //       );
  //     } catch (error) {
  //       console.error('Error fetching banks:', error);
  //       await ctx.reply('❌ Error fetching banks. Please try again later.');
  //       bankSetupState.delete(userId);
  //     }

  //     return;
  //   }


  //   // 1. Check for bonus quantity input first (highest priority)
  //   if (ctx.session && ctx.session.waitingForBonusQuantity && ctx.message.text) {
  //     console.log('Processing bonus quantity input'); // Debug log
  //     const quantity = parseInt(ctx.message.text, 10);
  //     const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  
  //     if (isNaN(quantity) || quantity < 1 || quantity > user.bonus_entries) {
  //       return sendError(ctx, `Please enter a valid number between 1 and ${user.bonus_entries}`);
  //     }

  //     ctx.session.quantity = quantity;
  //     ctx.session.bonusEntryFlow = true;
  //     ctx.session.waitingForBonusQuantity = false;
  
  //     // Delete the input message
  //     try {
  //       await ctx.deleteMessage();
  //     } catch (error) {
  //       console.log('Could not delete message:', error.message);
  //     }
  
  //     // Proceed to assignment method selection
  //     await showAssignmentMethodSelection(ctx);
  //     return; // Important: return after handling
  //   }

  //   // 2. Check for admin states
  //   if (ctx.session && ctx.session.adminState) {
  //     console.log('Processing admin state'); // Debug log
  //     // Track all admin messages for cleanup
  //     trackMessage(ctx, `adminMsg_${Date.now()}`);

  //     switch (ctx.session.adminState) {
  //       case ADMIN_STATES.AWAITING_USERNAME:
  //         await handleAdminUsername(ctx);
  //         break;
  //       case ADMIN_STATES.AWAITING_PASSWORD:
  //         await handleAdminPassword(ctx);
  //         break;
  //       case ADMIN_STATES.AWAITING_WINNING_NUMBER:
  //         await handleWinningNumber(ctx);
  //         break;
  //       case ADMIN_STATES.AWAITING_WINNING_AMOUNT:
  //         await handleWinningAmount(ctx);
  //         break;
  //       case ADMIN_STATES.AWAITING_POOL_NAME:
  //         await handlePoolName(ctx);
  //         break;
  //       case ADMIN_STATES.AWAITING_POOL_PRICE:
  //         await handlePoolPrice(ctx);
  //         break;
  //       case ADMIN_STATES.AWAITING_POOL_MAX_ENTRIES:
  //         await handlePoolMaxEntries(ctx);
  //         break;
  //     }
  //     return; // Important: return after handling
  //   }

  //   // 3. Check for quantity prompt
  //   if (ctx.session && ctx.session.nextAction === 'prompt_quantity' && ctx.message.text) {
  //     console.log('Processing quantity prompt'); // Debug log
  //     const quantity = parseInt(ctx.message.text, 10);
  //     if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
  //       ctx.reply('❌ Please enter a valid number between 1 and 100.');
  //       return;
  //     }

  //     ctx.session.quantity = quantity;
  //     ctx.session.nextAction = null; // Clear the next action
      
  //     // Store the custom quantity message ID for deletion
  //     ctx.session.customQuantityMessageId = ctx.message.message_id;
      
  //     const assignmentMessage = await ctx.reply(
  //       `Great! You've chosen to buy *${quantity} entries*.\n\nHow would you like them assigned?`,
  //       {
  //         parse_mode: 'Markdown',
  //         reply_markup: {
  //           inline_keyboard: [
  //             [{ text: '🎲 Random Pick', callback_data: 'assign_method:random' }],
  //             [{ text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }]
  //           ]
  //         }
  //       }
  //     );
      
  //     // Store assignment message ID for deletion
  //     ctx.session.assignmentMessageId = assignmentMessage.message_id;
  //     return; // Important: return after handling
  //   }

  //   // 4. Default fallback for unexpected messages
  //   if (ctx.message.text) {
  //     console.log('Processing fallback message'); // Debug log
  //     // If there's a previous prompt, delete it
  //     if (ctx.session && ctx.session.startPromptMessageId) {
  //       try {
  //         await ctx.deleteMessage(ctx.session.startPromptMessageId);
  //       } catch (e) {
  //         console.log("Message already deleted or can't delete");
  //       }
  //     }

  //     // Send new prompt
  //     const startPromptMessage = await ctx.reply(
  //       "Please use /start to enter the game:",
  //       {
  //         reply_markup: {
  //         inline_keyboard: [
  //           [{ text: "🚀 Enter Game", callback_data: "start_over" }],
  //         ],
  //         },
  //       }
  //     );

  //     // Save message ID in session
  //     if (!ctx.session) ctx.session = {};
  //     ctx.session.startPromptMessageId = startPromptMessage.message_id;
  //   }
  // });
};