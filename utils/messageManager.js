// utils/messageManager.js
class MessageManager {
    constructor() {
        this.messageIds = new Set();
    }

    // Store message ID for future deletion
    trackMessage(messageId) {
        if (messageId) {
            this.messageIds.add(messageId);
        }
        return messageId;
    }

    // ✅ For ctx.reply
    async sendAndTrack(ctx, text, options = {}) {
        try {
            const message = await ctx.reply(text, options);
            this.trackMessage(message.message_id);
            return message;
        } catch (error) {
            console.error('Error sending message via ctx.reply:', error);
            return null;
        }
    }

    // ✅ For bot.telegram.sendMessage
    async sendAndTrackByBot(bot, chatId, text, options = {}) {
        try {
            const message = await bot.telegram.sendMessage(chatId, text, options);
            this.trackMessage(message.message_id);
            return message;
        } catch (error) {
            console.error('Error sending message via bot.telegram.sendMessage:', error);
            return null;
        }
    }

    // Delete all tracked messages
    async cleanupAllMessages(ctx) {
        const deletions = [];
        
        for (const messageId of this.messageIds) {
            try {
                deletions.push(ctx.telegram.deleteMessage(ctx.chat.id, messageId));
            } catch (error) {
                console.log('Could not delete message:', error.message);
            }
        }
        
        await Promise.all(deletions);
        this.messageIds.clear();
    }

    // Delete specific messages
    async cleanupMessages(ctx, messageIds) {
        const deletions = messageIds.map(messageId => {
            try {
                return ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
                console.log('Could not delete message:', error.message);
                return Promise.resolve();
            }
        });
        
        await Promise.all(deletions);
        
        // Remove from tracking
        messageIds.forEach(id => this.messageIds.delete(id));
    }
}

module.exports = new MessageManager();
