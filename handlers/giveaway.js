// handlers/giveaway.js
const db = require('../models');
const axios = require('axios');

// Constants
const REQUIRED_CHANNEL = process.env.GIVEAWAY_CHANNEL || '@modulo_giveaway';

// Helper function to check channel membership
async function isUserInChannel(ctx, channelUsername) {
  try {
    const member = await ctx.telegram.getChatMember(channelUsername, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error("⚠️ Error checking channel membership:", error.message);
    return false;
  }
}

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
    return [];
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

// Helper function to get next entry number
async function getNextEntryNumber() {
  try {
    const lastEntry = await db.GiveawayEntry.findOne({
      order: [['entry_number', 'DESC']]
    });
    return lastEntry ? lastEntry.entry_number + 1 : 1;
  } catch (error) {
    console.error('Error getting next entry number:', error);
    return 1;
  }
}

// Helper function to check if user has bank details in giveaway table
async function hasBankDetails(telegramId) {
  try {
    const entry = await db.GiveawayEntry.findOne({ where: { telegram_id: telegramId } });
    return entry && entry.account_number && entry.bank_name && entry.account_holder_name;
  } catch (error) {
    console.error('Error checking bank details:', error);
    return false;
  }
}

// Helper function to get user bank details from giveaway table
async function getUserBankDetails(telegramId) {
  try {
    const entry = await db.GiveawayEntry.findOne({ where: { telegram_id: telegramId } });
    if (entry && entry.account_number && entry.bank_name && entry.account_holder_name) {
      return {
        account_number: entry.account_number,
        bank_name: entry.bank_name,
        account_holder_name: entry.account_holder_name
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting bank details:', error);
    return null;
  }
}

// Show main giveaway menu
async function showGiveawayMainMenu(ctx) {
  await ctx.reply(
    `<b>🎁 Giveaway Dashboard</b>\n\n` +
    `You're all set to participate in our giveaway! 🎉\n\n` +
    `Get your entry number and share it on our social media to increase your chances!`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Get My Entry", callback_data: "get_giveaway_entry" }],
          [{ text: "🏦 Update Bank Account", callback_data: "giveaway_bank_setup" }],
          [{ text: "ℹ️ Check My Account", callback_data: "giveaway_check_account" }]
        ]
      }
    }
  );
}

module.exports = (bot) => {
  const giveawayBankSetupState = new Map();

  // Start command for bot2
  bot.start(async (ctx) => {
    console.log('Giveaway bot start command received');
    const userId = ctx.from.id;
    
    // Check channel membership first
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);
    
    if (!isInChannel) {
      await ctx.reply(
        `<b>🎁 Welcome to Our Giveaway!</b>\n\n` +
        `To participate in the giveaway, you need to join our official channel first.\n\n` +
        `Join the channel below and then click "Verify" to continue:`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@','')}` }],
              [{ text: "✅ Verify", callback_data: "verify_channel" }]
            ]
          }
        }
      );
      return;
    }
    
    // Check if user has bank details in giveaway table
    const hasBank = await hasBankDetails(userId);
    
    if (!hasBank) {
      await ctx.reply(
        `<b>🎁 Welcome to Our Giveaway!</b>\n\n` +
        `You've successfully joined our channel! 🎉\n\n` +
        `To participate in the giveaway, you need to set up your bank account details for potential winnings.\n\n` +
        `Please set up your bank account first:`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Setup Bank Account", callback_data: "giveaway_bank_setup" }],
              [{ text: "🔄 Check Bank Status", callback_data: "giveaway_check_bank" }]
            ]
          }
        }
      );
      return;
    }
    
    // User has joined channel and has bank details - show main giveaway menu
    await showGiveawayMainMenu(ctx);
  });

  // Verify channel callback
  bot.action("verify_channel", async (ctx) => {
    await ctx.answerCbQuery("Checking… ⏳");

    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);

    if (!isInChannel) {
      return await ctx.reply(
        `<b>❌ Error:</b> You haven't joined our channel yet.\n\n` +
        `To participate in the giveaway, please join our official channel first.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace('@','')}` }],
              [{ text: "✅ Verify", callback_data: "verify_channel" }]
            ]
          }
        }
      );
    }

    // Check if user has bank details in giveaway table
    const hasBank = await hasBankDetails(ctx.from.id);
    
    if (!hasBank) {
      await ctx.reply(
        `✅ Great! You've joined our channel! 🎉\n\n` +
        `Now, please set up your bank account details to participate in the giveaway:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Setup Bank Account", callback_data: "giveaway_bank_setup" }]
            ]
          }
        }
      );
    } else {
      await showGiveawayMainMenu(ctx);
    }
  });

  // Get giveaway entry
  bot.action("get_giveaway_entry", async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    
    // Double-check channel membership and bank details
    const isInChannel = await isUserInChannel(ctx, REQUIRED_CHANNEL);
    if (!isInChannel) {
      await ctx.reply("Please verify your channel membership first using /start");
      return;
    }
    
    const bankDetails = await getUserBankDetails(userId);
    if (!bankDetails) {
      await ctx.reply("Please set up your bank account first using /start");
      return;
    }
    
    try {
      // Check if user already has an entry
      let entry = await db.GiveawayEntry.findOne({ where: { telegram_id: userId } });
      
      if (!entry) {
        // Create new entry with bank details
        const entryNumber = await getNextEntryNumber();
        entry = await db.GiveawayEntry.create({
          telegram_id: userId,
          username: ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name || '',
          account_number: bankDetails.account_number,
          bank_name: bankDetails.bank_name,
          account_holder_name: bankDetails.account_holder_name,
          entry_number: entryNumber
        });
      }
      
      // Show entry details
      await ctx.reply(
        `<b>🎁 Your Giveaway Entry</b>\n\n` +
        `📋 <b>Entry Number:</b> #${entry.entry_number}\n` +
        `👤 <b>Username:</b> ${entry.username}\n` +
        `🏦 <b>Account Number:</b> ${entry.account_number}\n` +
        `📊 <b>Bank:</b> ${entry.bank_name}\n\n` +
        `<b>📸 Instructions:</b>\n` +
        `1. Screenshot this message\n` +
        `2. Post it as a comment under our tweet\n` +
        `3. Tag 3 friends\n` +
        `4. Use hashtag #ModuloGiveaway\n\n` +
        `Good luck! 🍀`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Refresh Entry", callback_data: "get_giveaway_entry" }],
              [{ text: "🏦 Update Bank", callback_data: "giveaway_bank_setup" }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('Error creating giveaway entry:', error);
      await ctx.reply("❌ Error creating your entry. Please try again.");
    }
  });

  // Check account details
  bot.action("giveaway_check_account", async (ctx) => {
    await ctx.answerCbQuery();
    
    const bankDetails = await getUserBankDetails(ctx.from.id);
    
    if (!bankDetails) {
      await ctx.reply(
        "❌ You haven't set up your bank account yet.\n\nPlease set it up to participate in the giveaway.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏦 Setup Bank Account", callback_data: "giveaway_bank_setup" }]
            ]
          }
        }
      );
      return;
    }
    
    await ctx.reply(
      `<b>🏦 Your Bank Details</b>\n\n` +
      `✅ <b>Status:</b> Verified\n` +
      `👤 <b>Account Name:</b> ${bankDetails.account_holder_name}\n` +
      `🔢 <b>Account Number:</b> ${bankDetails.account_number}\n` +
      `🏦 <b>Bank:</b> ${bankDetails.bank_name}\n\n` +
      `Your account is ready for the giveaway! 🎉`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Get My Entry", callback_data: "get_giveaway_entry" }],
            [{ text: "✏️ Update Details", callback_data: "giveaway_bank_setup" }]
          ]
        }
      }
    );
  });

  // Bank setup for giveaway
  bot.action("giveaway_bank_setup", async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    giveawayBankSetupState.set(userId, { step: 'account_number' });

    await ctx.reply(
      '🏦 Let\'s set up your bank account for giveaway winnings.\n\n' +
      'Please enter your 10-digit account number:',
      { reply_markup: { force_reply: true } }
    );
  });

  // Check bank status
  bot.action("giveaway_check_bank", async (ctx) => {
    await ctx.answerCbQuery();
    
    const hasBank = await hasBankDetails(ctx.from.id);
    
    if (hasBank) {
      await ctx.reply("✅ Your bank account is already set up and verified!");
      await showGiveawayMainMenu(ctx);
    } else {
      await ctx.reply("❌ You haven't set up your bank account yet.");
    }
  });

  // Message handler for bot2 bank setup
  bot.on('message', async (ctx) => {
    // Skip commands
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      return;
    }

    const userId = ctx.from.id;
    const state = giveawayBankSetupState.get(userId);
    
    if (!state) return;

    // Handle account number input
    if (state.step === 'account_number' && ctx.message.text) {
      const text = ctx.message.text.trim();
      
      if (!/^\d{10}$/.test(text)) {
        await ctx.reply('❌ Please enter a valid 10-digit account number:');
        return;
      }
      
      state.account_number = text;
      state.step = 'awaiting_bank_name_prefix';
      giveawayBankSetupState.set(userId, state);
      
      await ctx.reply(
        '✅ Account number received.\n\n' +
        'Now enter the *first 3 letters* of your bank name (e.g. "zen" for Zenith Bank):',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Handle bank name prefix
    if (state.step === 'awaiting_bank_name_prefix' && ctx.message.text) {
      const prefix = ctx.message.text.trim().toLowerCase();

      if (!/^[a-z]{3,}$/.test(prefix)) {
        await ctx.reply('❌ Please enter at least 3 letters of your bank name.');
        return;
      }

      try {
        const banks = await fetchBanksFromPaystack();
        const matches = banks.filter(b => b.name.toLowerCase().startsWith(prefix));

        if (matches.length === 0) {
          await ctx.reply('❌ No banks found with that name. Try again:');
          return;
        }

        state.step = 'bank_selection';
        state.matchedBanks = matches;
        giveawayBankSetupState.set(userId, state);

        const bankButtons = matches.map(bank => [
          { text: bank.name, callback_data: `giveaway_select_bank:${bank.code}` }
        ]);

        await ctx.reply(
          `🏦 Found ${matches.length} bank(s). Please select:`,
          { reply_markup: { inline_keyboard: bankButtons } }
        );
      } catch (error) {
        console.error('Error fetching banks:', error);
        await ctx.reply('❌ Error fetching banks. Please try again later.');
        giveawayBankSetupState.delete(userId);
      }
      return;
    }
  });

  // Bank selection callback - UPDATED to only use GiveawayEntry table
  bot.action(/giveaway_select_bank:(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const bankCode = ctx.match[1];
    const userId = ctx.from.id;
    const state = giveawayBankSetupState.get(userId);

    if (!state || !state.matchedBanks) {
      await ctx.reply('❌ Session expired. Please start over with /start');
      giveawayBankSetupState.delete(userId);
      return;
    }

    const selectedBank = state.matchedBanks.find(bank => bank.code === bankCode);
    if (!selectedBank) {
      await ctx.reply('❌ Invalid bank selection. Please try again.');
      return;
    }

    try {
      // Verify account with Paystack
      const verification = await verifyAccountWithPaystack(state.account_number, bankCode);
      
      if (verification.status === true) {
        // Check if user already has a giveaway entry
        let entry = await db.GiveawayEntry.findOne({ where: { telegram_id: userId } });
        
        if (entry) {
          // Update existing entry
          entry.account_number = state.account_number;
          entry.bank_name = selectedBank.name;
          entry.account_holder_name = verification.data.account_name;
          await entry.save();
        } else {
          // Create new giveaway entry
          const entryNumber = await getNextEntryNumber();
          entry = await db.GiveawayEntry.create({
            telegram_id: userId,
            username: ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name || '',
            account_number: state.account_number,
            bank_name: selectedBank.name,
            account_holder_name: verification.data.account_name,
            entry_number: entryNumber
          });
        }

        giveawayBankSetupState.delete(userId);
        
        await ctx.reply(
          `✅ Bank account verified successfully!\n\n` +
          `🏦 <b>Bank:</b> ${selectedBank.name}\n` +
          `👤 <b>Account Name:</b> ${verification.data.account_name}\n` +
          `🔢 <b>Account Number:</b> ${state.account_number}\n\n` +
          `Your account is now ready for the giveaway! 🎉`,
          { parse_mode: 'HTML' }
        );
        
        await showGiveawayMainMenu(ctx);
      }
    } catch (error) {
      console.error('Error verifying account:', error);
      await ctx.reply(
        '❌ Error verifying account. Please check your account number and bank selection, then try again.'
      );
    }
  });

  console.log('✅ Giveaway handlers registered for bot2');
};