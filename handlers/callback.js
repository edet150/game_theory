const { RafflePool, Entry, User, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const { sendError, sendSuccess, sendTemporaryMessage } = require('../utils/responseUtils');

const { initiatePayment, checkQueryExpiry, buildGrid, buildRandomGrid, generateRandomNumbers, finalizeEntries, getAvailableNumbers, buildNumberGrid, buildSelectedNumbersGrid, handleSuccessfulPayment } = require('./payment');

const { cleanupSelectionMessages } = require('../startFunction');
const messageManager = require('../utils/messageManager');


module.exports = (bot) => {
    // Unified handler for both payment and referral flows
    async function handleEntryFinalization(ctx, method) {
        await ctx.answerCbQuery();

        const finalNumbers = ctx.session.selectedNumbers;
        if (!finalNumbers || finalNumbers.length !== ctx.session.quantityLimit) {
            return sendError(ctx, "An error occurred with your selection. Please start again.");
        }

        // Clean up previous messages
        await cleanupSelectionMessages(ctx);
console.log('ctx.session.bonusEntryFlow', ctx.session.bonusEntryFlow)
        // Check if this is a referral/bonus entry flow
        if (ctx.session.bonusEntryFlow) {
            // Handle bonus/referral entries (no payment needed)
            await finalizeBonusEntries(ctx, finalNumbers, method);
        } else {
            // Handle regular payment flow
            await showPaymentConfirmation(ctx, finalNumbers, method);
        }
    }

    // Modified random_confirm handler
    // bot.action("random_confirm", async (ctx) => {
    //     await handleEntryFinalization(ctx, "random");
    // });

    // // Modified done handler
    // bot.action(/^done:(choose|random)$/, async (ctx) => {
    //     const method = ctx.match[1];
    //     await handleEntryFinalization(ctx, method);
    // });

    // Function to finalize bonus/referral entries
    async function finalizeBonusEntries(ctx, finalNumbers, method) {
        try {
            const loadingMsg = await ctx.reply("⏳ Finalizing your bonus entries, please wait...");
        
            const pool = await RafflePool.findByPk(ctx.session.poolId);
            const currentWeek = await Week.findOne({ where: { is_current: true } });
            const user = await User.findOne({ where: { telegram_id: ctx.from.id } });

            if (!currentWeek) {
                await ctx.deleteMessage(loadingMsg.message_id);
                return sendError(ctx, "No current week found. Please try again later.");
            }

            if (user.bonus_entries < finalNumbers.length) {
                await ctx.deleteMessage(loadingMsg.message_id);
                return sendError(ctx, `You don't have enough bonus entries. Available: ${user.bonus_entries}`);
            }

            // Finalize the entries
            const result = await finalizeEntries(
                user.id,
                ctx.session.poolId,
                finalNumbers,
                currentWeek.code,
                currentWeek.week_name,
                null, // No transaction ID for bonus entries
                true  // Mark as bonus entries
            );

            await ctx.deleteMessage(loadingMsg.message_id);

            if (result.success) {
                // Show success summary
                await showBonusEntrySummary(ctx, finalNumbers, pool, method);
            
                // Clear bonus flow session
                delete ctx.session.bonusEntryFlow;
                delete ctx.session.availableBonusEntries;
            } else {
                await sendError(ctx, result.message);
            }

        } catch (error) {
            console.error("Error finalizing bonus entries:", error);
            await sendError(ctx, "Something went wrong while finalizing your bonus entries.");
        }

        clearSelectionSession(ctx.session);
    }

    // Function to show bonus entry summary
    async function showBonusEntrySummary(ctx, finalNumbers, pool, method) {
        const summaryMessage = `
🎯 <b>BONUS ENTRY CONFIRMATION</b>

🏷️ <b>Arena:</b> ${pool.name}
🎁 <b>Type:</b> Bonus Entries
📊 <b>Entries Used:</b> ${finalNumbers.length}
🎲 <b>Method:</b> ${method === 'random' ? 'Random Assignment' : 'Manual Selection'}
🔢 <b>Your numbers:</b> ${finalNumbers.sort((a, b) => a - b).join(', ')}

⏰ <b>Entry time:</b> ${new Date().toLocaleString()}
✅ <b>Status:</b> Confirmed (Bonus)

💡 <b>Remember:</b> Draw happens every Saturday at 3:00 PM

🎉 <b>Thank you for using your bonus entries!</b>
    `;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 Start Over", callback_data: "start_over" }],
                    [{ text: "🎯 Referral Dashboard", callback_data: "referral_dashboard" }]
                ]
            }
        };

        await ctx.reply(summaryMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });
    }

    // Modified showPaymentConfirmation to accept parameters
    async function showPaymentConfirmation(ctx, finalNumbers, method) {
        // Your existing payment confirmation logic, but now it accepts
        // finalNumbers and method as parameters instead of using session
        const pool = await RafflePool.findByPk(ctx.session.poolId);
    
        const totalAmount = pool.price_per_entry * finalNumbers.length;
    
        const confirmationMessage = `
💰 <b>PAYMENT CONFIRMATION</b>

🏷️ <b>Arena:</b> ${pool.name}
📊 <b>Entries:</b> ${finalNumbers.length}
🎲 <b>Method:</b> ${method === 'random' ? 'Random Assignment' : 'Manual Selection'}
🔢 <b>Your numbers:</b> ${finalNumbers.sort((a, b) => a - b).join(', ')}
💵 <b>Total Amount:</b> ₦${totalAmount}

Please proceed with payment to confirm your entries.
    `;

        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Confirm Payment", callback_data: "proceed_to_payment" }],
                    [{ text: "↩️ Change Selection", callback_data: "change_selection" }]
                ]
            }
        };

        const message = await ctx.reply(confirmationMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
        });
    
        // Store the confirmation message ID for cleanup
        ctx.session.confirmationMessageId = message.message_id;
        ctx.session.finalNumbers = finalNumbers; // Store for payment processing
        ctx.session.selectionMethod = method; // Store for reference
    }

    // // Additional handler for the payment flow
    // bot.action("proceed_to_payment", async (ctx) => {
    //     await ctx.answerCbQuery();
    
    //     // Your existing payment processing logic
    //     // Use ctx.session.finalNumbers and ctx.session.selectionMethod
    //     await processPayment(ctx);
    // });

    // // Handler for changing selection
    // bot.action("change_selection", async (ctx) => {
    //     await ctx.answerCbQuery();
    //     await cleanupSelectionMessages(ctx);
    
    //     // Go back to the appropriate selection screen
    //     if (ctx.session.selectionMethod === 'random') {
    //         await showRandomSelection(ctx);
    //     } else {
    //         await showNumberGrid(ctx);
    //     }
    // });

    // Helper function to clear selection session
    function clearSelectionSession(session) {
        const keysToRemove = [
            'selectedNumbers', 'quantityLimit', 'poolId', 'poolName',
            'availableNumbers', 'gridMessageId', 'randomGridMessageId',
            'assignmentMessageId', 'finalNumbers', 'selectionMethod'
        ];
    
        keysToRemove.forEach(key => {
            if (session[key] !== undefined) {
                delete session[key];
            }
        });
    }

    async function showBonusEntrySelection(ctx, user) {
    const availableEntries = user.bonus_entries;
    
    // Create grid buttons with 4 columns
    const entryOptions = [];
    const maxOptions = Math.min(availableEntries, 16); // Limit to 16 options max
    
    // Add entry options in rows of 4
    for (let i = 1; i <= maxOptions; i += 4) {
        const row = [];
        for (let j = i; j < i + 4 && j <= maxOptions; j++) {
            row.push({ 
                text: `${j}`, 
                callback_data: `bonus_quantity:${j}` 
            });
        }
        entryOptions.push(row);
    }
    
    // Add custom amount button if needed
    if (availableEntries > 16) {
        entryOptions.push([{ 
            text: 'Custom Amount (1-99)', 
            callback_data: 'bonus_custom' 
        }]);
    }
    
    // Add back button
    entryOptions.push([{ 
        text: '🔙 Back', 
        callback_data: 'referral_dashboard' 
    }]);

    const message = `
<b>🎁 Use Bonus Entries</b>

You have <b>${availableEntries}</b> bonus entries available.

Select how many to use:
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
    
    // Modified finalizeEntries function to handle bonus entries
    async function finalizeEntries(userId, poolId, numbers, lottery_week_code, lottery_week_name, transactionId = null, isBonus = false) {
        try {
            const entries = numbers.map((num) => ({
                user_id: userId,
                pool_id: poolId,
                entry_number: num,
                week_code: lottery_week_code,
                week_name: lottery_week_name,
                transaction_id: transactionId,
                status: "paid",
                is_bonus_entry: isBonus
            }));

            await Entry.bulkCreate(entries);
        
            // If using bonus entries, deduct from user's balance
            if (isBonus) {
                const user = await User.findByPk(userId);
                user.bonus_entries -= numbers.length;
                await user.save();
            }

            return { success: true, message: `Entries created: ${numbers.join(", ")}` };
        } catch (error) {
            console.error("Error creating entries:", error);
            return { success: false, message: "An error occurred while finalizing entries." };
        }
    }
}