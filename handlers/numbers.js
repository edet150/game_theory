const { RafflePool, Entry, User, Week, Winning, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
        const { Op } = require('sequelize');

// const {initiatePayment} = require('./payment');
const { initiatePayment, checkQueryExpiry, buildGrid, buildRandomGrid, generateRandomNumbers, finalizeEntries, getAvailableNumbers, buildNumberGrid, buildSelectedNumbersGrid, handleSuccessfulPayment } = require('./payment');
const { Markup} = require('../bot/botInstance');
const { cleanupSelectionMessages, deleteMessagesByIds } = require('../startFunction');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess, sendTemporaryMessage } = require('../utils/responseUtils');
const { checkPaystackTransactions } = require('../cron/paystack_checker');

// Show confirmation summary before payment
async function showPaymentConfirmation(ctx) {
    const session = ctx.session;
    const pool = await RafflePool.findOne({ where: { name: session.poolName } });
    const methodName = session.assignmentMethod === 'choose' ? 'Manual Selection' : 'Random Assignment';
    const sortedNumbers = session.selectedNumbers ? [...session.selectedNumbers].sort((a, b) => a - b) : [];

    const confirmationMessage = `
🎯 *ORDER CONFIRMATION*

🏷️ *Pool:* ${pool.name}
💰 *Price per entry:* ₦${pool.price_per_entry}
📊 *Entries purchased:* ${session.quantity}
🎲 *Selection method:* ${methodName}
🔢 *Your numbers:* ${sortedNumbers.join(', ')}

💵 *Total Amount:* ₦${pool.price_per_entry * session.quantity}

⚠️ *Please review your order before proceeding to payment.*
    `;

    // ⬅️ Delete previous confirmation if it exists
    if (ctx.session.confirmationMessageId_) {
        try {
            await ctx.deleteMessage(ctx.session.confirmationMessageId_);
        } catch (e) {
            console.log("Previous confirmation already gone:", e.message);
        }
    }

    // Send new confirmation
    const confirmation = await ctx.reply(confirmationMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Confirm & Pay', callback_data: 'proceed_to_payment' }
                ],
                [
                    { text: '✏️ Edit Selection', callback_data: 'edit_selection' }
                ],
                [
                    { text: '🔄 Re-start Game Selection', callback_data: 'start_over' }
                ]
            ]
        }
    });
      if (ctx.session.confirmationMessageId_) {
            try {
              setTimeout(async () => {
                try {
                  await ctx.deleteMessage(ctx.session.confirmationMessageId_);
                  // delete ctx.session.confirmationMessageId_;
                } catch (err) {
                  console.log('Could not delete confirmation message:', err.message);
                }
              }, 4000); // ⏳ delete after 4 seconds
            } catch (error) {
              console.log('Could not schedule confirmation message deletion:', error.message);
            }
          }

    // ⬅️ Store confirmation message ID
    ctx.session.confirmationMessageId_ = confirmation.message_id;

    return confirmation;
}


function clearSelectionSession(session) {
  // Clear only selection-related session data, keep user info and finalized entries
  const preservedData = {
    userId: session.userId,
    finalizedEntries: session.finalizedEntries || [],
    // Preserve any other data you want to keep across sessions
  };
  
  // Clear the session and restore preserved data
  Object.keys(session).forEach(key => delete session[key]);
  Object.assign(session, preservedData);
  
  // Alternatively, if you want to be more specific:
  /*
  session.selectedNumbers = null;
  session.availableNumbers = null;
  session.quantityLimit = null;
  session.poolId = null;
  session.poolName = null;
  session.assignmentMethod = null;
  session.quantity = null;
  session.nextAction = null;
  session.selectionMessageId = null;
  */
}

// Function to finalize bonus/referral entries
async function finalizeBonusEntries(ctx, finalNumbers, method) {
    try {
        const loadingMsg = await ctx.reply("⏳ Finalizing your bonus entries, please wait...");
    
        const pool = await RafflePool.findByPk(ctx.session.poolId);
        // const currentWeek = await Week.findOne({ where: { is_current: true } });
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        const today = new Date();

        // Get current week (based on dates)
        const currentWeek = await Week.findOne({
        where: {
            starts_at: { [Op.lte]: today },
            ends_at: { [Op.gte]: today }
        }
        });

   
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
            // Deduct used bonus entries
            user.bonus_entries -= finalNumbers.length;
            await user.save();
            
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

💡 <b>Remember:</b> Draw happens every sunday at 6:00 PM

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

// Helper function to clear selection session
function clearSelectionSession(session) {
    delete session.selectedNumbers;
    delete session.quantityLimit;
    delete session.poolId;
    delete session.poolName;
    delete session.assignmentMethod;
}
module.exports = (bot) => {
// bot.js (or wherever your bot actions are defined)
  
bot.action(/^assign_method:(\w+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const method = ctx.match[1];
  console.log('________________----------------',  ctx.session.bonusEntryFlow)
  if (method !== 'choose' && method !== 'sequential' && method !== 'random') {
    return ctx.reply("⚠️ Invalid assignment method. Please try again.");
  }
  
  // Set up the session state for this flow
  ctx.session.assignmentMethod = method;
  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  const pool = await RafflePool.findOne({ where: { name: ctx.session.poolName } });
  if (!user || !pool) return ctx.reply("⚠️ An error occurred. Please try again.");
  
  ctx.session.userId = user.id;
  ctx.session.poolId = pool.id;
  ctx.session.quantityLimit = ctx.session.quantity;
  ctx.session.selectedNumbers = [];

  // --- Logic for 'choose' (interactive grid) ---
  if (method === 'choose') {
    const initialAvailableNumbers = await getAvailableNumbers(ctx.session.poolId);
    ctx.session.availableNumbers = initialAvailableNumbers;

    const initialGrid = buildGrid(
      ctx.session.availableNumbers,
      ctx.session.selectedNumbers,
      ctx.session.quantityLimit,
      'choose'
    );
    
    // STORE THE GRID MESSAGE ID
    const gridMessage = await ctx.reply(`Please choose *${ctx.session.quantityLimit}* numbers for the ${pool.name} Pool:`, {
      parse_mode: 'markdown',
      reply_markup: initialGrid.reply_markup
    });
      // ⬅️ FIRST DELETE PREVIOUS BUILD GRID MESSAGE IF EXISTS
      if (ctx.session.gridMessageId) {
        try {
          await ctx.deleteMessage(ctx.session.gridMessageId);
        } catch (e) {
          console.log("Previous quantity message already gone:", e.message);
        }
      }

    ctx.session.gridMessageId = gridMessage.message_id;
    console.log( 'grid', ctx.session.gridMessageId)

  // --- Logic for 'random' (interactive card) ---
  } else if (method === 'random') {
    const randomNumbers = await generateRandomNumbers(ctx.session.poolId, ctx.session.quantityLimit);
    ctx.session.selectedNumbers = randomNumbers;

    const { text, reply_markup } = buildRandomGrid(randomNumbers);

    // SEND MESSAGE REPLYS
    const randomGridMessage = await ctx.reply(text, { reply_markup });

      // ⬅️ ⬅️ FIRST DELETE PREVIOUS ID THEN CREATE
      // Delete the previous grid message if it exists
      if (ctx.session.randomGridMessageId) {
        try {
          await ctx.deleteMessage(ctx.session.randomGridMessageId);
        } catch (e) {
          console.log("Previous grid already gone:", e.message);
        }
      }
      // STORE THE RANDOM GRID MESSAGE ID
    ctx.session.randomGridMessageId = randomGridMessage.message_id;
  }
});
  
// ----------------- Handlers -----------------
bot.action(/^choose_number:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  checkQueryExpiry(ctx,)
    const num = parseInt(ctx.match[1]);
      console.log(num)
    // Check if the user has reached their quantity limit
    if (ctx.session.selectedNumbers.length >= ctx.session.quantityLimit) {
        return ctx.answerCbQuery(
            `⚠️ You can only pick ${ctx.session.quantityLimit} numbers.`,
            true // The 'true' parameter shows this as a pop-up alert
        );
    }
  console.log(num)

    // Move the number from the available list to the selected list
    ctx.session.selectedNumbers.push(num);
    ctx.session.availableNumbers = ctx.session.availableNumbers.filter(
        (n) => n !== num
    );

    // Rebuild and edit the message with the updated grid
    const updatedGrid = buildGrid(
        ctx.session.availableNumbers,
        ctx.session.selectedNumbers,
        ctx.session.quantityLimit,
        ctx.session.assignmentMethod
    );
    await ctx.editMessageReplyMarkup(updatedGrid.reply_markup);
});

// This handler removes a number from the user's selection.
bot.action(/^remove_number:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
  const num = parseInt(ctx.match[1]);
  console.log(num)

    // Move the number from the selected list back to the available list
    ctx.session.selectedNumbers = ctx.session.selectedNumbers.filter(
        (n) => n !== num
    );
    ctx.session.availableNumbers.push(num);

    // Sort the available numbers for a consistent, non-random display
    ctx.session.availableNumbers.sort((a, b) => a - b);

    // Rebuild and edit the message with the updated grid
    const updatedGrid = buildGrid(
        ctx.session.availableNumbers,
        ctx.session.selectedNumbers,
        ctx.session.quantityLimit,
        ctx.session.assignmentMethod
    );
    await ctx.editMessageReplyMarkup(updatedGrid.reply_markup);
});
  
// Your existing message handler, but with command protection
bot.on('message', async (ctx) => {
  // Skip processing if it's a command
  if (ctx.message.text && ctx.message.text.startsWith('/')) {
    return;
  }
  
  // Your existing message processing logic
  if (ctx.session.nextAction === 'process_numbers' && ctx.message.text) {
    const requestedNumbers = ctx.message.text.split(',').map(n => parseInt(n.trim(), 10));
    const quantity = ctx.session.quantity;
    const poolName = ctx.session.poolName;

    if (requestedNumbers.length !== quantity) {
      ctx.reply(`Error: You requested ${quantity} entries, but you entered ${requestedNumbers.length} numbers. Please enter exactly ${quantity} numbers.`);
      return;
    }

    const pool = await RafflePool.findOne({ where: { name: poolName } });
    if (!pool) {
      return ctx.reply('Something went wrong. Please try again from the start.');
    }

    const maxEntries = pool.max_entries;
    const invalidRange = requestedNumbers.some(n => isNaN(n) || n <= 0 || n > maxEntries);

    if (invalidRange) {
      ctx.reply(`Error: All numbers must be between 1 and ${maxEntries}. Please enter valid numbers.`);
      return;
    }

    const existingEntries = await Entry.findAll({
      where: {
        entry_number: requestedNumbers,
        pool_id: pool.id
      }
    });

    const takenNumbers = existingEntries.map(e => e.entry_number);
    const availableNumbers = requestedNumbers.filter(n => !takenNumbers.includes(n));

    if (takenNumbers.length > 0) {
      ctx.reply(`❌ Sorry, some of your numbers are already taken.\n\n` +
        `*Numbers Taken:* ${takenNumbers.join(', ')}\n` +
        `*Numbers Available:* ${availableNumbers.join(', ')}\n\n` +
        `Would you like to select new numbers for the ones that are taken, or assign all ${quantity} entries automatically?`, {
          parse_mode: 'markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Choose New Numbers', callback_data: 'assign_method:choose' }],
              [{ text: 'Assign All Automatically', callback_data: 'assign_method:random' }]
            ]
          }
        });
    } else {
      ctx.session.chosenNumbers = requestedNumbers;
      ctx.reply('All numbers are available. Proceeding to payment...');
      // You will need to trigger the payment flow here
      // paymentHandler(ctx); // This is a conceptual call
    }
  }
});

bot.action("random_refresh", async (ctx) => {
  await ctx.answerCbQuery();
  
  const newRandomNumbers = await generateRandomNumbers(ctx.session.poolId, ctx.session.quantityLimit);
  ctx.session.selectedNumbers = newRandomNumbers;

  // Edit the existing message with the new numbers
  const { text, reply_markup } = buildRandomGrid(newRandomNumbers);
  
  try {
    await ctx.editMessageText(text, { reply_markup });
    // Message ID stays the same when editing, so no need to update the stored ID
  } catch (error) {
    console.error('Error refreshing random grid:', error);
    
    // If editing fails (message might be deleted), create a new one
    const newRandomGridMessage = await ctx.reply(text, { reply_markup });
    ctx.session.randomGridMessageId = newRandomGridMessage.message_id;
  }
});

// New handler for confirming the random selection
// Modified random_confirm handler for bonus entries
// bot.action("random_confirm", async (ctx) => {
//     await ctx.answerCbQuery();

//     const finalNumbers = ctx.session.selectedNumbers;
//     if (!finalNumbers || finalNumbers.length !== ctx.session.quantityLimit) {
//         return sendError(ctx, "An error occurred with your selection. Please start again.");
//     }

//     const loadingMsg = await ctx.reply("⏳ Finalizing your entries, please wait...");

//     try {
//         const pool = await RafflePool.findByPk(ctx.session.poolId);
//         const currentWeek = await Week.findOne({ where: { is_current: true } });

//         let result;
//         if (ctx.session.bonusEntryFlow) {
//             // Use bonus entries
//             result = await finalizeEntries(
//                 ctx.session.userId,
//                 ctx.session.poolId,
//                 finalNumbers,
//                 currentWeek.code,
//                 currentWeek.week_name,
//                 null, // No transaction ID for bonus entries
//                 true  // Mark as bonus entries
//             );
//         } else {
//             // Regular paid entries (your existing payment flow)
//             // ... your payment processing code here ...
//         }

//         await ctx.deleteMessage(loadingMsg.message_id);

//         if (result.success) {
//             await cleanupSelectionMessages(ctx);
            
//             const summaryMessage = `
// 🎯 <b>ENTRY CONFIRMATION SUMMARY</b>

// 🏷️ <b>Pool:</b> ${pool.name}
// ${ctx.session.bonusEntryFlow ? '🎁 <b>Type:</b> Bonus Entries' : `💰 <b>Price per entry:</b> ₦${pool.price_per_entry}`}
// 📊 <b>Entries:</b> ${ctx.session.quantityLimit}
// 🎲 <b>Method:</b> Random Assignment
// 🔢 <b>Your numbers:</b> ${finalNumbers.sort((a, b) => a - b).join(', ')}

// ⏰ <b>Entry time:</b> ${new Date().toLocaleString()}
// ✅ <b>Status:</b> Confirmed ${ctx.session.bonusEntryFlow ? '(Bonus)' : 'and paid'}

// 💡 <b>Remember:</b> Draw happens every sunday at 6:00 PM
//             `;

//             await ctx.reply(summaryMessage, { parse_mode: 'HTML' });

//             // Clear bonus flow session
//             if (ctx.session.bonusEntryFlow) {
//                 delete ctx.session.bonusEntryFlow;
//                 delete ctx.session.availableBonusEntries;
//             }

//         } else {
//             await sendError(ctx, result.message);
//         }

//     } catch (err) {
//         console.error("Error in random_confirm:", err);
//         await ctx.deleteMessage(loadingMsg.message_id);
//         await sendError(ctx, "Something went wrong while finalizing your entries.");
//     }

//     clearSelectionSession(ctx.session);
// });
  
// bot.action(/^ddone:(choose|random)$/, async (ctx) => {
//   await ctx.answerCbQuery();
//   const method = ctx.match[1];

//   if (!ctx.session.selectedNumbers || ctx.session.selectedNumbers.length !== ctx.session.quantityLimit) {
//     return ctx.reply(`⚠️ Please select exactly ${ctx.session.quantityLimit} numbers.`);
//   }

//   // ⏳ Send a loading message
//   const loadingMsg = await ctx.reply("⏳ Finalizing your entries, please wait...");

//   try {
//     // Get pool details for the summary
//     const pool = await RafflePool.findByPk(ctx.session.poolId);
//     const methodName = method === 'choose' ? 'Manual Selection' : 'Random Assignment';

//     // Finalize entries in DB
//     const result = await finalizeEntries(
//       ctx.session.userId,
//       ctx.session.poolId,
//       ctx.session.selectedNumbers
//     );

//     // Remove the loading message
//     await ctx.deleteMessage(loadingMsg.message_id);

//     if (result.success) {
//         await cleanupSelectionMessages(ctx);
//       // Create comprehensive summary message (WON'T be deleted)
//       const summaryMessage = `
// 🎯 *ENTRY CONFIRMATION SUMMARY*

// 🏷️ *Pool:* ${pool.name}
// 💰 *Price per entry:* ₦${pool.price_per_entry}
// 📊 *Entries purchased:* ${ctx.session.quantityLimit}
// 🎲 *Selection method:* ${methodName}
// 🔢 *Your numbers:* ${ctx.session.selectedNumbers.sort((a, b) => a - b).join(', ')}

// ⏰ *Entry time:* ${new Date().toLocaleString()}
// ✅ *Status:* Confirmed and paid

// 💡 *Remember: Draw happens every sunday at 6:00 PM*
//       `;

//       // Send the permanent summary message
//       await ctx.reply(summaryMessage, { parse_mode: 'markdown' });

//       // Edit the original grid to show finalized state with Start Over button
//       const finalizedGrid = buildGrid(
//         ctx.session.availableNumbers,
//         ctx.session.selectedNumbers,
//         ctx.session.quantityLimit,
//         method,
//         true
//       );
      
//       // Add Start Over button at the bottom
//       finalizedGrid.reply_markup.inline_keyboard.push([
//         Markup.button.callback("🔄 Start Over", "start_over")
//       ]);

//       await ctx.editMessageReplyMarkup(finalizedGrid.reply_markup);

//     } else {
//       await ctx.reply(`❌ ${result.message}`);
//     }

//     // Store finalized numbers for reference
//     ctx.session.finalizedEntries = ctx.session.finalizedEntries || [];
//     ctx.session.finalizedEntries.push({
//       numbers: [...ctx.session.selectedNumbers],
//       poolId: ctx.session.poolId,
//       poolName: pool.name,
//       method: methodName,
//       quantity: ctx.session.quantityLimit,
//       timestamp: new Date()
//     });

//   } catch (err) {
//     console.error("Finalize error:", err);
//     await ctx.deleteMessage(loadingMsg.message_id);
//     await ctx.reply("❌ Something went wrong while finalizing your entries. Please try again.");
//   }

//   // Clear the current selection session
//   clearSelectionSession(ctx.session);
  
// });
  
// // Modified random_confirm handler
  bot.action("random_confirm", async (ctx) => {
  try{
    await ctx.answerCbQuery();
    console.log('________________+++++++',  ctx.session.bonusEntryFlow)
    const finalNumbers = ctx.session.selectedNumbers;
    if (!finalNumbers || finalNumbers.length !== ctx.session.quantityLimit) {
        return ctx.reply("⚠️ An error occurred with your selection. Please start again.");
  }
      // Check if this is a bonus entry flow
    if (ctx.session.bonusEntryFlow) {
        await finalizeBonusEntries(ctx, finalNumbers, "random");
    } else {
        // Show payment confirmation for regular entries
        await showPaymentConfirmation(ctx);
    }

    // Clean up previous messages
    await cleanupSelectionMessages(ctx);
  } catch (error){
      console.log('Ccatch:', error.message);
    }


});

  // Modified done handler
  bot.action(/^done:(choose|random)$/, async (ctx) => {
  try{
    await ctx.answerCbQuery();
    const method = ctx.match[1];

    if (!ctx.session.selectedNumbers || ctx.session.selectedNumbers.length !== ctx.session.quantityLimit) {
        return ctx.reply(`⚠️ Please select exactly ${ctx.session.quantityLimit} numbers.`);
  }
  
      // Check if this is a bonus entry flow
    if (ctx.session.bonusEntryFlow) {
        await finalizeBonusEntries(ctx, ctx.session.selectedNumbers, method);
    } else {
        // Show payment confirmation for regular entries
        await showPaymentConfirmation(ctx);
    }

    // Clean up previous messages
    await cleanupSelectionMessages(ctx);
    } catch (error){
      console.log('Ccatch:', error.message);
    }

    
  });
  
  // // Handler for proceeding to payment after confirmation
  // bot.action("proceed_to_payment", async (ctx) => {
  //   try {
  //     await ctx.answerCbQuery();
  //     // Initiate payment
  //     await initiatePayment(bot, ctx);
  //     // Delete confirmation message
  //     // if (ctx.session.confirmationMessageId) {
  //     //   try {
  //     //     setTimeout(async () => {
  //     //       try {
  //     //         await ctx.deleteMessage(ctx.session.confirmationMessageId);
  //     //         delete ctx.session.confirmationMessageId;
  //     //       } catch (err) {
  //     //         console.log('Could not delete confirmation message:', err.message);
  //     //       }
  //     //     }, 4000); // ⏳ delete after 4 seconds
  //     //   } catch (error) {
  //     //     console.log('Could not schedule confirmation message deletion:', error.message);
  //     //   }
  //     // }

  //   } catch (error){
  //     console.log('Ccatch:', error.message);
  //   }

  // });
  
  // Handler for proceeding to payment after confirmation
  bot.action("proceed_to_payment", async (ctx) => {
    await ctx.answerCbQuery();
    console.log('his')
      
      // // Delete confirmation message
      // if (ctx.session.confirmationMessageId) {
      //     try {
      //         await ctx.deleteMessage(ctx.session.confirmationMessageId);
      //         delete ctx.session.confirmationMessageId;
      //     } catch (error) {
      //         console.log('Could not delete confirmation message:', error.message);
      //     }
      // }
      
      // Show temporary processing message using sendError (or create a similar function for info messages)
      const processingMsg = await sendTemporaryMessage(
          ctx, 
          "⏳ Processing your request, please wait...",
          3000 // Show for 10 seconds
      );
      
      try {
          // Initiate payment
          await initiatePayment(bot, ctx);
    
          // The processing message will auto-delete after the specified duration
      } catch (error) {
          console.error('Error initiating payment:', error);
          
          // Use sendError for temporary error message
          await sendError(ctx, "Failed to process payment. Please try again or contact support.");
      }
  });

  // Handler for editing selection
  bot.action("_edit_selection", async (ctx) => {
      await ctx.answerCbQuery();
      
      // Delete confirmation message
      if (ctx.session.confirmationMessageId) {
          try {
              await ctx.deleteMessage(ctx.session.confirmationMessageId);
              delete ctx.session.confirmationMessageId;
          } catch (error) {
              console.log('Could not delete confirmation message:', error.message);
          }
      }
      
      // Go back to assignment method selection
      ctx.reply(
          `How would you like to assign your ${ctx.session.quantity} entries?`,
          {
              reply_markup: {
                  inline_keyboard: [
                      [{ text: 'Random', callback_data: 'assign_method:random' }],
                      [{ text: 'I\'ll Choose My Numbers', callback_data: 'assign_method:choose' }]
                  ]
              }
          }
      );
  });
  
  const messageManager = require('../utils/messageManager');

  bot.action("edit_selection", async (ctx) => {
      await ctx.answerCbQuery();
      
     // Delete confirmation message
      if (ctx.session.confirmationMessageId) {
          try {
              await ctx.deleteMessage(ctx.session.confirmationMessageId);
              delete ctx.session.confirmationMessageId;
          } catch (error) {
              console.log('Could not delete confirmation message:', error.message);
          }
      }
      // Go back to quantity selection
    if (ctx.session.bonusEntryFlow) {
      const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
      if (!user || user.bonus_entries === 0) {
        return sendError(ctx, 'No bonus entries available');
      }
      showBonusEntrySelection(ctx, user)
    }
    else {
      try {
        const pool = await RafflePool.findOne({ where: { name: ctx.session.poolName } });
        if (!pool) {
          return ctx.reply('Pool not found. Please try again.');
        }

        // Count number of paid entries
        const currentEntriesCount = await Entry.count({
          where: { pool_id: pool.id, status: 'paid' }
        });

        const options = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '1 Entry', callback_data: `set_quantity:1` }],
              [{ text: '5 Entries', callback_data: `set_quantity:5` }],
              [{ text: '10 Entries', callback_data: `set_quantity:10` }]
            ]
          }
        };

        // Send quantity selection message with tracking
        const quantityMessage = await messageManager.sendAndTrack(ctx,
          `You've selected the ${pool.name} Pool!\n\n` +
          `*Price:* ₦${pool.price_per_entry} per entry\n` +
          `*Max Entries:* ${pool.max_entries}\n` +
          `*Current Entries:* ${currentEntriesCount}/${pool.max_entries}\n\n` +
          `How many entries would you like to buy?`,
          { parse_mode: 'markdown', reply_markup: options.reply_markup }
        );

        ctx.session.quantityMessageId = quantityMessage.message_id;

        // Send the custom prompt with tracking
        const customPromptMessage = await messageManager.sendAndTrack(ctx,
          'Or, type a custom number of entries.'
        );
        ctx.session.customPromptMessageId = customPromptMessage.message_id;

        ctx.session.nextAction = 'prompt_quantity';

      } catch (error) {
        console.error('Error in edit_selection:', error);
        ctx.reply('Could not retrieve pool information. Please try again.');
      }
    }

        // Delete confirmation message using message manager
      if (ctx.session.confirmationMessageId) {
          await messageManager.cleanupMessages(ctx, [ctx.session.confirmationMessageId]);
          delete ctx.session.confirmationMessageId;
      }
      
  });
  
bot.action('view_entry', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ctx.session.finalizedEntries || ctx.session.finalizedEntries.length === 0) {
    return ctx.reply('No finalized entries in this session.');
  }

  let message = '📋 Your Finalized Entries:\n\n';
  
  ctx.session.finalizedEntries.forEach((entry, index) => {
    message += `Session ${index + 1}:\n`;
    message += `Numbers: ${entry.numbers.join(', ')}\n`;
    message += `Time: ${entry.timestamp.toLocaleString()}\n`;
    message += '─'.repeat(20) + '\n';
  });

  ctx.reply(message);
});
  
// bot.action(/^done:(choose|random)$/, async (ctx) => {
//   await ctx.answerCbQuery();
//   const method = ctx.match[1];

//   if (
//     !ctx.session.selectedNumbers ||
//     ctx.session.selectedNumbers.length !== ctx.session.quantityLimit
//   ) {
//     return ctx.reply(`⚠️ Please select exactly ${ctx.session.quantityLimit} numbers.`);
//   }

//   // ⏳ Send a loading message
//   const loadingMsg = await ctx.reply("⏳ Finalizing your entries, please wait...");

//   try {
//     // Finalize entries in DB
//     const result = await finalizeEntries(
//       ctx.session.userId,
//       ctx.session.poolId,
//       ctx.session.selectedNumbers
//     );

//     // Remove the loading message
//     await ctx.deleteMessage(loadingMsg.message_id);

//     if (result.success) {
//       await ctx.reply(`🎉 ${result.message}`);
//     } else {
//       await ctx.reply(`❌ ${result.message}`);
//     }

//     // 🔒 Rebuild grid but without Refresh/Done buttons
//     const finalizedGrid = buildGrid(
//       ctx.session.availableNumbers,
//       ctx.session.selectedNumbers,
//       ctx.session.quantityLimit,
//       method
//     );

//     // Remove action buttons
//     finalizedGrid.reply_markup.inline_keyboard.pop();

//     await ctx.editMessageReplyMarkup(finalizedGrid.reply_markup);

//     if (ctx.session.selectionMessageId) {
//       await ctx.telegram.editMessageReplyMarkup(
//         ctx.chat.id,
//         ctx.session.selectionMessageId,
//         null,
//         finalizedGrid.reply_markup
//       );
//     }
//   } catch (err) {
//     console.error("Finalize error:", err);
//     await ctx.deleteMessage(loadingMsg.message_id);
//     await ctx.reply("❌ Something went wrong while finalizing your entries. Please try again.");
//   }

//   // Clean up session for this flow
//   ctx.session.assignmentMethod = null;
// });

bot.action(/^refresh:(choose|random)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const method = ctx.match[1];

  // Fetch updated available numbers
  const available = await getAvailableNumbers(
    ctx.session.poolId,
    ctx.session.selectedNumbers
  );
  ctx.session.availableNumbers = available;

  // Rebuild the grid with current selections & method
  const updatedGrid = buildGrid(
    ctx.session.availableNumbers,
    ctx.session.selectedNumbers,
    ctx.session.quantityLimit,
    method
  );

  // Edit the message and update the stored grid message ID
  try {
    await ctx.editMessageReplyMarkup(updatedGrid.reply_markup);
    // The message ID remains the same when editing, so no need to update
  } catch (error) {
    console.log('Error refreshing grid:', error.message);
  }
});
  
bot.action('no_action', (ctx) => {
  ctx.answerCbQuery('This entry has been finalized', true);
});
  
  
  bot.action("back_to_confirmation", async (ctx) => {
    await ctx.answerCbQuery();
    
    // Delete payment message
    if (ctx.session.paymentMessageId) {
        try {
            await ctx.deleteMessage(ctx.session.paymentMessageId);
            delete ctx.session.paymentMessageId;
        } catch (error) {
            console.log('Could not delete payment message:', error.message);
        }
    }
    
    // Show confirmation again
    await showPaymentConfirmation(ctx);
});

bot.action("verify_payment", async (ctx) => {
  await ctx.answerCbQuery();
    
    // Manual trigger verification
  await checkPaystackTransactions();
  await deleteMessagesByIds(ctx, ['paymentMessageId']);
});
};




