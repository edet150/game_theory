// handlers/admin.js
const { User ,RafflePool,Winning, Payment, Admin, Entry, Week} = require('../models');const { Op } = require("sequelize");
const { getbotInstance, getRedisClient } = require('../bot/botInstance');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const redis = getRedisClient();
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
bot.on('message', async (ctx) => {
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
        if (isNaN(quantity) || quantity <= 0) {
            ctx.reply('Please enter a valid number of entries.');
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
                        [{ text: 'Random', callback_data: 'assign_method:random' }],
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
                        { text: '📊 Arena Statistics', callback_data: 'admin_pool_stats' },
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
                        { text: '📊 Arena Statistics', callback_data: 'admin_pool_stats' },
                        { text: '📋 Daily Entries Report', callback_data: 'admin_send_to_channel' }
                    ],
                    [
                        { text: '🎯 Announce Winner', callback_data: 'admin_announce_winner' },
                        { text: '📢 Post Winning Number', callback_data: 'admin_post_winning_number' }
                    ],
                    [
                        { text: `${lockStatus} Entries`, callback_data: 'admin_toggle_entries_lock' }
                    ],
                    [
                        { text: '🚪 Logout', callback_data: 'admin_logout' }
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
        message += `**Prize Arena:** ₦${winningRecord.amount}\n\n`; // assuming amount lives in Winning

        winningEntries.forEach((entry, index) => {
        message += `**Winner ${index + 1}:**\n`;
        message += `👤 ${entry.User.username}\n`;
        message += `🔢 Entry #${entry.entry_number}\n`;
        message += `🏊 Arena: ${entry.RafflePool.name}\n`;
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
    await ctx.answerCbQuery();
    });

    // Announce winner to channel
    bot.action('admin_announce_winner', async (ctx) => {
        await safeAnswerCbQuery(ctx);
        
        if (!ctx.session.isAdmin) {
            await ctx.reply('❌ Please login as admin first using /admin');
            return;
        }
        
        try {
            const processingMsg = await ctx.reply('🔄 Preparing winner announcement...');
            
            const winnerAnnouncement = await compileWinnerAnnouncementHTML();
            await sendToTelegramChannelHTML(ctx, winnerAnnouncement);
            
            await ctx.editMessageText('✅ Winner announcement sent to channel!', {
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
            console.error('Error announcing winner:', error);
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    });

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
        const message = await ctx.reply('Please enter the name for the new Arena:');
        trackMessage(ctx, 'poolNamePrompt');
        
        await ctx.answerCbQuery();
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

            let message = '📊 Arena Statistics:\n\n';
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
            console.error('Error getting Arena stats:', error);
            await ctx.reply('❌ Error retrieving Arena statistics.');
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
            const userListMessage = await compileUserListWithEntries();
            
            // Send to channel
            await sendToTelegramChannel(ctx, userListMessage);
            
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

    async function compileUserListWithEntries() {
    try {
        // Get current week
        const today = new Date();
        const currentWeek = await Week.findOne({
            where: {
                starts_at: { [Op.lte]: today },
                ends_at: { [Op.gte]: today }
            }
        });

        if (!currentWeek) {
            throw new Error('No current week found');
        }

        // Get all users with their paid entries for current week
        const users = await User.findAll({
            include: [{
                model: Entry,
                where: { 
                    week_code: currentWeek.code,
                    status: 'paid'
                },
                include: [{
                    model: RafflePool
                }]
            }],
            order: [['id', 'ASC']]
        });

        // Get all entries for modulo positioning
        const allEntries = await Entry.findAll({
            where: { 
                week_code: currentWeek.code,
                status: 'paid'
            },
            order: [['id', 'ASC']]
        });

        // Create a map of entry numbers to their modulo position
        const entryPositionMap = new Map();
        allEntries.forEach((entry, index) => {
            entryPositionMap.set(entry.entry_number, index + 1); // Position starts at 1
        });

        // Get current date for the report
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const currentDate = now.toLocaleDateString('en-US', options);

        // Compile the message
        let message = `📋 *Daily Entries Report - ${currentDate}*\n\n`;
        message += `*Week:* ${currentWeek.week_name}\n`;
        message += `*Total Participants:* ${users.length}\n`;
        message += `*Total Entries:* ${allEntries.length}\n`;
        message += `*Winning Number:* ${currentWeek.winning_number || 'Not yet set'}\n\n`;
        message += "━━━━━━━━━━━━━━━━━━━━\n\n";

        let userCount = 1;

        for (const user of users) {
            if (user.Entries && user.Entries.length > 0) {
                message += `*${userCount}. ${user.telegram_username}* `;
                
                // Add contact info if available
                if (user.phone || user.email) {
                    message += `(`;
                    if (user.phone) message += `📞 ${user.phone}`;
                    if (user.phone && user.email) message += `, `;
                    if (user.email) message += `📧 ${user.email}`;
                    message += `)`;
                }
                
                message += `\n`;

                // Group entries by pool
                const entriesByPool = {};
                user.Entries.forEach(entry => {
                    if (!entriesByPool[entry.RafflePool.name]) {
                        entriesByPool[entry.RafflePool.name] = [];
                    }
                    entriesByPool[entry.RafflePool.name].push(entry);
                });

                // Add entries for each pool
                for (const [poolName, entries] of Object.entries(entriesByPool)) {
                    message += `   🏊 *${poolName}:* `;
                    
                    const entryNumbers = entries.map(entry => {
                        const position = entryPositionMap.get(entry.entry_number);
                        return `#${entry.entry_number} (Pos: ${position})`;
                    });
                    
                    message += entryNumbers.join(', ') + '\n';
                }
                
                message += `   📦 *Total:* ${user.Entries.length} entries\n\n`;
                userCount++;
            }
        }

        message += "━━━━━━━━━━━━━━━━━━━━\n\n";
        message += "*Note:* This is a daily summary of all entries. \n";
        message += "The draw will be held on Saturday.\n";

        return message;
    } catch (error) {
        console.error('Error compiling user list:', error);
        throw new Error('Failed to compile user list');
    }
    }
// Updated sendToTelegramChannel function to support HTML
async function sendToTelegramChannelHTML(ctx, message) {
    const CHANNEL_USERNAME = 'alpha_entries'; // Your channel username without @
    
    try {
        // Handle both string and array messages
        const messagesToSend = Array.isArray(message) ? message : [message];
        
        for (let i = 0; i < messagesToSend.length; i++) {
            await ctx.telegram.sendMessage(
                `@${CHANNEL_USERNAME}`,
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

// HTML version of compileWinnerAnnouncement
async function compileWinnerAnnouncementHTML() {
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

        // Try exact match first
        let winningEntries = await Entry.findAll({
            where: {
                week_code: currentWeek.code,
                entry_number: winningNumber,
                status: 'paid'
            },
            include: [
                { model: User },
                { model: RafflePool }
            ]
        });

        let winMethod = "exact match";
        let winnerType = "winner";

        // If no exact match, use modulo fallback
        if (winningEntries.length === 0) {
            const allEntries = await Entry.findAll({
                where: { 
                    week_code: currentWeek.code,
                    status: 'paid'
                },
                order: [['id', 'ASC']],
                include: [
                    { model: User },
                    { model: RafflePool }
                ]
            });

            if (allEntries.length > 0) {
                const winningPosition = winningNumber % allEntries.length;
                const winnerEntry = allEntries[winningPosition];
                winningEntries = [winnerEntry];
                winMethod = "modulo positioning";
                winnerType = "modulo winner";
            }
        }

        if (winningEntries.length === 0) {
            throw new Error('No winners found for this week');
        }

        // Get current date
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const currentDate = now.toLocaleDateString('en-US', options);
        
        // Compile announcement message using HTML
        let message = `<b>🎉 OFFICIAL WINNER ANNOUNCEMENT</b>\n\n`;
        message += `<b>Date:</b> ${currentDate}\n`;
        message += `<b>Week:</b> ${currentWeek.week_name}\n`;
        message += `<b>Winning Number:</b> ${winningNumber}\n`;
        message += `<b>Prize Money:</b> ₦${(Number(winningRecord.winning_amount)).toLocaleString()}\n`;
        message += `<b>Win Method:</b> ${winMethod}\n\n`;
        message += "━━━━━━━━━━━━━━━━━━━━\n\n";

        // Add winner(s) information
        for (const [index, entry] of winningEntries.entries()) {
            message += `<b>${winnerType.toUpperCase()} ${index + 1}:</b>\n`;
            message += `👤 <b>Name:</b> ${entry.User.telegram_username}\n`;

            if (entry.User.phone) {
                message += `📞 <b>Phone:</b> ${entry.User.phone}\n`;
            }
            if (entry.User.email) {
                message += `📧 <b>Email:</b> ${entry.User.email}\n`;
            }

            message += `🏊 <b>Arena:</b> ${entry.RafflePool.name}\n`;
            message += `🔢 <b>Winning Entry:</b> #${entry.entry_number}\n`;

            if (winMethod === "modulo positioning") {
                const allEntries = await Entry.findAll({
                    where: { 
                        week_code: currentWeek.code,
                        status: 'paid'
                    },
                    order: [['id', 'ASC']]
                });

                const position = allEntries.findIndex(e => e.id === entry.id) + 1;
                message += `📊 <b>Position:</b> ${position}\n`;
            }

            message += `💰 <b>Prize Won:</b> ₦${winningRecord.winning_amount.toLocaleString()}\n\n`;
        }

        message += "━━━━━━━━━━━━━━━━━━━━\n\n";
        message += "<b>🎊 CONGRATULATIONS! 🎊</b>\n\n";
        message += "To claim your prize, please:\n";
        message += "1. Contact the admin via private message\n";
        message += "2. Provide your bank account details for payment\n";
        message += "3. Payments are processed within 24-48 hours\n\n";
        message += "<b>Admin Contact:</b> @YourAdminUsername\n\n";
        message += "Thank you to everyone who participated!\n";
        message += "Next draw begins tomorrow";

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
            message += `*Total Entries:* ${totalEntries}\n\n`;
            message += "━━━━━━━━━━━━━━━━━━━━\n\n";
            message += `🏆 *THE WINNING NUMBER IS:*\n`;
            message += `# ${winningNumber} #\n\n`;
            message += "━━━━━━━━━━━━━━━━━━━━\n\n";
            message += "*How the winner is determined:*\n\n";
            message += "1. *Exact Match Priority:*\n";
            message += "   - We first look for entries with the exact winning number\n";
            message += "   - If found, those entry holders win the prize\n\n";
            message += "2. *Modulo Positioning (Fallback):*\n";
            message += "   - If no exact match is found\n";
            message += "   - We use: winning_number % total_entries = position\n";
            message += "   - The entry at that position wins\n\n";
            message += "3. *Example:*\n";
            message += "   - Winning Number: 15\n";
            message += "   - Total Entries: 100\n";
            message += "   - 15 % 100 = 15 → Entry at position 15 wins\n\n";
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
    const CHANNEL_USERNAME = 'alpha_entry'; // Your channel username without @
    
    try {
        // Handle both string and array messages
        const messagesToSend = Array.isArray(message) ? message : [message];
        
        for (let i = 0; i < messagesToSend.length; i++) {
            await ctx.telegram.sendMessage(
                `@${CHANNEL_USERNAME}`,
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
            await ctx.reply('Please enter a valid Arena name (min 2 characters):');
            return;
        }

        // Check if pool already exists
        const existingPool = await RafflePool.findOne({
            where: { name: poolName }
        });

        if (existingPool) {
            await ctx.reply('❌ An Arena with this name already exists. Please choose a different name:');
            return;
        }

        ctx.session.newPoolName = poolName;
        ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_PRICE;
        await ctx.reply('Please enter the price per entry for this Arena:');
    }

    async function handlePoolPrice(ctx) {
        const price = parseInt(ctx.message.text.replace(/[^\d]/g, ''));
        
        if (isNaN(price) || price <= 0) {
            await ctx.reply('Please enter a valid price:');
            return;
        }

        ctx.session.newPoolPrice = price;
        ctx.session.adminState = ADMIN_STATES.AWAITING_POOL_MAX_ENTRIES;
        await ctx.reply('Please enter the maximum number of entries for this Arena:');
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

            await ctx.reply(`✅ New Arena created successfully!\n\n` +
                `Name: ${ctx.session.newPoolName}\n` +
                `Price: ₦${ctx.session.newPoolPrice.toLocaleString()}\n` +
                `Max Entries: ${maxEntries.toLocaleString()}`);

            // Clear session data
            delete ctx.session.newPoolName;
            delete ctx.session.newPoolPrice;
            ctx.session.adminState = null;

            await showAdminDashboard(ctx);
        } catch (error) {
            console.error('Error creating Arena:', error);
            await ctx.reply('❌ Error creating Arena. Please try again.');
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
    const CHANNEL_USERNAME = 'alpha_entries'; // Your channel username without @
    
    try {
        // Split long messages (Telegram has a 4096 character limit per message)
        const messageParts = splitMessage(message, 4000);
        
        for (let i = 0; i < messageParts.length; i++) {
            await ctx.telegram.sendMessage(
                `@${CHANNEL_USERNAME}`,
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