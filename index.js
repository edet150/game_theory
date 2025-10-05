require('dotenv').config();
const db = require('./models');
const express = require("express");
const axios = require("axios");

// Handlers
const startHandler = require('./handlers/start');
const poolHandler = require('./handlers/pool');
const numbersHandler = require('./handlers/numbers');
const paymentFunctions = require('./handlers/payment');
const myEntriesHandler = require('./handlers/my_entries');
const cleanupMiddleware = require('./middleware/cleanupMiddleware');
const historyHandler = require('./handlers/history');
const adminHandler = require('./handlers/admin');
const welcomeUser = require('./handlers/welcomeUser');
const referralHandler = require('./handlers/referral');
const callbackHandler = require('./handlers/callback');
const accountHandler = require('./handlers/accounts');
const messageHandler = require('./handlers/message');
const giveawayHandler = require('./handlers/giveaway');
const partnerHandler = require('./handlers/partner');
const giveawayAdminHandler = require('./handlers/giveawayAdmin');
require('./cron/paystack_checker');
require('./cron/sundayCron'); 
const { getbotInstance, getRedisClient } = require('./bot/botInstance.js');
// const { getbotInstance2, getRedisClient2 } = require('./bot/botInstance2.js');
const { getLast4Digits, showStartScreen } = require('./startFunction');
const { checkPaystackTransactions, clearRedis } = require('./cron/paystack_checker');
const { Telegraf } = require('telegraf');


// Bot 2
const { createBot } = require('./bot/botfactory.js');
const { bot: bot2 } = createBot(process.env.TELEGRAM_BOT_TOKEN2);
bot2.launch();

const { bot: partnerBot } = createBot(process.env.TELEGRAM_PARTNER_Bot);
partnerBot.launch();

const bot = getbotInstance();
const redis = getRedisClient();


//WIN  // Start command for bot2
// bot.on("message", (ctx) => {
//   console.log("Chat ID:", ctx.chat.id);
//   console.log("Chat:", ctx.chat);
//   speak(ctx)
// });
// async function speak(ctx) {
//   const text =
//     `🎉New Giveaway Entry!` +
//     `🍀 More seats available – <a href="https://t.me/${ctx.botInfo.username}">join now</a>!`;
//   await ctx.telegram.sendMessage('@modulo_giveaway', text, {
//     parse_mode: "HTML"
//   });
// }
  
setTimeout(function () {
  giveawayHandler(bot2);
  giveawayAdminHandler(bot2);
  partnerHandler(partnerBot);
}, 3000)
// Register handlers
  const bankSetupState = new Map();
setTimeout(function () {
  messageHandler(bot, bankSetupState);
}, 3000)
startHandler(bot);
accountHandler(bot, bankSetupState);
adminHandler(bot, bankSetupState);
welcomeUser(bot);
callbackHandler(bot);

referralHandler(bot);
poolHandler(bot);
numbersHandler(bot);
myEntriesHandler(bot);
historyHandler(bot);

// Register handlers for bot2 (Giveaway Bot)


bot.use(cleanupMiddleware);





// bot.use(cleanupMiddleware);


// bot2.use((ctx, next) => {
//   console.log('sippiose')
//   console.log(ctx)
//   console.log("Update type:", ctx.updateType, ctx.update);
//   return next();
// });

bot.action('initiate_payment', async (ctx) => {
  await ctx.answerCbQuery();
  const method = ctx.match[1];
  ctx.session.assignmentMethod = method;
  await paymentFunctions.initiatePayment(ctx);
});

bot.catch((err, ctx) => {
    console.error(`Encountered a Telegram Error for ${ctx.from.id}:`, err);
    console.log(err);

    if (err.response && err.response.error_code === 400 && err.response.description.includes('query is too old')) {
        console.log('Detected an old query error. Prompting user to restart.');

        // Clear the user's session state
        ctx.session = null;

        // Inform the user with a button to restart
        ctx.reply(
            `⚠️ It looks like our conversation timed out. Please start again.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Start Over", callback_data: "start_over" }]
                    ]
                }
            }
        ).catch(e => console.error('Failed to send restart message:', e));
    } else {
        // Use the start_over action instead of direct function call
        // This ensures proper session cleanup
        try {
            // Clear session to prevent state conflicts
            ctx.session = {};
            
            ctx.reply(
                '❌ An unexpected error occurred. Starting over...',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔄 Start Over", callback_data: "start_over" }]
                        ]
                    }
                }
            );
        } catch (error) {
            // Fallback if even this fails
            console.error('Error in error handler:', error);
            ctx.reply('❌ An error occurred. Please use /start to begin again.');
        }
    }
});
bot2.catch((err, ctx) => {
    console.error(`Encountered a Telegram Error for ${ctx.from.id}:`, err);
    console.log(err);

    if (err.response && err.response.error_code === 400 && err.response.description.includes('query is too old')) {
        console.log('Detected an old query error. Prompting user to restart.');

        // Clear the user's session state
        ctx.session = null;

        // Inform the user with a button to restart
        ctx.reply(
            `⚠️ It looks like our conversation timed out. Please start again.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Start Over", callback_data: "start_over" }]
                    ]
                }
            }
        ).catch(e => console.error('Failed to send restart message:', e));
    } else {
        // Use the start_over action instead of direct function call
        // This ensures proper session cleanup
        try {
            // Clear session to prevent state conflicts
            ctx.session = {};
            
            ctx.reply(
                '❌ An unexpected error occurred. Starting over...',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔄 Start Over", callback_data: "start_over" }]
                        ]
                    }
                }
            );
        } catch (error) {
            // Fallback if even this fails
            console.error('Error in error handler:', error);
            ctx.reply('❌ An error occurred. Please use /start to begin again.');
        }
    }
});

// Handlers
// bot.start();

// bot2.start((ctx) => {
//   console.log("✅ Giveaway bot2 start triggered");
//   ctx.reply("Hello from giveaway bot2 🎁");
// });

// ---- Express app ----
const app = express();
const PORT = process.env.PORT || 3000;

// Payment redirect route
app.get("/paymentredirect", (req, res) => {
  checkPaystackTransactions()
return res.send(`
  <!DOCTYPE html>
  <html>
    <head>
      <title>Redirecting to Telegram...</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 40px 20px;
          margin: 0;
          background-color: #f9f9f9;
        }

        h2 {
          color: #28a745;
          font-size: 24px;
        }

        p {
          font-size: 16px;
          color: #333;
        }

        a {
          padding: 12px 24px;
          background: #0088cc;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          display: inline-block;
          margin-top: 24px;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <h2>✅ Payment Complete</h2>
      <p>Kindly close the browser session to return to your bot</p>

      <a href="https://t.me/${process.env.CHANNEL_NAME}">
        🚀 Open Telegram Channel
      </a>

      <script>
        setTimeout(() => {
          window.location.href = "https://t.me/${process.env.BOT_NAME}";
        }, 6000);
      </script>
    </body>
  </html>
`);

});
app.get("/flush", async (req, res) => { 
  try {
    await clearRedis(true); // true = flush all DBs
    res.send("✅ All Redis databases cleared!");
  } catch (error) {
    console.error("❌ Error clearing Redis:", error);
    res.status(500).send("❌ Failed to clear Redis");
  }
});



// Start express server
app.listen(PORT, () => {
  console.log(`🌍 Web server running at http://localhost:${PORT}`);
});


// Graceful shutdown
process.once('SIGINT', () => {
  redis.quit();
  bot.stop('SIGINT');
  bot2.stop('SIGINT');
});
process.once('SIGTERM', () => {
  redis.quit();
  bot.stop('SIGTERM');
  bot2.stop('SIGTERM');
});

// Launch bot
// Launch bots
(async () => {
  try {
    await db.sequelize.sync();
    console.log("✅ Database synchronized");

    await redis.ping();
    console.log("✅ Redis connected");

    await bot.launch();
    console.log("🚀 Bot 1 is running...");


    await bot2.launch();

    console.log("🎉 Giveaway Bot (Bot 2) is running...");
  } catch (err) {
    console.error("❌ Error starting bots:", err);
    process.exit(1);
  }
})();
