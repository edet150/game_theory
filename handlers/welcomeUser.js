module.exports = (bot) => {

    bot.on("new_chat_members", async (ctx) => {
        try {
            const newMembers = ctx.message.new_chat_members;

            for (const member of newMembers) {
                const name = member.first_name || "there";

            const welcomeMessage =
  `👋 Hello *${name}*! Welcome to *Game Theory* 🎭  

Here’s how the game unfolds:  

📅 *Strategy Sessions (Draws):*  
Every **Saturday at 3:00 PM WAT**, one strategist (winner) is chosen.  

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
}
