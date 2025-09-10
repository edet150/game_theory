module.exports = (bot) => {
// Handle chat member updates (recommended by Telegram)
bot.on("chat_member", async (ctx) => {
    try {
        const chatMember = ctx.chatMember;
        
        // Check if this is a new member joining
        if (chatMember.old_chat_member.status === 'left' && 
            chatMember.new_chat_member.status === 'member') {
            
            const member = chatMember.new_chat_member.user;
            const name = member.first_name || "there";
            const chatId = ctx.chat.id;

            const welcomeMessage = 
                `👋 Hello *${name}*! Welcome to *Game Theory* 🎭  \n\n` +
                `Here's how the game unfolds:  \n\n` +
                `📅 *Strategy Sessions (Draws):*  \n` +
                `Every **sunday at 6:00 PM WAT**, one strategist (winner) is chosen.  \n\n` +
                `🎯 *Game Mechanics (Winner Selection):*  \n` +
                `1️⃣ The *Bitcoin blockchain* provides the "signal."  \n` +
                `   - Specifically, we take the first Bitcoin block hash mined after **12:00 PM WAT** on game day.  \n` +
                `   - The *last 4 digits* of this hash become the winning number.  \n` +
                `   - You can verify this publicly at [btcscan.org](https://btcscan.org).  \n\n` +
                `2️⃣ If a strategist's entry exactly matches the winning number, they win outright.  \n` +
                `   If not, we apply the **modulo operator** (\`winning_number % total_entries\`) — ensuring *a guaranteed winner always emerges*.  \n\n` +
                `✅ *Fair Play:*  \n` +
                `The process is 100% transparent, random, and cannot be manipulated.  \n\n` +
                `Good luck 🍀 — may your strategy pay off in *Game Theory*!`;

            await ctx.telegram.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🤖 Chat with Bot / Get Started", url: "https://t.me/trend_9ja_bot" }
                        ]
                    ]
                }
            });
        }
    } catch (error) {
        console.error("Error welcoming new member:", error);
    }
});
    bot.on("new_chat_members", async (ctx) =>
    {
        console.log('some new')
        try {
            const newMembers = ctx.message.new_chat_members;

            for (const member of newMembers) {
                const name = member.first_name || "there";

            const welcomeMessage =
  `👋 Hello *${name}*! Welcome to *Game Theory* 🎭  

Here’s how the game unfolds:  

📅 *Strategy Sessions (Draws):*  
Every **sunday at 6:00 PM WAT**, one strategist (winner) is chosen.  

🎯 *Game Mechanics (Winner Selection):*  
1️⃣ The *Bitcoin blockchain* provides the “signal.”  
   - Specifically, we take the first Bitcoin block hash mined after **12:00 PM WAT** on game day.  
   - The *last 4 digits* of this hash become the winning number.  
   - You can verify this publicly at [btcscan.org](https://btcscan.org).  

2️⃣ If a strategist’s entry exactly matches the winning number, they win outright.  
   If not, we apply the **modulo operator** (\`winning_number % total_entries\`) — ensuring *a guaranteed winner always emerges*.  

✅ *Fair Play:*  
The process is 100% transparent, random, and cannot be manipulated.  

Good luck 🍀 — may your strategy pay off in *Game Theory*!`;

                await ctx.replyWithMarkdown(welcomeMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🤖 Chat with Bot / Get Started", url: `https://t.me/${process.env.BOT_NAME}` }
                            ]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error("Error welcoming new member:", error);
        }
    });
}
