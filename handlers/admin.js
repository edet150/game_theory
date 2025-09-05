// handlers/admin.js
const { User ,RafflePool,Winning, Payment, Admin, Entry, Week} = require('../models');const { Op } = require("sequelize");
module.exports = (bot) => {
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
    bot.command('admin', async (ctx) => {
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

    // Handle admin messages based on state
    bot.on('message', async (ctx) => {
        if (!ctx.session.adminState) return;

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
    });

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
    async function showAdminDashboard(ctx) {
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
                        { text: '📊 Pool Statistics', callback_data: 'admin_pool_stats' },
                        { text: '🚪 Logout', callback_data: 'admin_logout' }
                    ]
                ]
            }
        };

        await cleanupAdminMessages(ctx);
        const message = await ctx.reply('🛠️ Admin Dashboard\n\nSelect an action:', keyboard);
        trackMessage(ctx, 'adminDashboard');
    }

    // Admin action handlers
    bot.action('admin_set_winning_number', async (ctx) => {
        ctx.session.adminState = ADMIN_STATES.AWAITING_WINNING_NUMBER;
        
        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const message = await ctx.reply('Please enter the winning number for this week:');
        trackMessage(ctx, 'winningNumberPrompt');
        
        ctx.answerCbQuery();
    });

    bot.action('admin_set_winning_amount', async (ctx) => {
        ctx.session.adminState = ADMIN_STATES.AWAITING_WINNING_AMOUNT;
        
        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const message = await ctx.reply('Please enter the new winning amount:');
        trackMessage(ctx, 'winningAmountPrompt');
        
        ctx.answerCbQuery();
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

    // Step 2: Fallback with modulo
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
    message += `**Prize Pool:** ₦${winningRecord.amount}\n\n`; // assuming amount lives in Winning

    winningEntries.forEach((entry, index) => {
      message += `**Winner ${index + 1}:**\n`;
      message += `👤 ${entry.User.username}\n`;
      message += `🔢 Entry #${entry.entry_number}\n`;
      message += `🏊 Pool: ${entry.RafflePool.name}\n`;
      message += `📧 Email: ${entry.User.email || 'Not provided'}\n`;
      message += `📞 Phone: ${entry.User.phone || 'Not provided'}\n\n`;
    });

    await cleanupAdminMessages(ctx, ['adminDashboard']);
    const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });
    trackMessage(ctx, 'winnersList');
  } catch (error) {
    console.error('Error getting winners:', error);
    await ctx.reply('❌ Error retrieving winners.');
  }
  ctx.answerCbQuery();
});


    bot.action('admin_create_pool', async (ctx) => {
        ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_NAME;
        
        await cleanupAdminMessages(ctx, ['adminDashboard']);
        const message = await ctx.reply('Please enter the name for the new pool:');
        trackMessage(ctx, 'poolNamePrompt');
        
        ctx.answerCbQuery();
    });

    bot.action('admin_pool_stats', async (ctx) => {
        try {
            const pools = await RafflePool.findAll({
                include: [{
                    model: Entry,
                    where: { status: 'paid' },
                    required: false
                }]
            });

            let message = '📊 Pool Statistics:\n\n';
            pools.forEach(pool => {
                const entryCount = pool.Entries ? pool.Entries.length : 0;
                const revenue = entryCount * pool.price_per_entry;
                
                message += `**${pool.name}**\n`;
                message += `📈 Entries: ${entryCount}/${pool.max_entries}\n`;
                message += `💰 Revenue: ₦${revenue.toLocaleString()}\n`;
                message += `🎫 Price: ₦${pool.price_per_entry.toLocaleString()}/entry\n\n`;
            });

            await cleanupAdminMessages(ctx, ['adminDashboard']);
            const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });
            trackMessage(ctx, 'poolStats');
        } catch (error) {
            console.error('Error getting pool stats:', error);
            await ctx.reply('❌ Error retrieving pool statistics.');
        }
        ctx.answerCbQuery();
    });

    bot.action('admin_logout', async (ctx) => {
        ctx.session.isAdmin = false;
        ctx.session.adminState = null;
        await cleanupAdminMessages(ctx);
        await ctx.reply('✅ Logged out successfully.');
        ctx.answerCbQuery();
    });

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
            await ctx.reply('Please enter a valid pool name (min 2 characters):');
            return;
        }

        // Check if pool already exists
        const existingPool = await RafflePool.findOne({
            where: { name: poolName }
        });

        if (existingPool) {
            await ctx.reply('❌ A pool with this name already exists. Please choose a different name:');
            return;
        }

        ctx.session.newPoolName = poolName;
        ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_PRICE;
        await ctx.reply('Please enter the price per entry for this pool:');
    }

    async function handlePoolPrice(ctx) {
        const price = parseInt(ctx.message.text.replace(/[^\d]/g, ''));
        
        if (isNaN(price) || price <= 0) {
            await ctx.reply('Please enter a valid price:');
            return;
        }

        ctx.session.newPoolPrice = price;
        ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_MAX_ENTRIES;
        await ctx.reply('Please enter the maximum number of entries for this pool:');
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

            await ctx.reply(`✅ New pool created successfully!\n\n` +
                `Name: ${ctx.session.newPoolName}\n` +
                `Price: ₦${ctx.session.newPoolPrice.toLocaleString()}\n` +
                `Max Entries: ${maxEntries.toLocaleString()}`);

            // Clear session data
            delete ctx.session.newPoolName;
            delete ctx.session.newPoolPrice;
            ctx.session.adminState = null;

            await showAdminDashboard(ctx);
        } catch (error) {
            console.error('Error creating pool:', error);
            await ctx.reply('❌ Error creating pool. Please try again.');
        }
    }


};