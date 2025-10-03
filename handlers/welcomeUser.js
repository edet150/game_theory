module.exports = (bot) => {
// Handle chat member updates (recommended by Telegram)
bot.on("chat_member", async (ctx) => {
 try {
    await ctx.answerCbQuery();

    const imagePath = "./images/block.jpg"; // make sure this path is correct

    await ctx.replyWithPhoto(
      { source: imagePath },
      {
        caption:
          '🎭 <b>The Rules of the Game</b>\n\n' +
          '📅 Every Sunday at <b>6:00 PM WAT</b>, we select <b>one strategist (winner)</b> from the pool.\n\n' +
          '1️⃣ <b>Winning Number</b>: The last 4 digits of the first Bitcoin block hash mined after 6:00 PM.\n\n' +
          '2️⃣ <b>Exact Match</b>: Exact 4 digits = instant win.\n\n' +
          '3️⃣ <b>Inverse Match</b>: If no exact match, reversed digits can win.\n\n' +
          '4️⃣ <b>Modulo Fallback</b>: If still no winner, we do (winning_number % total_entries). The remainder is the winning seat number.\n\n' +
          '🪑 <b>Seat = Position</b>: Each entry = a seat. If remainder = 93, seat 93 wins.\n\n' +
          '💡 <b>Strategy Tip</b>: Spread entries across positions for better chances.\n\n' +
          '✅ <b>Transparency</b>: Anyone can verify the winning number at btcscan.org.\n',
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🤖 Chat with Bot / Get Started", url: `https://t.me/${process.env.BOT_NAME}` }
            ],
            [
              { text: "🔙 Back", callback_data: "start_over" }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error("Error in how_it_works action:", error);
  }
});
    
    
    
    bot.on("new_chat_members", async (ctx) =>
    {
        try {
            await ctx.answerCbQuery();

            const imagePath = "./images/block.jpg"; // make sure this path is correct

            await ctx.replyWithPhoto(
                { source: imagePath },
                {
                    caption:
                        '🎭 <b>The Rules of the Game</b>\n\n' +
                        '📅 Every Sunday at <b>6:00 PM WAT</b>, we select <b>one strategist (winner)</b> from the pool.\n\n' +
                        '1️⃣ <b>Winning Number</b>: The last 4 digits of the first Bitcoin block hash mined after 6:00 PM.\n\n' +
                        '2️⃣ <b>Exact Match</b>: Exact 4 digits = instant win.\n\n' +
                        '3️⃣ <b>Inverse Match</b>: If no exact match, reversed digits can win.\n\n' +
                        '4️⃣ <b>Modulo Fallback</b>: If still no winner, we do (winning_number % total_entries). The remainder is the winning seat number.\n\n' +
                        '🪑 <b>Seat = Position</b>: Each entry = a seat. If remainder = 93, seat 93 wins.\n\n' +
                        '💡 <b>Strategy Tip</b>: Spread entries across positions for better chances.\n\n' +
                        '✅ <b>Transparency</b>: Anyone can verify the winning number at btcscan.org.\n',
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🤖 Chat with Bot / Get Started", url: `https://t.me/${process.env.BOT_NAME}` }
                            ],
                            [
                                { text: "🔙 Back", callback_data: "start_over" }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error("Error in how_it_works action:", error);
        }
    });
}
