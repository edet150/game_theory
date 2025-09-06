const { getBotInstance , Markup} = require('../bot/botInstance');
const bot = getBotInstance();
const { RafflePool, Entry, User, Payment, Week, sequelize } = require('../models');
const axios = require('axios');  
const { showStartScreen } = require('../startFunction');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
// In handleSuccessfulPayment function
const redisService = require('../services/redisService');


// Show confirmation summary before payment
async function showPaymentConfirmation(ctx) {
    const session = ctx.session;
    const pool = await RafflePool.findOne({ where: { name: session.poolName } });
    const methodName = session.assignmentMethod === 'choose' ? 'Manual Selection' : 'Random Assignment';
    const sortedNumbers = session.selectedNumbers ? [...session.selectedNumbers].sort((a, b) => a - b) : [];

    const confirmationMessage = `
🎯 **ORDER CONFIRMATION**

🏷️ **Pool:** ${pool.name}
💰 **Price per entry:** ₦${pool.price_per_entry}
📊 **Entries purchased:** ${session.quantity}
🎲 **Selection method:** ${methodName}
🔢 **Your numbers:** ${sortedNumbers.join(', ')}

💵 **Total Amount:** ₦${pool.price_per_entry * session.quantity}

⚠️ *Please review your order before proceeding to payment.*
    `;

    const confirmation = await ctx.reply(confirmationMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Confirm & Pay', callback_data: 'proceed_to_payment' },
                    { text: '✏️ Edit Selection', callback_data: 'edit_selection' }
                ]
            ]
        }
    });

    // Store confirmation message ID for cleanup
    ctx.session.confirmationMessageId = confirmation.message_id;
    return confirmation;
}
async function initiatePayment(bot, ctx) {
    const session = ctx.session;
    
    try {
        const pool = await RafflePool.findOne({ where: { name: session.poolName } });
        if (!pool) return ctx.reply('⚠️ Pool not found.');

        const totalAmount = pool.price_per_entry * session.quantity;

        // Find user by telegram_id to get DB id
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        if (!user) return ctx.reply("⚠️ You must register first.");

        // Get current lottery week
        const currentLotteryWeek = await Week.findOne({
            order: [['week_number', 'DESC']]
        });

        if (!currentLotteryWeek) {
            return ctx.reply('⚠️ No active lottery week found. Please try again later.');
        }

        // Prepare summary data for metadata
        const methodName = session.assignmentMethod === 'choose' ? 'Manual Selection' : 'Random Assignment';
        const sortedNumbers = session.selectedNumbers ? [...session.selectedNumbers].sort((a, b) => a - b) : [];

        // Prepare metadata for payment
        const metadata = {
            telegram_id: ctx.from.id,
            user_id: user.id,
            pool_id: pool.id,
            pool_name: pool.name,
            price_per_entry: pool.price_per_entry,
            quantity: session.quantity,
            total_amount: totalAmount,
            assignmentMethod: session.assignmentMethod,
            method_name: methodName,
            lottery_week_id: currentLotteryWeek.id,
            lottery_week_code: currentLotteryWeek.code,
            lottery_week_number: currentLotteryWeek.week_number,
            lottery_week_name: currentLotteryWeek.week_name,
            selectedNumbers: session.selectedNumbers || [],
            sorted_numbers: sortedNumbers,
            entry_time: new Date().toISOString(),
            summary_data: {
                pool_name: pool.name,
                price_per_entry: pool.price_per_entry,
                quantity: session.quantity,
                method_name: methodName,
                numbers: sortedNumbers,
                entry_time: new Date().toISOString()
            }
        };

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: ctx.from.username ? `${ctx.from.username}@example.com` : `user${ctx.from.id}@example.com`,
                amount: totalAmount * 100,
                currency: 'NGN',
                callback_url: 'https://t.me/trend_9ja?start=payload',
                metadata: metadata
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SEC_TEST}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const paymentLink = paystackResponse.data.data.authorization_url;

        // Show payment button
        const paymentMessage = await ctx.reply(
            `💳 Ready to complete your purchase!\n\n` +
            `Total: ₦${totalAmount}\n` +
            `Click the button below to proceed to payment:`,
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `💳 Pay ₦${totalAmount}`, url: paymentLink }],
                        [{ text: `💳 Verify Payment`, callback_data: 'verify_payment' }],
                        [{ text: '↩️ Back to Confirmation screen', callback_data: 'back_to_confirmation' }]
                    ]
                }
            }
        );

        // Store payment message ID for cleanup
        ctx.session.paymentMessageId = paymentMessage.message_id;

    } catch (error) {
        console.error('Error initiating payment:', error.response?.data || error.message);
        ctx.reply('⚠️ Failed to initiate payment. Please try again later.');
    }
}


  /**
   * Webhook handler or conceptual handler for successful Paystack payment
   * Call this when Paystack sends a callback for successful payment.
   */
  async function handleSuccessfulPayment(bot, paystackTransaction) {
    const t = await sequelize.transaction();

    try {
        const { id, reference, amount, metadata, status } = paystackTransaction;
        console.log("Paystack Txn:", paystackTransaction);

        // Extract from metadata
        const { 
            telegram_id, 
            user_id, 
            pool_id, 
            quantity, 
            assignmentMethod, 
            selectedNumbers,
            lottery_week_id,
            lottery_week_number,
            lottery_week_name,
            lottery_week_code,
            summary_data
        } = metadata;

        // Get user and pool
        const user = await User.findByPk(user_id);
        const pool = await RafflePool.findByPk(pool_id);
        const lotteryWeek = await Week.findByPk(lottery_week_id);

        if (!user || !pool || !lotteryWeek) {
            throw new Error(`User, Pool, or Lottery Week not found`);
        }

        // Check if payment already processed
        const existingPayment = await Payment.findOne({
            where: { paystack_transaction_id: id },
            transaction: t
        });

        if (existingPayment) {
            console.log(`Payment with transaction ID ${id} already processed. Skipping.`);
            await t.commit();
            return;
        }

        // Create payment record with lottery week
        const paymentRecord = await Payment.create(
            {
                user_id: user.id,
                pool_id: pool.id,
                lottery_week_id: lotteryWeek.id,
                paystack_transaction_id: id,
                paystack_reference: reference,
                amount: amount / 100,
                status
            },
            { transaction: t }
        );

        // Use finalizeEntries to create the entries
        const result = await finalizeEntries(
            user.id,
            pool.id,
            selectedNumbers,
            lottery_week_code,
          lottery_week_name,
            id,
            t // Pass transaction
        );

        if (!result.success) {
            throw new Error(`Failed to create entries: ${result.message}`);
        }

              
        // After successful payment processing:
        const entryData = {
            numbers: selectedNumbers,
            poolId: pool.id,
            poolName: pool.name,
            method: summary_data.method_name,
            quantity: summary_data.quantity,
            lottery_week_id: lotteryWeek.id,
            lottery_week_number: lotteryWeek.week_number,
            payment_reference: reference,
            payment_amount: amount / 100
        };

        // Store in Redis
        await redisService.addFinalizedEntry(telegram_id, entryData);
        await t.commit();
        console.log(`✅ Processed transaction ${id}, entries created.`);

        // Create comprehensive summary message from metadata
        const summaryMessage = `
🎯 *ENTRY CONFIRMATION SUMMARY*

🏷️ *Pool:* ${summary_data.pool_name}
💰 *Price per entry:* ₦${summary_data.price_per_entry}
📊 *Entries purchased:* ${summary_data.quantity}
🎲 *Selection method:* ${summary_data.method_name}
🔢 *Your numbers:* ${summary_data.numbers.join(', ')}

⏰ *Entry time:* ${new Date(summary_data.entry_time).toLocaleString()}
🏆 *Lottery Week:* ${lottery_week_number}
✅ *Status:* Confirmed and paid

💡 *Remember: Draw happens every Saturday at 3:00 PM*
        `;

        // Send success message with summary to user
      await bot.telegram.sendMessage(
          
            telegram_id,
            summaryMessage,
            { parse_mode: 'Markdown' }
        );

        // Additional confirmation message
        await bot.telegram.sendMessage(
            telegram_id,
            `✅ Payment successful! Your ${quantity} entries in the ${pool.name} Pool for week ${lottery_week_number} have been confirmed. Good luck! 🎉`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Start Over", callback_data: "start_over" }]
                    ]
                }
            }
        );

    } catch (error) {
        await t.rollback();
        console.error("❌ Error handling successful payment:", error);

        const telegramId = paystackTransaction.metadata?.telegram_id;
        if (telegramId) {
            await bot.telegram.sendMessage(
                telegram_id,
                "❌ An error occurred while processing your payment. Please contact support."
            );
        }
    }
}
async function _handleSuccessfulPayment(bot, paystackTransaction) {
  const t = await sequelize.transaction(); // Start a database transaction

  try {
    const { id, reference, amount, metadata, status } = paystackTransaction;
    console.log("Paystack Txn:", paystackTransaction);

    // Extract from metadata
    const { telegram_id, user_id, pool_id, pool: poolName, quantity, assignmentMethod, chosenNumbers } = metadata;

    // Resolve actual user and pool
    let user = null;
    if (user_id) {
      user = await User.findByPk(user_id);
    } else if (telegram_id) {
      user = await User.findOne({ where: { telegram_id } });
    }

    const pool = pool_id
      ? await RafflePool.findByPk(pool_id)
      : await RafflePool.findOne({ where: { name: poolName } });

    if (!user || !pool) {
      throw new Error(`User or Pool not found (user=${user?.id}, pool=${pool?.id})`);
    }

    // First, check if this payment has already been processed
    const existingPayment = await Payment.findOne({
      where: { paystack_transaction_id: id },
      transaction: t
    });

    if (existingPayment) {
      console.log(`Payment with transaction ID ${id} already processed. Skipping.`);
      await t.commit();
      return;
    }

    // Insert new payment record directly with valid foreign keys
    const paymentRecord = await Payment.create(
      {
        user_id: user.id,
        pool_id: pool.id,
        paystack_transaction_id: id,
        paystack_reference: reference,
        amount: amount / 100, // Convert from kobo
        status
      },
      { transaction: t }
    );

    // Now create the entries
    // await createEntries(bot, user.id, pool.id, quantity, assignmentMethod, chosenNumbers, telegram_id);

    await t.commit(); // Commit everything
    console.log(`✅ Processed transaction ${id}, entries created.`);

    // Notify user in Telegram
    await bot.telegram.sendMessage(
      telegram_id,
      `✅ Payment successful! You bought ${quantity} entries in the ${pool.name} Pool. Good luck! 🎉`
    );

  } catch (error) {
    await t.rollback();
    console.error("❌ Error handling successful payment:", error);

    const telegramId = paystackTransaction.metadata?.telegram_id;
    if (telegramId) {
      // bot.telegram.sendMessage(
      //   telegramId,
      //   "❌ An error occurred while processing your payment. Please contact support."
      // );
      await messageManager.sendAndTrackByBot(
            bot,
            telegramId,
            "❌ An error occurred while processing your payment. Please contact support."
        );
    }
  }
}




// ----------------- Utility -----------------
// ----------------- Utility -----------------

async function getAvailableNumbers(poolId, selectedNumbers = [], limit = 15) {
  const pool = await RafflePool.findByPk(poolId, { attributes: ['max_entries'] });
  if (!pool) return [];
  const maxEntries = pool.max_entries;

  const taken = await Entry.findAll({
    where: { pool_id: poolId, status: "paid" },
    attributes: ["entry_number"],
  });

  const takenSet = new Set(taken.map((t) => t.entry_number));
  
  // Exclude numbers already selected by the user
  const selectedSet = new Set(selectedNumbers);

  const poolNumbers = Array.from({ length: maxEntries }, (_, i) => i + 2000);

  const available = poolNumbers.filter((n) => !takenSet.has(n) && !selectedSet.has(n));
  available.sort(() => Math.random() - 0.5);
  return available.slice(0, limit);
}

function buildNumberGrid(numbers, selected = []) {
  const keyboard = [];
  for (let i = 0; i < numbers.length; i += 5) {
    const row = numbers.slice(i, i + 5).map((num) => {
      // The `isSelected` logic is no longer here because we are displaying selected numbers separately.
      // We are just showing available numbers.
      return Markup.button.callback(`${num}`, `choose_number:${num}`);
    });
    keyboard.push(row);
  }
  keyboard.push([
    Markup.button.callback("🔄 Refresh", "choose_refresh"),
    Markup.button.callback("✅ Done", "choose_done"),
  ]);
  return Markup.inlineKeyboard(keyboard);
}

// New function to build the grid for selected numbers
function buildSelectedNumbersGrid(selected) {
    const keyboard = [];
    if (selected.length === 0) {
        return Markup.inlineKeyboard([[{ text: "No numbers selected yet.", callback_data: "none" }]]);
    }
    
    // Create a row for each selected number with a remove button
    selected.sort((a, b) => a - b).forEach(num => {
        keyboard.push([
            Markup.button.callback(`❌ Remove ${num}`, `remove_number:${num}`)
        ]);
    });
    return Markup.inlineKeyboard(keyboard);
}

async function createEntries(
  ctx,
  userId,
  poolId,
  quantity,
  method,
  chosenNumbers = []
) {
  console.log(method)
  const pool = await RafflePool.findByPk(poolId);
  if (!pool) return ctx.reply("⚠️ Pool not found.");

  try {
    if (method === "choose") {
      // Logic for initiating the interactive 'chooses' method
      const available = await getAvailableNumbers(poolId);

      ctx.session.userId = userId;
      ctx.session.poolId = poolId;
      ctx.session.quantityLimit = quantity;
      ctx.session.selectedNumbers = [];

      console.log(ctx.session);

      await ctx.reply(
        `Please choose *${quantity}* numbers for the ${pool.name} pool:`,
        {
          parse_mode: "Markdown",
          ...buildNumberGrid(available, [], quantity),
        }
      );
      // This is an interactive process, so we return here.
      // The final entry creation will be handled by a separate handler like `choose_done`.
      return;
    }

    // This section is for 'sequential' and 'random' methods,
    // which are fully automated and don't need user input.
    // The code below should only run when method is NOT 'chooses'.
    let assignedNumbers = [];

    // Correctly handle sequential and random assignment
    const latestEntry = await Entry.findOne({
      where: { pool_id: poolId },
      order: [["entry_number", "DESC"]],
      attributes: ["entry_number"],
    });

    let startNumber = (latestEntry ? latestEntry.entry_number : 0) + 1;
    for (let i = 0; i < quantity; i++) {
      assignedNumbers.push(startNumber + i);
    }
    if (method === "random") {
      assignedNumbers.sort(() => Math.random() - 0.5);
    }

    // Create the entries with the assigned numbers
    const entries = assignedNumbers.map((number) => ({
      user_id: userId,
      pool_id: poolId,
      entry_number: number,
      status: "paid",
    }));

    await Entry.bulkCreate(entries);
    await ctx.reply(
      `✅ Entries Created! Your entry numbers are: ${assignedNumbers.join(", ")}.`
    );
  } catch (error) {
    console.error("Error creating entries:", error);
    await ctx.reply(
      "❌ An error occurred while assigning your entries. Please contact support."
    );
  }
}
async function updateSelectionView(ctx, selectedNumbers, quantity) {
    const selectedText = `You have selected *${selectedNumbers.length}* of *${quantity}* numbers.`;
    
    // First, display or edit the message with the selected numbers grid
    // We check if the message ID is in the session to edit it, otherwise we send a new message.
    if (ctx.session.selectionMessageId) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            ctx.session.selectionMessageId,
            null,
            selectedText,
            { parse_mode: 'Markdown', reply_markup: buildSelectedNumbersGrid(selectedNumbers).reply_markup }
        );
    } else {
        const message = await ctx.reply(selectedText, {
            parse_mode: 'Markdown',
            reply_markup: buildSelectedNumbersGrid(selectedNumbers).reply_markup
        });
        ctx.session.selectionMessageId = message.message_id;
    }
}
async function _finalizeEntries(userId, poolId, numbers, lottery_week_code, lottery_week_name, id) {
  console.log('lottery_week_code', lottery_week_code)  
  try {
        const entries = numbers.map((num) => ({
            user_id: userId,
            pool_id: poolId,
            entry_number: num,
            week_code:lottery_week_code ,
            transaction_id:id ,
            week_name:lottery_week_name ,
            status: "paid", // Assuming payment is confirmed
        }));

        await Entry.bulkCreate(entries);
        return { success: true, message: `Entries created: ${numbers.join(", ")}` };
    } catch (error) {
        console.error("Error creating entries:", error);
        return { success: false, message: "An error occurred while finalizing entries." };
    }
}
// Modified finalizeEntries function
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

function buildGrid(available, selected, quantity, method, finalized = false) {
  const keyboard = [];

  // 1. Add "Your Selection" heading
  keyboard.push([Markup.button.callback(`✅ Your Selections (${selected.length}/${quantity})`, "selection_header")]);

  // 2. Add the selected numbers grid
  if (selected.length > 0) {
    const sortedSelected = selected.sort((a, b) => a - b);
    for (let i = 0; i < sortedSelected.length; i += 3) {
      const row = sortedSelected.slice(i, i + 3).map((num) => {
        if (finalized) {
          // Disable remove button for finalized entries (no callback, just text)
          return Markup.button.callback(`✅ ${num}`, "no_action");
        } else {
          const callbackData = (method === 'choose') ? `remove_number:${num}` : `random_remove:${num}`;
          return Markup.button.callback(`❌ ${num}`, callbackData);
        }
      });
      keyboard.push(row);
    }
  } else {
    keyboard.push([Markup.button.callback("No numbers selected yet.", "selection_empty")]);
  }

  // 3. Add "Available Numbers" heading (only show if not finalized)
  if (!finalized) {
    keyboard.push([Markup.button.callback("Available Numbers:", "available_header")]);

    // 4. Add the available numbers grid
    for (let i = 0; i < available.length; i += 5) {
      const row = available.slice(i, i + 5).map((num) => {
        const callbackData = (method === 'choose') ? `choose_number:${num}` : `random_select:${num}`;
        return Markup.button.callback(`${num}`, callbackData);
      });
      keyboard.push(row);
    }

    // 5. Add action buttons
    keyboard.push([
      Markup.button.callback("🔄 Refresh", `refresh:${method}`),
      Markup.button.callback("✅ Done", `done:${method}`),
    ]);
  } else {
    // For finalized view, show a message instead of available numbers
    keyboard.push([Markup.button.callback("🎉 Entries Finalized!", "finalized_header")]);
  }

  return Markup.inlineKeyboard(keyboard);
}

async function generateRandomNumbers(poolId, quantity) {
  const pool = await RafflePool.findByPk(poolId, { attributes: ['max_entries'] });
  if (!pool) return [];
  const maxEntries = pool.max_entries;

  const taken = await Entry.findAll({
    where: { pool_id: poolId, status: "paid" },
    attributes: ["entry_number"],
  });
  const takenSet = new Set(taken.map((t) => t.entry_number));

  const availableNumbers = [];
  for (let i = 2000; i <= maxEntries; i++) {
    if (!takenSet.has(i)) {
      availableNumbers.push(i);
    }
  }

  // Shuffle the entire available pool
  availableNumbers.sort(() => Math.random() - 0.5);

  // Take the first 'quantity' numbers
  return availableNumbers.slice(0, quantity);
}

// New function to build the grid for random numbers
function buildRandomGrid(numbers, finalized = false) {
  const text = `Your ${finalized ? 'finalized' : 'randomly selected'} numbers: ${numbers.join(", ")}`;
  
  let keyboard;
  if (finalized) {
    // Read-only view for finalized entries
    keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Finalized - Cannot be changed", "no_action_finalized")]
    ]);
  } else {
    // Interactive view for selection
    keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("🔄 Refresh", "random_refresh"),
        Markup.button.callback("✅ Confirm", "random_confirm"),
      ],
    ]);
  }
  
  return { text, reply_markup: keyboard.reply_markup };
}
async function checkQueryExpiry(ctx, restartOnExpire = false) {
  const now = Date.now();
console.log('working')
  if (ctx.session.keyboardTimestamp && now - ctx.session.keyboardTimestamp > 30000) {
    // await ctx.answerCbQuery("⚠️ This action has expired. Please refresh.");
    await sendError(ctx, "⚠️ This action has expired. Please refresh.");
    if (restartOnExpire) {
      // Re-run your /start flow
        await showStartScreen(ctx);
    }

    return true; // expired
  } else {
    console.log('ese')
  }

  return false; // still valid
}
module.exports = {
  checkQueryExpiry,
  initiatePayment,
  createEntries,
  handleSuccessfulPayment,
  getAvailableNumbers,
  buildNumberGrid,
  buildSelectedNumbersGrid,
  updateSelectionView,
  finalizeEntries,
  buildGrid,
  buildRandomGrid,
  generateRandomNumbers
};
