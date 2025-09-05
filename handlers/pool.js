const { RafflePool, Entry } = require('../models');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const CLEANUP_CATEGORIES = {
    GRID: ['selectionMessageId', 'gridMessageId', 'randomGridMessageId'],
    QUANTITY: ['quantitySelectionMessageId', 'assignmentMessageId', 'customQuantityMessageId'],
    ALL: ['quantitySelectionMessageId', 'assignmentMessageId', 'customQuantityMessageId', 
          'selectionMessageId', 'gridMessageId', 'randomGridMessageId']
};
async function cleanupSessionMessages(ctx, messageKeys) {
  for (const messageKey of messageKeys) {
    if (ctx.session && ctx.session[messageKey]) {
      console.log(`Trying to delete ${messageKey}: ${ctx.session[messageKey]}`);
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session[messageKey]);
        console.log(`✅ Deleted ${messageKey}`);
      } catch (deleteError) {
        console.log(`❌ Could not delete ${messageKey}:`, deleteError.message);
      }
      delete ctx.session[messageKey];
    } else {
      console.log(`⚠️ No session value for ${messageKey}`);
    }
  }
}
module.exports = (bot) => {
bot.action(/^select_pool:(\w+)/, async (ctx) => {
    ctx.answerCbQuery();
    const poolName = ctx.match[1];

    // Store pool choice in session
    ctx.session.poolName = poolName;

    if (!poolName) {
        console.error('Pool name is undefined');
        return ctx.reply('Invalid pool selection. Please try again.');
    }

    try {
        // Find the pool using model
        const pool = await RafflePool.findOne({ where: { name: poolName } });
        if (!pool) {
            ctx.reply('Pool not found. Please try again.');
            return;
        }

        // Count number of paid entries using model
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

        // Send quantity selection message and store its ID
        const quantityMessage = await ctx.reply(
            `You've selected the ${pool.name} Pool!\n\n` +
            `**Price:** ₦${pool.price_per_entry} per entry\n` +
            `**Max Entries:** ${pool.max_entries}\n` +
            `**Current Entries:** ${currentEntriesCount}/${pool.max_entries}\n\n` +
            `How many entries would you like to buy?`,
            { parse_mode: 'Markdown', reply_markup: options.reply_markup }
        );

        ctx.session.quantityMessageId = quantityMessage.message_id;

        // Send the custom prompt and store its message ID
        const customPromptMessage = await ctx.reply('Or, type a custom number of entries.');
        ctx.session.customPromptMessageId = customPromptMessage.message_id;

        ctx.session.nextAction = 'prompt_quantity';

    } catch (error) {
        console.error('Error selecting pool:', error);
        ctx.reply('Could not retrieve pool information. Please try again.');
    }
});
bot.action(/^set_quantity:(\d+)/, async (ctx) => {
    ctx.answerCbQuery();
    const quantity = parseInt(ctx.match[1], 10);

    // Store quantity in session
    ctx.session.quantity = quantity;
    
    // Only clean up quantity-related messages, not pool-related ones
    await cleanupSessionMessages(ctx, [
            
        'gridMessageId',          // Add grid messages
        'randomGridMessageId' ,
        'assignmentMessageId'
        // Don't include customPromptMessageId here!
    ]);

    // Store the new quantity selection message ID
    ctx.session.quantitySelectionMessageId = ctx.callbackQuery.message.message_id;

    const assignmentMessage = await ctx.reply(
       `Great! You've chosen to buy *${quantity} entries*.\n\nHow would you like them assigned?`
,
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
    
    // Store new assignment message ID
    ctx.session.assignmentMessageId = assignmentMessage.message_id;
});
  
  bot.on('message', async (ctx) => {
  
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
        parse_mode: 'Markdown', // Add this line
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
    } else {
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
    "Please use /start to begin the lottery process:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Start Lottery", callback_data: "start_over" }],
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
