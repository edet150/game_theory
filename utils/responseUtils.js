// utils/responseUtils.js
const messageManager = require('./messageManager');

async function sendTemporaryMessage(ctx, text, duration = 5000) {
    const message = await messageManager.sendAndTrack(ctx, text);
    
    // Auto-delete after duration
    setTimeout(async () => {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
            messageManager.messageIds.delete(message.message_id);
        } catch (error) {
            console.log('Could not auto-delete message:', error.message);
        }
    }, duration);
    
    return message;
}

async function sendError(ctx, errorMessage, duration = 5000) {
    return sendTemporaryMessage(ctx, `⚠️ ${errorMessage}`, duration);
}

async function sendSuccess(ctx, successMessage, duration = 3000) {
    return sendTemporaryMessage(ctx, `✅ ${successMessage}`, duration);
}

module.exports = {
    sendTemporaryMessage,
    sendError,
    sendSuccess
};