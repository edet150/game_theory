const { RafflePool,Week, Entry, User,Admin,Winning, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const axios = require("axios");
const { trackMessage } = require('../utils/messageManager');
const bankSetupState = new Map();
const { Op } = require('sequelize');
   const { getbotInstance, getRedisClient } = require('../bot/botInstance');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const redis = getRedisClient();
  

module.exports = (bot, bankSetupState) => {
     // Handle winning number input
        async function handleWinningNumber(ctx) {
            const winningNumber = parseInt(ctx.message.text);
            
            if (isNaN(winningNumber) || winningNumber < 1000 || winningNumber > 1000000) {
                await ctx.reply('Please enter a valid number between 1 and 100:');
                return;
            }
    
            try {
                // Get current week using week_code
             
                    const today = new Date();
    
                    const currentWeek = await Week.findOne({
                    where: {
                        starts_at: { [Op.lte]: today },
                        ends_at: { [Op.gte]: today }
                    }
                    });
    
    
                if (currentWeek) {
                    // Update winning table using week_code
                    const winningEntry = await Winning.findOne({
                        where: { week_code: currentWeek.code }
                    });
                    
                    if (winningEntry) {
                        winningEntry.winning_number = winningNumber;
                        await winningEntry.save();
                        
                        // Also update week table for backward compatibility
                        currentWeek.winning_number = winningNumber;
                        await currentWeek.save();
                        
                        await cleanupAdminMessages(ctx);
                        await ctx.reply(`✅ Winning number set to: ${winningNumber}`);
                        ctx.session.adminState = null;
                        await showAdminDashboard(ctx);
                    } else {
                        await ctx.reply('❌ No winning entry found for this week.');
                    }
                } else {
                    await ctx.reply('❌ No current week found.');
                }
            } catch (error) {
                console.error('Error setting winning number:', error);
                await ctx.reply('❌ Error setting winning number.');
            }
        }
    
        // Handle winning amount input
        async function handleWinningAmount(ctx) {
            const winningAmount = parseInt(ctx.message.text.replace(/[^\d]/g, ''));
            
            if (isNaN(winningAmount) || winningAmount <= 0) {
                await ctx.reply('Please enter a valid amount:');
                return;
            }
    
            try {
                // Get current week using week_code
      
                    const today = new Date();
    
                    const currentWeek = await Week.findOne({
                    where: {
                        starts_at: { [Op.lte]: today },
                        ends_at: { [Op.gte]: today }
                    }
                    });
    
                if (currentWeek) {
                    // Update winning table using week_code
                    const winningEntry = await Winning.findOne({
                        where: { week_code: currentWeek.code }
                    });
                    
                    if (winningEntry) {
                        winningEntry.winning_amount = winningAmount;
                        await winningEntry.save();
                        
                        // Also update week table for backward compatibility
                        currentWeek.winning_amount = winningAmount;
                        await currentWeek.save();
                        
                        await cleanupAdminMessages(ctx);
                        await ctx.reply(`✅ Winning amount updated to: ₦${winningAmount.toLocaleString()}`);
                        ctx.session.adminState = null;
                        await showAdminDashboard(ctx);
                    } else {
                        await ctx.reply('❌ No winning entry found for this week.');
                    }
                } else {
                    await ctx.reply('❌ No current week found.');
                }
            } catch (error) {
                console.error('Error setting winning amount:', error);
                await ctx.reply('❌ Error setting winning amount.');
            }
        }
    
        // Pool creation handlers
        async function handlePoolName(ctx) {
            const poolName = ctx.message.text.trim();
            
            if (poolName.length < 2) {
                await ctx.reply('Please enter a valid Draw name (min 2 characters):');
                return;
            }
    
            // Check if pool already exists
            const existingPool = await RafflePool.findOne({
                where: { name: poolName }
            });
    
            if (existingPool) {
                await ctx.reply('❌ An Draw with this name already exists. Please choose a different name:');
                return;
            }
    
            ctx.session.newPoolName = poolName;
            ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_PRICE;
            await ctx.reply('Please enter the price per entry for this Draw:');
        }
    
        async function handlePoolPrice(ctx) {
            const price = parseInt(ctx.message.text.replace(/[^\d]/g, ''));
            
            if (isNaN(price) || price <= 0) {
                await ctx.reply('Please enter a valid price:');
                return;
            }
    
            ctx.session.newPoolPrice = price;
            ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_MAX_ENTRIES;
            await ctx.reply('Please enter the maximum number of entries for this Draw:');
        }
    
        async function handlePoolMaxEntries(ctx) {
            const maxEntries = parseInt(ctx.message.text);
            
            if (isNaN(maxEntries) || maxEntries <= 0) {
                await ctx.reply('Please enter a valid number:');
                return;
            }
    
            try {
                // Create new pool
                await RafflePool.create({
                    name: ctx.session.newPoolName,
                    price_per_entry: ctx.session.newPoolPrice,
                    max_entries: maxEntries,
                    is_active: true
                });
    
                await ctx.reply(`✅ New Draw created successfully!\n\n` +
                    `Name: ${ctx.session.newPoolName}\n` +
                    `Price: ₦${ctx.session.newPoolPrice.toLocaleString()}\n` +
                    `Max Entries: ${maxEntries.toLocaleString()}`);
    
                // Clear session data
                delete ctx.session.newPoolName;
                delete ctx.session.newPoolPrice;
                ctx.session.adminState = null;
    
                await showAdminDashboard(ctx);
            } catch (error) {
                console.error('Error creating Draw:', error);
                await ctx.reply('❌ Error creating Draw. Please try again.');
            }
        }
      // Admin authentication states
    const ADMIN_STATES = {
        AWAITING_USERNAME: 'awaiting_admin_username',
        AWAITING_PASSWORD: 'awaiting_admin_password',
        AWAITING_WINNING_NUMBER: 'awaiting_winning_number',
        AWAITING_WINNING_AMOUNT: 'awaiting_winning_amount',
        AWAITING_POOL_NAME: 'awaiting_pool_name',
        AWAITING_POOL_PRICE: 'awaiting_pool_price',
        AWAITING_POOL_MAX_ENTRIES: 'awaiting_pool_max_entries'
    };

    // Track admin messages for cleanup
    const trackMessage = (ctx, messageType) => {
        if (!ctx.session.adminMessages) {
            ctx.session.adminMessages = {};
        }
        ctx.session.adminMessages[messageType] = ctx.message?.message_id || 
                                               ctx.callbackQuery?.message?.message_id;
    };

        // Admin login handlers
    async function handleAdminUsername(ctx) {
        ctx.session.adminUsername = ctx.message.text;
        ctx.session.adminState = ADMIN_STATES.AWAITING_PASSWORD;
        
        await cleanupAdminMessages(ctx, ['loginPrompt']);
        const message = await ctx.reply('Please enter your password:');
        trackMessage(ctx, 'passwordPrompt');
    }

    async function handleAdminPassword(ctx) {
        const password = ctx.message.text;
        
        try {
            // Verify admin credentials
            const admin = await Admin.findOne({
                where: {
                    username: ctx.session.adminUsername,
                    password: password // In production, use hashed passwords
                }
            });

            if (admin) {
                ctx.session.isAdmin = true;
                ctx.session.adminState = null;
                
                await cleanupAdminMessages(ctx);
                await ctx.reply('✅ Login successful!');
                await showAdminDashboard(ctx);
            } else {
                ctx.session.adminState = null;
                await cleanupAdminMessages(ctx);
                await ctx.reply('❌ Invalid credentials. Please use /admin to try again.');
            }
        } catch (error) {
            console.error('Admin login error:', error);
            ctx.session.adminState = null;
            await cleanupAdminMessages(ctx);
            await ctx.reply('❌ Login failed. Please try again.');
        }
    }
        // Add this button to your admin dashboard
    async function showAdminDashboard(ctx) {
        const isLocked = await redis.get('entries_locked');
        const lockStatus = isLocked ? '🔒 Locked' : '🔓 Unlocked';
        
        const keyboard = {
            reply_markup: {
               inline_keyboard: [
                    [
                        { text: '🏆 Set Winning Number', callback_data: 'admin_set_winning_number' },
                        { text: '💰 Update Prize Amount', callback_data: 'admin_set_winning_amount' }
                    ],
                    [
                        { text: '👥 Get Weekly Winners', callback_data: 'admin_get_winners' },
                        { text: '➕ Create New Pool', callback_data: 'admin_create_pool' }
                    ],
                    [
                        { text: '📊 Draw Statistics', callback_data: 'admin_pool_stats' },
                        { text: '📋 Daily Entries Report', callback_data: 'admin_send_to_channel' }
                    ],
                    [
                        { text: '🎯 Announce Winner', callback_data: 'admin_announce_winner' },
                        { text: '📢 Post Winning Number', callback_data: 'admin_post_winning_number' }
                    ],
                    [
                        { text: `${lockStatus} Entries`, callback_data: 'admin_toggle_entries_lock' },
                        { text: `All Users`, callback_data: 'admin_all_users' }
                    ],
                    [
                    { text: '🔒 Toggle Bonus Draw', callback_data: 'admin_toggle_bonus' },
                    { text: '➕ Create New Bonus', callback_data: 'admin_create_bonus' }
                    ],
                    [
                    { text: '🤝 Manage Partners', callback_data: 'admin_manage_partners' }
                    ],
                    [
                        { text: '🚪 Logout', callback_data: 'admin_logout' },
                        { text: '🚪 revenue', callback_data: 'admin_weekly_revenue' }
                    ]
                ]
            }
        };

        // Only cleanup if we're not already showing the dashboard
        if (!ctx.session.adminMessages?.adminDashboard) {
            await cleanupAdminMessages(ctx);
        }
        
        const message = await ctx.reply('🛠️ Admin Dashboard\n\nSelect an action:', keyboard);
        trackMessage(ctx, 'adminDashboard');
    }
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
                    ],
                    [
                        { text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }
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
        // Safe answer callback query with error handling
    const safeAnswerCbQuery = async (ctx, text) => {
        try {
            await ctx.answerCbQuery(text);
        } catch (error) {
            console.log('Callback query answer error:', error.message);
            // Don't throw, just log the error
        }
    };

    // Cleanup admin messages
    const cleanupAdminMessages = async (ctx, typesToKeep = []) => {
        if (!ctx.session.adminMessages) return;
        
        for (const [messageType, messageId] of Object.entries(ctx.session.adminMessages)) {
            if (typesToKeep.includes(messageType)) continue;
            
            try {
                await ctx.deleteMessage(messageId);
            } catch (error) {
                console.log(`Could not delete admin message ${messageType}:`, error.message);
            }
        }
        
        // Reset messages object, keeping only specified types
        if (typesToKeep.length > 0) {
            const keptMessages = {};
            for (const type of typesToKeep) {
                if (ctx.session.adminMessages[type]) {
                    keptMessages[type] = ctx.session.adminMessages[type];
                }
            }
            ctx.session.adminMessages = keptMessages;
        } else {
            ctx.session.adminMessages = {};
        }
    };
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
    
  bot.on('message', async (ctx) => {
    console.log('Message received:', ctx.message.text); // Debug log
    
    // Skip processing if it's a command (starts with /)
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      console.log('Skipping command message'); // Debug log
      return;
    }

    const userId = ctx.from.id;
    const state = bankSetupState.get(userId);
    
    // 0. Check for bank setup flow first
    if (state && state.step === 'account_number' && ctx.message.text) {
      console.log('Processing bank account number input'); // Debug log
      const text = ctx.message.text;
      
      // Validate account number
      if (!/^\d{10}$/.test(text)) {
        await ctx.reply('❌ Please enter a valid 10-digit account number:');
        return;
      }
      
      // Store account number and move to next step
      state.account_number = text;
      state.step = 'awaiting_bank_name_prefix';
      bankSetupState.set(userId, state);
      
      // Fetch banks from Paystack
      try {
        const banks = await fetchBanksFromPaystack();
        
        if (!banks || banks.length === 0) {
          await ctx.reply('❌ Unable to fetch banks at the moment. Please try again later.');
          bankSetupState.delete(userId);
          return;
        }
        
        // Create keyboard with banks (first 50 to avoid too many buttons)
        // const bankButtons = banks.slice(0, 50).map(bank => [
        //   { text: bank.name, callback_data: `select_bank:${bank.code}:${encodeURIComponent(bank.name)}` }
        // ]);
        // safer: only bank.code
        const bankButtons = banks.slice(0, 50).map(bank => [
          { text: bank.name, callback_data: `select_bank:${bank.code}` }
        ]);

        
        await ctx.reply(
          '✅ Account number received.\n\n' +
          'Now enter the *first 3 letters* of your bank name (e.g. "zen" for Zenith Bank):',
          { parse_mode: 'Markdown' }
        );

      } catch (error) {
        console.error('Error fetching banks:', error);
        await ctx.reply('❌ Error fetching banks. Please try again later.');
        bankSetupState.delete(userId);
      }
      
      return; // Important: return after handling bank setup
    }

    // 0.1. Check for bank setup flow first
    if (state && state.step === 'awaiting_bank_name_prefix' && ctx.message.text) {
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
        bankSetupState.set(userId, state);

        const bankButtons = matches.map(bank => [
          { text: bank.name, callback_data: `select_bank:${bank.code}:${encodeURIComponent(bank.name)}` }
        ]);

        await ctx.reply(
          `🏦 Found ${matches.length} bank(s). Please select:`,
          { reply_markup: { inline_keyboard: bankButtons } }
        );
      } catch (error) {
        console.error('Error fetching banks:', error);
        await ctx.reply('❌ Error fetching banks. Please try again later.');
        bankSetupState.delete(userId);
      }

      return;
    }


    // 1. Check for bonus quantity input first (highest priority)
    if (ctx.session && ctx.session.waitingForBonusQuantity && ctx.message.text) {
      console.log('Processing bonus quantity input'); // Debug log
      const quantity = parseInt(ctx.message.text, 10);
      const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  
      if (isNaN(quantity) || quantity < 1 || quantity > user.bonus_entries) {
        return sendError(ctx, `Please enter a valid number between 1 and ${user.bonus_entries}`);
      }

      ctx.session.quantity = quantity;
      ctx.session.bonusEntryFlow = true;
      ctx.session.waitingForBonusQuantity = false;
  
      // Delete the input message
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.log('Could not delete message:', error.message);
      }
  
      // Proceed to assignment method selection
      await showAssignmentMethodSelection(ctx);
      return; // Important: return after handling
    }

    // 2. Check for admin states
    if (ctx.session && ctx.session.adminState) {
      console.log('Processing admin state'); // Debug log
      // Track all admin messages for cleanup
      trackMessage(ctx, `adminMsg_${Date.now()}`);

      switch (ctx.session.adminState) {
        case ADMIN_STATES.AWAITING_USERNAME:
          await handleAdminUsername(ctx);
          break;
        case ADMIN_STATES.AWAITING_PASSWORD:
          await handleAdminPassword(ctx);
          break;
        case ADMIN_STATES.AWAITING_WINNING_NUMBER:
          await handleWinningNumber(ctx);
          break;
        case ADMIN_STATES.AWAITING_WINNING_AMOUNT:
          await handleWinningAmount(ctx);
          break;
        case ADMIN_STATES.AWAITING_POOL_NAME:
          await handlePoolName(ctx);
          break;
        case ADMIN_STATES.AWAITING_POOL_PRICE:
          await handlePoolPrice(ctx);
          break;
        case ADMIN_STATES.AWAITING_POOL_MAX_ENTRIES:
          await handlePoolMaxEntries(ctx);
          break;
      }
      return; // Important: return after handling
    }

    // 3. Check for quantity prompt
    if (ctx.session && ctx.session.nextAction === 'prompt_quantity' && ctx.message.text) {
      console.log('Processing quantity prompt'); // Debug log
      const quantity = parseInt(ctx.message.text, 10);
      if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
        ctx.reply('❌ Please enter a valid number between 1 and 100.');
        return;
      }

      ctx.session.quantity = quantity;
      ctx.session.nextAction = null; // Clear the next action
      
      // Store the custom quantity message ID for deletion
      ctx.session.customQuantityMessageId = ctx.message.message_id;
      
      const assignmentMessage = await ctx.reply(
        `Great! You've chosen to buy *${quantity} entries*.\n\nHow would you like them assigned?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎲 Random Pick', callback_data: 'assign_method:random' }],
              [{ text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }]
            ]
          }
        }
      );
      
      // Store assignment message ID for deletion
      ctx.session.assignmentMessageId = assignmentMessage.message_id;
      return; // Important: return after handling
    }
    // 4. create bonus
     if (ctx.session.nextAction === 'creating_bonus') {
    const parts = ctx.message.text.split(',').map(p => p.trim());
    if (parts.length < 4) {
      return ctx.reply('⚠️ Invalid format. Try again.');
    }

    const [name, price, quantity, max] = parts;

    try {
      const pool = await RafflePool.create({
        name,
        price_per_entry: parseInt(price, 10),
        quantity: parseInt(quantity, 10),
        max_entries: parseInt(max, 10),
        type: 'bonus'
      });

      ctx.reply(`✅ Bonus Draw "${pool.name}" created successfully!`);
      ctx.session.nextAction = null;
    } catch (err) {
      console.error(err);
      ctx.reply('⚠️ Failed to create Bonus Draw. Maybe name already exists?');
    }
      }

     if (ctx.session.waitingForBonusQuantity && ctx.message.text) {
            const quantity = parseInt(ctx.message.text, 10);
            const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        
            if (isNaN(quantity) || quantity < 1 || quantity > user.bonus_entries) {
                return sendError(ctx, `Please enter a valid number between 1 and ${user.bonus_entries}`);
            }

            ctx.session.quantity = quantity;
            ctx.session.bonusEntryFlow = true;
            ctx.session.waitingForBonusQuantity = false;
        
            // Delete the input message
            try {
                await ctx.deleteMessage();
            } catch (error) {
                console.log('Could not delete message:', error.message);
            }
        
            // Proceed to assignment method selection
            await showAssignmentMethodSelection(ctx);
           }
       
    // 5. Default fallback for unexpected messages
    if (ctx.message.text) {
      console.log('Processing fallback message'); // Debug log
      // If there's a previous prompt, delete it
      if (ctx.session && ctx.session.startPromptMessageId) {
        try {
          await ctx.deleteMessage(ctx.session.startPromptMessageId);
        } catch (e) {
          console.log("Message already deleted or can't delete");
        }
      }

      // Send new prompt
      const startPromptMessage = await ctx.reply(
        "Please use /start to enter the game:",
        {
          reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 Restart Game", callback_data: "start_over" }],
          ],
          },
        }
      );

      // Save message ID in session
      if (!ctx.session) ctx.session = {};
      ctx.session.startPromptMessageId = startPromptMessage.message_id;
    }
  });
};