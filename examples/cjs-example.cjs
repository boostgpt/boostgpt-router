/**
 * CommonJS Example
 * Traditional require() syntax
 * 
 * This file uses .cjs extension to force CommonJS mode
 * even though package.json has "type": "module"
 */

require('dotenv').config();
const { Router, DiscordAdapter, TelegramAdapter } = require('@boostgpt/router');

const router = new Router({
  apiKey: process.env.BOOSTGPT_API_KEY,
  projectId: process.env.BOOSTGPT_PROJECT_ID,
  defaultBotId: process.env.BOOSTGPT_BOT_ID,
  adapters: [
    new DiscordAdapter({
      discordToken: process.env.DISCORD_TOKEN,
      replyInDMs: true,
      replyOnMention: true
    }),
    new TelegramAdapter({
      telegramToken: process.env.TELEGRAM_TOKEN,
      welcomeMessage: 'Hi {name}! 👋'
    })
  ]
});

// Custom message handler
router.onMessage(async (message, context) => {
  console.log(`[${context.channel}] ${message.userName}: ${message.content}`);
  
  // Handle commands
  if (message.content === '/ping') {
    return 'Pong! 🏓';
  }
  
  if (message.content === '/status') {
    const status = router.getStatus();
    return `Bot is running on ${status.adapters.length} channels!`;
  }
  
  // Let BoostGPT handle the rest
  return null;
});

// Error handler
router.onError(async (error, message, context) => {
  console.error(`[${context.channel}] Error:`, error);
  return 'Sorry, I encountered an error. Please try again!';
});

// Start the router
router.start()
  .then(() => {
    console.log('✓ Router started successfully');
    console.log('Status:', router.getStatus());
  })
  .catch(error => {
    console.error('Failed to start router:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  router.stop().then(() => process.exit(0));
});