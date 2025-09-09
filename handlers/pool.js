const { RafflePool, Entry } = require('../models');
const messageManager = require('../utils/messageManager');
const { sendError, sendSuccess } = require('../utils/responseUtils');
const { getbotInstance, getRedisClient } = require('../bot/botInstance');
const redis = getRedisClient();
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
      const isLocked = await redis.get('entries_locked');
    if (isLocked) {
        await ctx.answerCbQuery();
        return await ctx.reply('🔒 Plays are currently locked. Please try again later.');
    }
    await ctx.answerCbQuery();
    const poolName = ctx.match[1];

    // Store pool choice in session
    ctx.session.poolName = poolName;

    if (!poolName) {
        console.error('Arena name is undefined');
        return ctx.reply('Invalid pool selection. Please try again.');
    }

    try {
        // Find the pool using model
        const pool = await RafflePool.findOne({ where: { name: poolName } });
        if (!pool) {
            ctx.reply('Arena not found. Please try again.');
            return;
        }

        // Count number of paid entries using model
        const currentEntriesCount = await Entry.count({
            where: { pool_id: pool.id, status: 'paid' }
        });

        const options = {
            reply_markup: {
                inline_keyboard: [
            [{ text: '1 Play', callback_data: `set_quantity:1` }],
            [{ text: '5 Plays', callback_data: `set_quantity:5` }],
            [{ text: '10 Plays', callback_data: `set_quantity:10` }]

                ]
            }
        };

        // Send quantity selection message and store its ID
        const quantityMessage = await ctx.reply(
            `You've selected the ${pool.name} Pool!\n\n` +
            `**Price:** ₦${pool.price_per_entry} per entry\n` +
            `**Max Plays:** ${pool.max_entries}\n` +
            `**Current Plays:** ${currentEntriesCount}/${pool.max_entries}\n\n` +
            `How many plays would you like to purchase?`,
            { parse_mode: 'MarkdownV2', reply_markup: options.reply_markup }
        );

        ctx.session.quantityMessageId = quantityMessage.message_id;

        // Send the custom prompt and store its message ID
        const customPromptMessage = await ctx.reply('Or, type a custom number of plays.');
        ctx.session.customPromptMessageId = customPromptMessage.message_id;

        ctx.session.nextAction = 'prompt_quantity';

    } catch (error) {
        console.error('Error selecting Arena:', error);
        ctx.reply('Could not retrieve Arena information. Please try again.');
    }
});
bot.action(/^set_quantity:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
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
       `Great! You've chosen to buy *${quantity} plays*.\n\nHow would you like them assigned?`
,
      {
             parse_mode: 'MarkdownV2', 
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Random Pick', callback_data: 'assign_method:random' }],
                    [{ text: 'Choose Numbers', callback_data: 'assign_method:choose' }]
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
            ctx.reply('Please enter a valid number of plays.');
            return;
        }


        ctx.session.quantity = quantity;
        ctx.session.nextAction = null; // Clear the next action
        
        // Store the custom quantity message ID for deletion
        ctx.session.customQuantityMessageId = ctx.message.message_id;
const assignmentMessage = await ctx.reply(
    `Great! You've chosen to buy *${quantity} plays*.\n\nHow would you like them assigned?`,
    {
        parse_mode: 'MarkdownV2', // Add this line
        reply_markup: {
           
              inline_keyboard: [
                 { text: '🎲 Random Pick', callback_data: 'assign_method:random' },
                    { text: '📝 Manual Pick', callback_data: 'assign_method:choose' }
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
  "Please use /start to enter the game",
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
};
