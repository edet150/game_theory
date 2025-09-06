module.exports = (bot) => {

    bot.on("new_chat_members", async (ctx) => {
        try {
            const newMembers = ctx.message.new_chat_members;

            for (const member of newMembers) {
                const name = member.first_name || "there";

                const welcomeMessage =
                    `👋 Hello *${name}*! Welcome to our Lottery Group 🎉

Here’s how it works:

📅 *Draws:* We select one winner from each of our pools every **Saturday at 3:00 PM WAT**.

🎯 *Winner Selection Process:*
1️⃣ A winning number is generated from the *Bitcoin blockchain*.  
   - Specifically, we take the first Bitcoin block hash mined after **12:00 PM WAT** on draw day.  
   - You can verify this hash yourself on [btcscan.org](https://btcscan.org).  

2️⃣ If the winning number exactly matches an entry number, that entry wins.  
   If not, we apply the **modulo operator** (\`winning_number % total_entries\`) to guarantee that *a valid winner is always chosen*.  

✅ *Transparency:* This ensures the process is 100% fair, random, and publicly verifiable.  

Good luck 🍀, and we’re excited to have you join the game!`;

                await ctx.replyWithMarkdown(welcomeMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🤖 Chat with Bot / Get Started", url: "https://t.me/YourBotUsername" }
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
