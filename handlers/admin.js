// handlers/admin.js
const { User ,RafflePool, sequelize, Winning, WeeklyWinner,winningEntries, Payment, Admin, Entry, Week} = require('../models');const { Op } = require("sequelize");
const { getbotInstance, getRedisClient } = require('../bot/botInstance');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const redis = getRedisClient();
module.exports = (bot, bankSetupState) => {
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

    // Admin commands handler
    bot.command('admin_dadi', async (ctx) => {
        // Clean up any previous messages
        await cleanupAdminMessages(ctx);
        
        // Check if already logged in
        if (ctx.session.isAdmin) {
            await showAdminDashboard(ctx);
            return;
        }

        // Prompt for login
        ctx.session.adminState = ADMIN_STATES.AWAITING_USERNAME;
        const message = await ctx.reply('🔐 Admin Login\n\nPlease enter your username:');
        trackMessage(ctx, 'loginPrompt');
    });

    // Admin commands handler
    bot.command('show_dash', async (ctx) => {
        // Clean up any previous messages
        await cleanupAdminMessages(ctx);
        
        // Check if already logged in
        if (ctx.session.isAdmin) {
            await showAdminDashboard(ctx);
            return;
        }

        // remove state step
        state.step = null;
        // Prompt for login
        ctx.session.adminState = ADMIN_STATES.AWAITING_USERNAME;
        const message = await ctx.reply('🔐 Admin Login\n\nPlease enter your username:');
        trackMessage(ctx, 'loginPrompt');
    });

    // Command to create admin user (for initial setup)
    bot.command('createadmin', async (ctx) => {
        console.log('creating admin')
        // Basic protection - you might want to add additional security
        const args = ctx.message.text.split(' ').slice(1);
        
        if (args.length < 2) {
            await ctx.reply('Usage: /createadmin <username> <password>');
            return;
        }

        const [username, password] = args;

        try {
            // Check if admin already exists
            const existingAdmin = await Admin.findOne({ where: { username } });
            if (existingAdmin) {
                await ctx.reply('❌ Admin user already exists.');
                return;
            }

            // Create new admin (in production, hash the password!)
            await Admin.create({
                username,
                password, // Hash this in production!
                created_at: new Date()
            });

            await ctx.reply('✅ Admin user created successfully!');
        } catch (error) {
            console.error('Error creating admin:', error);
            await ctx.reply('❌ Error creating admin user.');
        }
    });
    // Add this to your admin handlers
    bot.action('admin_toggle_entries_lock', async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            const isLocked = await redis.get('entries_locked');
            
            if (isLocked) {
                // Unlock entries
                await redis.del('entries_locked');
                await sendSuccess(ctx, '✅ Entries have been unlocked. Users can now make entries.');
            } else {
                // Lock entries
                await redis.set('entries_locked', 'true');
                await sendSuccess(ctx, '🔒 Entries have been locked. Users cannot make new entries.');
            }
            
            // Refresh admin dashboard to show updated status
            await showAdminDashboard(ctx);
        } catch (error) {
            console.error('Error toggling entries lock:', error);
            await sendError(ctx, 'Failed to toggle entries lock.');
        }
    });

    // Handle admin messages based on state
    bot.on('message_', async (ctx) => {
        // Skip processing if it's a command (starts with /)
        if (ctx.message.text && ctx.message.text.startsWith('/')) {
            return;
        }

        // 1. Check for bonus quantity input first (highest priority)
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
            return; // Important: return after handling
        }

        // 2. Check for admin states
        if (ctx.session.adminState) {
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
        if (ctx.session.nextAction === 'prompt_quantity' && ctx.message.text) {
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

        // 4. Default fallback for unexpected messages
        if (ctx.message.text) {
            // If there's a previous prompt, delete it
            if (ctx.session?.startPromptMessageId) {
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
                        [{ text: "🚀 Enter Game", callback_data: "start_over" }],
                    ],
                    },
                }
                );


            // Save message ID in session
            if (!ctx.session) ctx.session = {};
            ctx.session.startPromptMessageId = startPromptMessage.message_id;
        }
    });
  async function fetchBanksFromPaystack() {
    try {
      const response = await axios.get('https://api.paystack.co/bank', {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      });
      
      return response.data.data;
    } catch (error) {
      console.error('Error fetching banks:', error);
      throw error;
    }
  }
    // bot.on('message', async (ctx) => {
    // // Skip processing if it's a command (starts with /)
    // if (ctx.message.text && ctx.message.text.startsWith('/')) {
    //   return;
    // }

    // const userId = ctx.from.id;
    // const state = bankSetupState.get(userId);
    
    // // 0. Check for bank setup flow first
    // if (state && state.step === 'account_number' && ctx.message.text) {
    //   const text = ctx.message.text;
      
    //   // Validate account number
    //   if (!/^\d{10}$/.test(text)) {
    //     await ctx.reply('❌ Please enter a valid 10-digit account number:');
    //     return;
    //   }
      
    //   // Store account number and move to next step
    //   state.account_number = text;
    //   state.step = 'bank_selection';
    //   bankSetupState.set(userId, state);
      
    //   // Fetch banks from Paystack
    //   try {
    //     const banks = await fetchBanksFromPaystack();
        
    //     if (!banks || banks.length === 0) {
    //       await ctx.reply('❌ Unable to fetch banks at the moment. Please try again later.');
    //       bankSetupState.delete(userId);
    //       return;
    //     }
        
    //     // Create keyboard with banks (first 50 to avoid too many buttons)
    //     const bankButtons = banks.slice(0, 50).map(bank => [
    //       { text: bank.name, callback_data: `select_bank:${bank.code}:${encodeURIComponent(bank.name)}` }
    //     ]);
        
    //     await ctx.reply(
    //       '✅ Account number received. Now select your bank:',
    //       {
    //         reply_markup: {
    //           inline_keyboard: bankButtons
    //         }
    //       }
    //     );
    //   } catch (error) {
    //     console.error('Error fetching banks:', error);
    //     await ctx.reply('❌ Error fetching banks. Please try again later.');
    //     bankSetupState.delete(userId);
    //   }
      
    //   return; // Important: return after handling bank setup
    // }

    // // 1. Check for bonus quantity input first (highest priority)
    // if (ctx.session.waitingForBonusQuantity && ctx.message.text) {
    //   const quantity = parseInt(ctx.message.text, 10);
    //   const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  
    //   if (isNaN(quantity) || quantity < 1 || quantity > user.bonus_entries) {
    //     return sendError(ctx, `Please enter a valid number between 1 and ${user.bonus_entries}`);
    //   }

    //   ctx.session.quantity = quantity;
    //   ctx.session.bonusEntryFlow = true;
    //   ctx.session.waitingForBonusQuantity = false;
  
    //   // Delete the input message
    //   try {
    //     await ctx.deleteMessage();
    //   } catch (error) {
    //     console.log('Could not delete message:', error.message);
    //   }
  
    //   // Proceed to assignment method selection
    //   await showAssignmentMethodSelection(ctx);
    //   return; // Important: return after handling
    // }

    // // 2. Check for admin states
    // if (ctx.session.adminState) {
    //   // Track all admin messages for cleanup
    //   trackMessage(ctx, `adminMsg_${Date.now()}`);

    //   switch (ctx.session.adminState) {
    //     case ADMIN_STATES.AWAITING_USERNAME:
    //       await handleAdminUsername(ctx);
    //       break;
    //     case ADMIN_STATES.AWAITING_PASSWORD:
    //       await handleAdminPassword(ctx);
    //       break;
    //     case ADMIN_STATES.AWAITING_WINNING_NUMBER:
    //       await handleWinningNumber(ctx);
    //       break;
    //     case ADMIN_STATES.AWAITING_WINNING_AMOUNT:
    //       await handleWinningAmount(ctx);
    //       break;
    //     case ADMIN_STATES.AWAITING_POOL_NAME:
    //       await handlePoolName(ctx);
    //       break;
    //     case ADMIN_STATES.AWAITING_POOL_PRICE:
    //       await handlePoolPrice(ctx);
    //       break;
    //     case ADMIN_STATES.AWAITING_POOL_MAX_ENTRIES:
    //       await handlePoolMaxEntries(ctx);
    //       break;
    //   }
    //   return; // Important: return after handling
    // }

    // // 3. Check for quantity prompt
    // if (ctx.session.nextAction === 'prompt_quantity' && ctx.message.text) {
    //   const quantity = parseInt(ctx.message.text, 10);
    //   if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
    //     ctx.reply('❌ Please enter a valid number between 1 and 100.');
    //     return;
    //   }

    //   ctx.session.quantity = quantity;
    //   ctx.session.nextAction = null; // Clear the next action
      
    //   // Store the custom quantity message ID for deletion
    //   ctx.session.customQuantityMessageId = ctx.message.message_id;
      
    //   const assignmentMessage = await ctx.reply(
    //     `Great! You've chosen to buy *${quantity} entries*.\n\nHow would you like them assigned?`,
    //     {
    //       parse_mode: 'Markdown',
    //       reply_markup: {
    //         inline_keyboard: [
    //           [{ text: '🎲 Random Pick', callback_data: 'assign_method:random' }],
    //           [{ text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }]
    //         ]
    //       }
    //     }
    //   );
      
    //   // Store assignment message ID for deletion
    //   ctx.session.assignmentMessageId = assignmentMessage.message_id;
    //   return; // Important: return after handling
    // }

    // // 4. Default fallback for unexpected messages
    // if (ctx.message.text) {
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
    //     "Please use /start to enter the game:",
    //     {
    //       reply_markup: {
    //       inline_keyboard: [
    //         [{ text: "🚀 Enter Game", callback_data: "start_over" }],
    //       ],
    //       },
    //     }
    //   );

    //   // Save message ID in session
    //   if (!ctx.session) ctx.session = {};
    //   ctx.session.startPromptMessageId = startPromptMessage.message_id;
    // }
    // });

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

    // Admin dashboard
    async function showAdminDashboard_(ctx) {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🏆 Set Winning Number', callback_data: 'admin_set_winning_number' },
                        { text: '💰 Update Winning Amount', callback_data: 'admin_set_winning_amount' }
                    ],
                    [
                        { text: '👥 Get Weekly Winners', callback_data: 'admin_get_winners' },
                        { text: '➕ Create New Pool', callback_data: 'admin_create_pool' }
                    ],
                    [
                        { text: '📊 Draw Statistics', callback_data: 'admin_pool_stats' },
                        { text: '🚪 Logout', callback_data: 'admin_logout' }
                    ]
                ]
            }
        };

        await cleanupAdminMessages(ctx);
        const message = await ctx.reply('🛠️ Admin Dashboard\n\nSelect an action:', keyboard);
        trackMessage(ctx, 'adminDashboard');
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


    // Admin action handlers
    bot.action('admin_set_winning_number', async (ctx) => {
        ctx.session.adminState = ADMIN_STATES.AWAITING_WINNING_NUMBER;
        
        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const message = await ctx.reply('Please enter the winning number for this week:');
        trackMessage(ctx, 'winningNumberPrompt');
        
        await ctx.answerCbQuery();
    });

    bot.action('admin_set_winning_amount', async (ctx) => {
        ctx.session.adminState = ADMIN_STATES.AWAITING_WINNING_AMOUNT;
        
        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const message = await ctx.reply('Please enter the new winning amount:');
        trackMessage(ctx, 'winningAmountPrompt');
        
        await ctx.answerCbQuery();
    });

    bot.action('admin_get_winners', async (ctx) => {
    try {
        const today = new Date();

        // Get current week (based on dates)
        const currentWeek = await Week.findOne({
        where: {
            starts_at: { [Op.lte]: today },
            ends_at: { [Op.gte]: today }
        }
        });

        if (!currentWeek) {
        await ctx.reply('No current week found.');
        return;
        }

        // 🔑 Get the winning record for this week
        const winningRecord = await Winning.findOne({
        where: { week_code: currentWeek.code }
        });
    // console.log(winningRecord)
        if (!winningRecord) {
        await ctx.reply('No winning number found for this week.');
        return;
        }

        const winningNumber = winningRecord.winning_number; // Adjust field name if different

        // Step 1: Try exact match
        let winningEntries = await Entry.findAll({
        where: {
            week_code: currentWeek.code,
            entry_number: winningNumber
        },
        include: [{ model: User }, { model: RafflePool }]
        });
console.log(winningNumber)
        // Step 2: Try inverse match
        if (winningEntries.length === 0) {
            const inverseNumber = String(winningNumber).split('').reverse().join('');
            winningEntries = await Entry.findAll({
                where: {
                    week_code: currentWeek.code,
                    entry_number: inverseNumber
                },
                include: [{ model: User }, { model: RafflePool }]
            });

            if (winningEntries.length > 0) {
                console.log(`Using inverse match: ${inverseNumber} (reverse of ${winningNumber})`);
            }
        }


        // Step 3: Fallback with modulo
        if (winningEntries.length === 0) {
        const allEntries = await Entry.findAll({
            where: { week_code: currentWeek.code },
            include: [{ model: User }, { model: RafflePool }]
        });

        if (allEntries.length > 0) {
            const index = winningNumber % allEntries.length;
            const fallbackWinner = allEntries[index];
            winningEntries = [fallbackWinner];
            console.log(
            `Using modulo fallback: ${winningNumber} % ${allEntries.length} = ${index}`
            );
        }
        }

        // Step 3: Format response
        if (winningEntries.length === 0) {
        await ctx.reply('No winners found for this week.');
        return;
        }

        let message = `🏆 Winners for ${currentWeek.week_name} (Week ${currentWeek.week_number}):\n\n`;
        message += `**Winning Number:** ${winningNumber}\n`;
        message += `**Prize Draw:** ₦${Number(winningRecord.winning_amount).toLocaleString()}\n\n`; // assuming amount lives in Winning

        winningEntries.forEach((entry, index) => {
        message += `**Winner ${index + 1}:**\n`;
        message += `👤 ${entry.User.username}\n`;
        message += `🔢 Entry #${entry.entry_number}\n`;
        message += `🏊 Draw: ${entry.RafflePool.name}\n`;
        // message += `📧 Email: ${entry.User.email || 'Not provided'}\n`;
        // message += `📞 Phone: ${entry.User.phone || 'Not provided'}\n\n`;
        });

        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });
        trackMessage(ctx, 'winnersList');
    } catch (error) {
        console.error('Error getting winners:', error);
        await ctx.reply('❌ Error retrieving winners.');
    }
    await ctx.answerCbQuery();
    });

    // Announce winner to channel
    // Admin: preview announcement and ask to save
    bot.action('admin_announce_winner', async (ctx) => {
    await safeAnswerCbQuery(ctx);

    if (!ctx.session?.isAdmin) {
        await ctx.reply('❌ Please login as admin first using /admin_dadi');
        return;
    }

    const processingMsg = await ctx.reply('🔄 Preparing winner announcement...');
    try {
        const data = await compileWinnerAnnouncementHTML({ structured: true });
        await ctx.reply(data.message, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
            [
                { text: '✅ Save Winner', callback_data: 'save_winner' },
                { text: '❌ Cancel', callback_data: 'cancel_winner' }
            ]
            ]
        }
        });

        // update processing message
        await ctx.telegram.editMessageText(processingMsg.chat.id, processingMsg.message_id, null, '✅ Winner announcement is ready. Please confirm.');
    } catch (err) {
        console.error('Error preparing winner announcement:', err);
        await ctx.reply(`❌ Error: ${err.message}`);
    } finally {
        // try remove processing msg after a short delay
        setTimeout(async () => {
        try { await ctx.deleteMessage(processingMsg.message_id); } catch (e) {}
        }, 3500);
    }
    });

    // Admin: Save winner(s) to DB and announce to channel
    bot.action('save_winner', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    if (!ctx.session?.isAdmin) {
        await ctx.reply('❌ Please login as admin first using /admin');
        return;
    }

    try {
        const data = await compileWinnerAnnouncementHTML({ structured: true });
        const { winningEntries, winMethod, winningNumber, currentWeek, moduloWinningIndex, message } = data;

        // Save unique winners inside a transaction
        await sequelize.transaction(async (tx) => {
        for (const entry of winningEntries) {
            // ✅ Ensure only one winner record per user_id + week_code
            const exists = await WeeklyWinner.findOne({
            where: {
                week_code: currentWeek.code,
                user_id: entry.User.id
            },
            transaction: tx
            });

            if (!exists) {
            await WeeklyWinner.create({
                week_id: currentWeek.id,
                week_code: currentWeek.code,
                entry_id: entry.id,
                entry_number: entry.entry_number,
                user_id: entry.User.id,
                winning_method: winMethod,
                winning_number: winningNumber,
                position: moduloWinningIndex !== null ? moduloWinningIndex : null,
                won_at: new Date()
            }, { transaction: tx });
            } else {
            console.log(`⚠️ Skipped duplicate winner for user ${entry.User.id} in week ${currentWeek.code}`);
            }
        }
        });

        // Announce to channel
        await sendToTelegramChannelHTML(ctx, message);

        // Delete the inline keyboard message
        try {
        await ctx.deleteMessage();
        } catch (e) {
        console.log("Could not delete inline message:", e.message);
        }

        // Reply confirmation
        await ctx.reply('✅ Winner(s) saved uniquely to database and announcement sent to the channel.');

    } catch (err) {
        console.error('Error saving winner:', err);
        await ctx.reply(`❌ Failed to save winner: ${err.message}`);
    }
    });

    // Admin: cancel
    bot.action('cancel_winner', async (ctx) => {
        await safeAnswerCbQuery(ctx);
                await ctx.deleteMessage();
    await ctx.reply('❌ Winner announcement canceled by admin.');
    });



    bot.action('admin_toggle_bonus', async (ctx) => {
    await ctx.answerCbQuery();

    try {
        // Find all bonus pools
        const bonusPools = await RafflePool.findAll({ where: { type: 'bonus' } });

        if (!bonusPools.length) {
        return ctx.reply('❌ No Bonus Draws available.');
        }

        const keyboard = bonusPools.map(pool => ([
        {
            text: `${pool.is_locked ? '🔒' : '🔓'} ${pool.name}`,
            callback_data: `admin_toggle_bonus:${pool.id}`
        }
        ]));

        await ctx.reply(
        '🎯 Select a Bonus Draw to lock/unlock:',
        { reply_markup: { inline_keyboard: keyboard } }
        );
    } catch (err) {
        console.error(err);
        ctx.reply('⚠️ Error toggling Bonus Draws.');
    }
    });

    // Handle actual toggle
    bot.action(/^admin_toggle_bonus:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = ctx.match[1];

    try {
        const pool = await RafflePool.findByPk(poolId);
        if (!pool) return ctx.reply('❌ Pool not found.');

        pool.is_locked = !pool.is_locked;
        await pool.save();

        await ctx.reply(
        `✅ ${pool.name} is now ${pool.is_locked ? '🔒 Locked' : '🔓 Unlocked'}`
        );
    } catch (err) {
        console.error(err);
        ctx.reply('⚠️ Could not update Bonus Draw.');
    }
    });

bot.action('admin_create_bonus', async (ctx) => {
  await ctx.answerCbQuery();

  ctx.session.nextAction = 'creating_bonus';
  await ctx.reply(
    '➕ Send me the details in this format:\n\n' +
    '`Name, PricePerEntry, Quantity, MaxEntries`\n\n' +
    'Example: `Mega Bonus, 2000, 12, 500`',
    { parse_mode: 'Markdown' }
  );
});

// // Capture reply
// bot.on('text', async (ctx) => {
 
// });



    // Post winning number to channel
    bot.action('admin_post_winning_number', async (ctx) => {
        await safeAnswerCbQuery(ctx);
        
        if (!ctx.session.isAdmin) {
            await ctx.reply('❌ Please login as admin first using /admin');
            return;
        }
        
        try {
            const processingMsg = await ctx.reply('🔄 Preparing winning number announcement...');
            
            const winningNumberMessage = await compileWinningNumberAnnouncement();
            await sendToTelegramChannel(ctx, winningNumberMessage);
            
            await ctx.editMessageText('✅ Winning number sent to channel!', {
                chat_id: processingMsg.chat.id,
                message_id: processingMsg.message_id
            });
            
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(processingMsg.message_id);
                } catch (e) {
                    console.log('Could not delete processing message:', e.message);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error posting winning number:', error);
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    });

    bot.action('admin_create_pool', async (ctx) => {
        ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_NAME;
        
        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const message = await ctx.reply('Please enter the name for the new Draw:');
        trackMessage(ctx, 'poolNamePrompt');
        
        await ctx.answerCbQuery();
    });



bot.action('admin_pool_stats', async (ctx) => {
  try {
    const today = new Date();

    // Find current active week
    const currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today }
      }
    });

    if (!currentWeek) {
      await ctx.reply('❌ No active week found.');
      return;
    }

    // ✅ Fetch entries directly by week_code and status
    const entries = await Entry.findAll({
      where: {
        status: 'paid',
        week_code: currentWeek.code
      },
      include: [
        { model: User, required: true },
        { model: RafflePool, required: true }
      ]
    });

    if (!entries.length) {
      await ctx.reply(`No paid entries found for *${currentWeek.week_name}* (${currentWeek.code}).`, { parse_mode: 'Markdown' });
      return;
    }

    // ✅ Build response
    let message = `👥 *Users Who Entered This Week*\nWeek: *${currentWeek.week_name} (${currentWeek.code})*\n\n`;
    const seen = new Set();

    for (const entry of entries) {
      const user = entry.User;
      if (seen.has(user.telegram_id)) continue;
      seen.add(user.telegram_id);

      const username = user.telegram_username
        ? `@${user.telegram_username}`
        : `[${user.telegram_id}](tg://user?id=${user.telegram_id})`;

      message += `👤 ${username}\n`;
      message += `🆔 \`${user.telegram_id}\`\n`;
      message += `💬 ${user.first_name || ''} ${user.last_name || ''}\n\n`;
    }

    // Split long messages into multiple Telegram messages if necessary
    const chunks = message.match(/[\s\S]{1,3500}/g) || [];
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    console.error('Error fetching weekly users:', error);
    await ctx.reply('❌ Error retrieving user entries for this week.');
  }

  await ctx.answerCbQuery();
});

    
bot.action('admin_all_users', async (ctx) => {
  try {
    const users = await User.findAll({ order: [['createdAt', 'DESC']] });

    if (!users.length) {
      await ctx.reply('No users found.');
      return;
    }

    let message = `📋 *All Registered Users*\n\n`;
    for (const user of users) {
      const username = user.telegram_username
        ? `@${user.telegram_username}`
        : `[${user.telegram_id}](tg://user?id=${user.telegram_id})`;

      message += `👤 ${username}\n`;
      message += `🆔 \`${user.telegram_id}\`\n`;
      message += `💬 ${user.first_name || ''} ${user.last_name || ''}\n\n`;
    }

    const chunks = message.match(/[\s\S]{1,3500}/g) || [];
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error fetching all users:', error);
    await ctx.reply('❌ Error retrieving all users.');
  }

  await ctx.answerCbQuery();
});
bot.action('admin_weekly_revenue', async (ctx) => {
  try {
    const today = new Date();

    // ✅ Find the current week
    const currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today }
      }
    });

    if (!currentWeek) {
      await ctx.reply('⚠️ No active week found.');
      return await ctx.answerCbQuery();
    }

    // ✅ Sum up all payments within current week
    const payments = await Payment.findAll({
      where: {
        createdAt: {
          [Op.between]: [currentWeek.starts_at, currentWeek.ends_at]
        },
        status: 'success'
      }
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalTransactions = payments.length;

    // ✅ Format response message
    const message = 
      `💰 <b>Weekly Revenue Report</b>\n\n` +
      `📅 Week: <b>${currentWeek.code}</b>\n` +
      `🗓 Period: ${new Date(currentWeek.starts_at).toLocaleDateString()} - ${new Date(currentWeek.ends_at).toLocaleDateString()}\n\n` +
      `💸 Total Transactions: <b>${totalTransactions}</b>\n` +
      `💰 Total Revenue: <b>₦${totalRevenue.toLocaleString()}</b>`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error calculating weekly revenue:', error);
    await ctx.reply('❌ Error retrieving weekly revenue.');
  }

  await ctx.answerCbQuery();
});



    bot.action('admin_logout', async (ctx) => {
        ctx.session.isAdmin = false;
        ctx.session.adminState = null;
        await cleanupAdminMessages(ctx);
        await ctx.reply('✅ Logged out successfully.');
        await ctx.answerCbQuery();
    });

    // Add this to your admin.js file, preferably near the other action handlers
    bot.action('admin_send_to_channel', async (ctx) => {
        await safeAnswerCbQuery(ctx);
        
        if (!ctx.session.isAdmin) {
            await ctx.reply('❌ Please login as admin first using /admin');
            return;
        }
        
        try {
            // Send processing message
            const processingMsg = await ctx.reply('🔄 Compiling user list for channel...');
            
            // Get the user list with entries
            const userListMessage = await compileUserListWithEntries(ctx);
            
            // Send to channel
            await sendToTelegramChannelHTML(ctx, userListMessage);
            
            // Update processing message
            await ctx.editMessageText('✅ User list successfully sent to channel!', {
                chat_id: processingMsg.chat.id,
                message_id: processingMsg.message_id
            });
            
            // Auto-delete success message after 5 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(processingMsg.message_id);
                } catch (e) {
                    console.log('Could not delete processing message:', e.message);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error sending to channel:', error);
            await ctx.reply('❌ Error sending user list to channel.');
        }
    });

async function compileUserListWithEntries(ctx) {
  try {
    // Get current week
    const today = new Date();
    const currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today },
      },
    });

    if (!currentWeek) {
      throw new Error("No current week found");
    }

    // Get the winning record for this week
    const winningRecord = await Winning.findOne({
      where: { week_code: currentWeek.code },
    });

    if (!winningRecord) {
      throw new Error("No winning number found for this week");
    }

    const winningAmount = winningRecord.winning_amount;

    // Get all users with their paid entries for current week
    const users = await User.findAll({
      include: [
        {
          model: Entry,
          where: {
            week_code: currentWeek.code,
            status: "paid",
          },
          include: [
            {
              model: RafflePool,
            },
          ],
        },
      ],
      order: [["telegram_id", "ASC"]], // Use telegram_id for consistency
    });

    // Get all entries for modulo positioning
    const allEntries = await Entry.findAll({
      where: {
        week_code: currentWeek.code,
        status: "paid",
      },
      order: [["id", "ASC"]],
    });

    // Create a map of entry numbers to their modulo position
    const entryPositionMap = new Map();
    allEntries.forEach((entry, index) => {
      entryPositionMap.set(entry.entry_number, index + 1); // Position starts at 1
    });

    // Get current date for the report
    const now = new Date();
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const currentDate = now.toLocaleDateString("en-US", options);

    // Compile the message in HTML
    let message = `<b>📋 Daily Entries Report - ${currentDate}</b>\n\n`;
    message += `<b>Week:</b> ${currentWeek.week_name}\n`;
    message += `<b>Total Entries:</b> ${allEntries.length}\n`;
    message += `<b>Winning Amount:</b> ₦${Number(winningAmount).toLocaleString() || "Not yet set"}\n\n`;
    message += "━━━━━━━━━━━━━━━━━━━━\n\n";

    let userCount = 1;

    for (const user of users) {
      if (user.Entries && user.Entries.length > 0) {
        // Get first name (use ctx.from for current user, fetch for others)
        let firstName = `user_${user.telegram_id}`; // Fallback
        let telegramId = user.telegram_id; // Assumes telegram_id in User model
        if (user.telegram_id === ctx.from.id) {
          firstName = ctx.from.first_name || `user_${user.telegram_id}`;
        } else {
          try {
            const member = await ctx.telegram.getChatMember(
              process.env.GROUPCHATID || "-1001234567890",
              user.telegram_id
            );
            firstName = member.user.first_name || `user_${user.telegram_id}`;
          } catch (error) {
            console.error(`Error fetching first_name for user ${user.telegram_id}:`, error.message);
          }
        }

        message += `<b>${userCount}. <a href="tg://user?id=${telegramId}">${firstName}</a></b>\n`;

        // Group entries by pool
        const entriesByPool = {};
        user.Entries.forEach((entry) => {
          const poolName = entry.RafflePool?.name || "Unknown Draw";
          if (!entriesByPool[poolName]) {
            entriesByPool[poolName] = 0;
          }
          entriesByPool[poolName]++;
        });

        // Add count per pool
        for (const [poolName, count] of Object.entries(entriesByPool)) {
          message += `   🏊 <b>${poolName}:</b> ${count} entries\n`;
        }

        message += `\n`;
        userCount++;
      }
    }

    message += "━━━━━━━━━━━━━━━━━━━━\n\n";
    message += "<b>Note:</b> This is a daily summary of all entries.\n";
    message += "The draw will be held on Sunday.\n";

    return message; // Return string only
  } catch (error) {
    console.error("Error compiling user list:", error);
    throw new Error("Failed to compile user list");
  }
}
    // Updated sendToTelegramChannel function to support HTML
    async function sendToTelegramChannelHTML(ctx, message) {
        const CHANNEL_USERNAME = process.env.GROUPCHATID; // Your channel username without @
        
        try {
            // Handle both string and array messages
            const messagesToSend = Array.isArray(message) ? message : [message];
            
            for (let i = 0; i < messagesToSend.length; i++) {
                await ctx.telegram.sendMessage(
                    `${CHANNEL_USERNAME}`,
                    messagesToSend[i],
                    { 
                        parse_mode: 'HTML', // Changed from Markdown to HTML
                        disable_notification: i > 0
                    }
                );
                
                // Add delay between messages to avoid rate limiting
                if (i < messagesToSend.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error sending to channel:', error);
            
            if (error.description && error.description.includes('not enough rights')) {
                throw new Error('Bot does not have permission to send messages to the channel.');
            }
            
            if (error.description && error.description.includes('chat not found')) {
                throw new Error('Channel not found. Please check the channel username.');
            }
            
            throw error;
        }
    }

    // HTML version of compileWinnerAnnouncement with inverse strategy
    // --- top of file: import models / sequelize ---
    // --- compileWinnerAnnouncementHTML ---
async function compileWinnerAnnouncementHTML({ structured = false } = {}) {
  try {
    const today = new Date();

    // current week
    const currentWeek = await Week.findOne({
      where: {
        starts_at: { [Op.lte]: today },
        ends_at: { [Op.gte]: today }
      }
    });
    if (!currentWeek) throw new Error('No current week found');

    // winning record
    const winningRecord = await Winning.findOne({ where: { week_code: currentWeek.code } });
    if (!winningRecord) throw new Error('No winning number found for this week');

    const winningNumber = String(winningRecord.winning_number);

    // 1) exact match
    let winningEntries = await Entry.findAll({
      where: { week_code: currentWeek.code, entry_number: winningNumber, status: 'paid' },
      include: [{ model: User }, { model: RafflePool }]
    });

    let winMethod = 'exact match';
    let winnerType = 'winner';

    // 2) inverse match
    if (!winningEntries || winningEntries.length === 0) {
      const inverseNumber = winningNumber.split('').reverse().join('');
      winningEntries = await Entry.findAll({
        where: { week_code: currentWeek.code, entry_number: inverseNumber, status: 'paid' },
        include: [{ model: User }, { model: RafflePool }]
      });

      if (winningEntries && winningEntries.length > 0) {
        winMethod = 'inverse match';
        winnerType = 'inverse winner';
      }
    }

    // total entries count for header / explanation
    const totalEntriesCount = await Entry.count({
      where: { week_code: currentWeek.code, status: 'paid' }
    });

    let moduloWinningIndex = null;

    // 3) modulo fallback (only if still no winners)
    if (!winningEntries || winningEntries.length === 0) {
      const allEntries = await Entry.findAll({
        where: { week_code: currentWeek.code, status: 'paid' },
        order: [['id', 'ASC']],
        include: [{ model: User }, { model: RafflePool }]
      });

      if (allEntries && allEntries.length > 0) {
        const parsedWinningNumber = Number.isFinite(Number(winningNumber)) ? parseInt(winningNumber, 10) : 0;
        const winningPosition = (parsedWinningNumber % allEntries.length) + 1; // 1-based position
        moduloWinningIndex = winningPosition;
        const winnerEntry = allEntries[winningPosition - 1];
        winningEntries = [winnerEntry];
        winMethod = 'modulo positioning';
        winnerType = 'modulo winner';
      }
    }

    if (!winningEntries || winningEntries.length === 0) {
      throw new Error('No winners found for this week');
    }

    // Build human-friendly message
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const currentDate = now.toLocaleDateString('en-US', options);

    let message = `<b>🎉 OFFICIAL WINNER ANNOUNCEMENT</b>\n\n`;
    message += `<b>Date:</b> ${currentDate}\n`;
    message += `<b>Week:</b> ${currentWeek.week_name}\n`;
    message += `<b>Winning Number (signal):</b> ${winningNumber}\n`;
    if (winMethod === 'inverse match') {
      const inverseNumber = winningNumber.split('').reverse().join('');
      message += `<b>Inverse Number:</b> ${inverseNumber}\n`;
    }
    message += `<b>Prize Money:</b> ₦${Number(winningRecord.winning_amount).toLocaleString()}\n`;
    message += `<b>Win Method:</b> ${winMethod}\n\n`;
    message += "━━━━━━━━━━━━━━━━━━━━\n\n";

    // winners info
    for (const [index, entry] of winningEntries.entries()) {
      message += `<b>${winnerType.toUpperCase()} ${index + 1}:</b>\n`;
      message += `👤 <b>Name:</b> ${entry.User?.telegram_username || 'N/A'}\n`;
      if (entry.User?.phone) message += `📞 <b>Phone:</b> ${entry.User.phone}\n`;
      if (entry.User?.email) message += `📧 <b>Email:</b> ${entry.User.email}\n`;
      message += `🏊 <b>Draw:</b> ${entry.RafflePool?.name || 'N/A'}\n`;
      if (winMethod === 'inverse match') {
        message += `🔢 <b>Entry Number:</b> #${entry.entry_number}\n`;
        message += `🔄 <b>Matched Inverse Of:</b> #${winningNumber}\n`;
      } else {
        message += `🔢 <b>Winning Entry:</b> #${entry.entry_number}\n`;
      }
      message += `💰 <b>Prize Won:</b> ₦${Number(winningRecord.winning_amount).toLocaleString()}\n\n`;
    }

    message += "━━━━━━━━━━━━━━━━━━━━\n\n";

    // simple, human-friendly explanation
    if (winMethod === 'exact match') {
      message += "<i>This winner matched the exact winning number!</i>\n\n";
    } else if (winMethod === 'inverse match') {
      message += `<i>This winner matched the inverse of the winning number (${winningNumber.split('').reverse().join('')})!</i>\n\n`;
    } else {
      const seat = moduloWinningIndex;
     message += `<i>No exact or inverse match was found this week, so the winner was selected fairly using the <b>Modulo Method</b>.</i>\n\n`;
message += `<b>How it works (simple):</b>\n`;
message += `We used the winning number (<b>${winningNumber}</b>) together with the total number of entries (<b>${totalEntriesCount}</b>) to find the lucky position.\n`;
message += `Here’s what we did: <b>${winningNumber} mod ${totalEntriesCount} + 1 = position ${seat}</b>\n`;
message += `So, the entry sitting in <b>position ${seat}</b> out of all ${totalEntriesCount} entries became the winner! 🎯\n\n`;
message += `💡 <b>Tip:</b> Enter multiple times to improve your chances whenever the modulo method is used.\n\n`;

    }

    message += "<b>🎊 CONGRATULATIONS! 🎊</b>\n\n";
    message += "To claim your prize, please confirm or update your bank details in the bot within the next 3 hours.\n\n";
    message += "🕒 Payments will be processed within 24 hours after confirmation.\n\n";
    message += "Thank you to everyone who participated!\n";
    message += "Next draw begins on Monday 🎯";

    if (structured) {
      return {
        message,
        winningEntries,
        winMethod,
        winningNumber,
        currentWeek,
        moduloWinningIndex,
        totalEntriesCount,
        winningRecord
      };
    }

    return message;
  } catch (error) {
    console.error('Error compiling winner announcement:', error);
    throw new Error('Failed to compile winner announcement: ' + error.message);
  }
}


    async function compileWinningNumberAnnouncement() {
        try {
            // Get current week
            const today = new Date();
            const { Op } = require('sequelize');

            // Get current week (based on dates)
            const currentWeek = await Week.findOne({
                where: {
                    starts_at: { [Op.lte]: today },
                    ends_at: { [Op.gte]: today }
                }
            });

            if (!currentWeek) {
                throw new Error('No current week found');
            }

            // Get the winning record for this week
            const winningRecord = await Winning.findOne({
                where: { week_code: currentWeek.code }
            });

            if (!winningRecord) {
                throw new Error('No winning number found for this week');
            }

            const winningNumber = winningRecord.winning_number;

            // Get current date
            const now = new Date();
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            };
            const currentDate = now.toLocaleDateString('en-US', options);

            // Get total entries
            const totalEntries = await Entry.count({
                where: { 
                    week_code: currentWeek.code,
                    status: 'paid'
                }
            });
            // Compile winning number announcement
            let message = `🎯 *OFFICIAL WINNING NUMBER ANNOUNCEMENT* 🎯\n\n`;
            message += `*Date:* ${currentDate}\n`;
            message += `*Week:* ${currentWeek.week_name}\n`;
            // message += `*Total Entries:* ${totalEntries}\n\n`;
            message += "━━━━━━━━━━━━━━━━━━━━\n\n";
            message += `🏆 *THE WINNING NUMBER IS:*\n`;
            message += `# ${winningNumber} #\n\n`;
            message += "━━━━━━━━━━━━━━━━━━━━\n\n";
            message += "*How the winner will be determined:*\n\n";
            message += "1. *Exact Match Priority:*\n";
            message += "   - We first look for entries with the exact winning number\n";
            message += "   - If found, those entry holders win the prize\n\n";
            message += "2. *Inverse Match (Fairness Feature):*\n";
            message += "   - If no exact match is found\n";
            message += "   - We look for entries matching the INVERSE of the winning number\n";
            message += "   - Example: If winning number is 1234, we look for 4321\n";
            message += "   - If found, those entry holders win the prize\n\n";
            message += "3. *Modulo Positioning (Guaranteed Winner):*\n";
            message += "   - If no exact or inverse match is found\n";
            message += "   - We use: winning_number % total_entries = position\n";
            message += "   - The entry at that position wins\n";
            message += "   - Example: Winning number 1515 with 100 entries (1515 % 100) → position 15 wins\n\n";
            message += "━━━━━━━━━━━━━━━━━━━━\n\n";
            message += `*Prize Money:* ₦${(Number(winningRecord.winning_amount)).toLocaleString()}\n\n`;
            message += "The winner will be announced shortly!\n";
            message += "Good luck to all participants! 🍀";

            return message;
        } catch (error) {
            console.error('Error compiling winning number announcement:', error);
            throw new Error('Failed to compile winning number announcement: ' + error.message);
        }
    }
    
    async function sendToTelegramChannel(ctx, message) {
    const CHANNEL_USERNAME = process.env.GROUPCHATID; // Your channel username without @
    
    try {
        // Handle both string and array messages
        const messagesToSend = Array.isArray(message) ? message : [message];
        
        for (let i = 0; i < messagesToSend.length; i++) {
            await ctx.telegram.sendMessage(
                `${CHANNEL_USERNAME}`,
                messagesToSend[i],
                { 
                    parse_mode: 'Markdown',
                    disable_notification: i > 0 // Only notify for first message
                }
            );
            
            // Add delay between messages to avoid rate limiting
            if (i < messagesToSend.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error sending to channel:', error);
        
        if (error.description && error.description.includes('not enough rights')) {
            throw new Error('Bot does not have permission to send messages to the channel.');
        }
        
        if (error.description && error.description.includes('chat not found')) {
            throw new Error('Channel not found. Please check the channel username.');
        }
        
        throw error;
    }
    }

    


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
// Helper function to compile user list with entries
// async function compileUserListWithEntries() {
//     try {
//         // Get current week
//         const today = new Date();
//         const currentWeek = await Week.findOne({
//         where: {
//             starts_at: { [Op.lte]: today },
//             ends_at: { [Op.gte]: today }
//         }
//         });

//         if (!currentWeek) {
//             throw new Error('No current week found');
//         }

//         // Get all users with their paid entries for current week
//         const users = await User.findAll({
//             include: [{
//                 model: Entry,
//                 where: { 
//                     week_code: currentWeek.code,
//                     status: 'paid'
//                 },
//                 include: [{
//                     model: RafflePool
//                 }]
//             }],
//             order: [['telegram_username', 'ASC']]
//         });

//         // Get all entries for modulo positioning
//         const allEntries = await Entry.findAll({
//             where: { 
//                 week_code: currentWeek.code,
//                 status: 'paid'
//             },
//             order: [['entry_number', 'ASC']]
//         });

//         // Create a map of entry numbers to their modulo position
//         const entryPositionMap = new Map();
//         allEntries.forEach((entry, index) => {
//             entryPositionMap.set(entry.entry_number, index + 1); // Position starts at 1
//         });

//         // Compile the message
//         let message = `📋 *User Entries Report - ${currentWeek.week_name}*\n\n`;
//         message += `*Total Users:* ${users.length}\n`;
//         message += `*Total Entries:* ${allEntries.length}\n`;
//         message += `*Winning Number:* ${currentWeek.winning_number || 'Not set'}\n\n`;
//         message += "━━━━━━━━━━━━━━━━━━━━\n\n";

//         let userCount = 1;

//         for (const user of users) {
//             if (user.Entries && user.Entries.length > 0) {
//                 message += `*${userCount}. ${user.telegram_username}* `;
                
//                 // Add contact info if available
//                 if (user.phone || user.email) {
//                     message += `(`;
//                     if (user.phone) message += `📞 ${user.phone}`;
//                     if (user.phone && user.email) message += `, `;
//                     if (user.email) message += `📧 ${user.email}`;
//                     message += `)`;
//                 }
                
//                 message += `\n`;

//                 // Group entries by pool
//                 const entriesByPool = {};
//                 user.Entries.forEach(entry => {
//                     if (!entriesByPool[entry.RafflePool.name]) {
//                         entriesByPool[entry.RafflePool.name] = [];
//                     }
//                     entriesByPool[entry.RafflePool.name].push(entry);
//                 });

//                 // Add entries for each pool
//                 for (const [poolName, entries] of Object.entries(entriesByPool)) {
//                     message += `   🏊 *${poolName}:* `;
                    
//                     const entryNumbers = entries.map(entry => {
//                         const position = entryPositionMap.get(entry.entry_number);
//                         return `#${entry.entry_number} (Pos: ${position})`;
//                     });
                    
//                     message += entryNumbers.join(', ') + '\n';
//                 }
                
//                 message += `   📦 *Total:* ${user.Entries.length} entries\n\n`;
//                 userCount++;
//             }
//         }

//         // Add modulo explanation
//         message += "━━━━━━━━━━━━━━━━━━━━\n\n";
//         message += "*Modulo Positioning Info:*\n";
//         message += "• Positions are assigned based on entry number order\n";
//         message += "• Position 1 = First entry, Position 2 = Second entry, etc.\n";
//         message += "• For modulo selection: winning_number % total_entries = position\n";
//         message += `• Current modulo result would be: ${currentWeek.winning_number || 'N/A'} % ${allEntries.length} = ${currentWeek.winning_number ? currentWeek.winning_number % allEntries.length : 'N/A'}\n`;

//         return message;
//     } catch (error) {
//         console.error('Error compiling user list:', error);
//         throw new Error('Failed to compile user list');
//     }
// }

// Helper function to send message to channel
async function sendToTelegramChannel(ctx, message) {
    const CHANNEL_USERNAME = process.env.GROUPCHATID; // Your channel username without @
    
    try {
        // Split long messages (Telegram has a 4096 character limit per message)
        const messageParts = splitMessage(message, 4000);
        
        for (let i = 0; i < messageParts.length; i++) {
            await ctx.telegram.sendMessage(
                `${process.env.GROUPCHATID}`,
                messageParts[i],
                { 
                    parse_mode: 'Markdown',
                    disable_notification: true // Prevent notification spam
                }
            );
            
            // Add delay between messages to avoid rate limiting
            if (i < messageParts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error sending to channel:', error);
        
        // Check if it's a rights issue
        if (error.description && error.description.includes('not enough rights')) {
            throw new Error('Bot does not have permission to send messages to the channel. Please make sure the bot is an admin in the channel.');
        }
        
        // Check if it's a chat not found issue
        if (error.description && error.description.includes('chat not found')) {
            throw new Error('Channel not found. Please check the channel username.');
        }
        
        throw error;
    }
}

// Helper function to split long messages
function splitMessage(message, maxLength) {
    const parts = [];
    let currentPart = '';
    const lines = message.split('\n');
    
    for (const line of lines) {
        if (currentPart.length + line.length + 1 > maxLength) {
            parts.push(currentPart);
            currentPart = line + '\n';
        } else {
            currentPart += line + '\n';
        }
    }
    
    if (currentPart.length > 0) {
        parts.push(currentPart);
    }
    
    return parts;
}

};