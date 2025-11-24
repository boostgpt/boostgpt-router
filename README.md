# @boostgpt/router

> **Omnichannel AI message router** - Deploy to Discord, Telegram, Slack, WhatsApp & Crisp with one codebase.

[![npm version](https://img.shields.io/npm/v/@boostgpt/router.svg)](https://www.npmjs.com/package/@boostgpt/router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why BoostGPT Router?

**Problem:** Building AI agents for multiple platforms means writing the same logic 5 times.

**Solution:** One codebase. Multiple channels. Intelligent routing.

## Features

✅ **5 channels in one package** - Discord, Telegram, Slack, WhatsApp, Crisp  
✅ **Native ES modules** - Clean `import` syntax  
✅ **CommonJS compatible** - Regular `require()` works too  
✅ **Multi-model support** - GPT-4, Claude, Gemini, Grok  
✅ **Production ready** - Error handling, logging, graceful shutdown  
✅ **Extensible** - Build custom adapters with BaseAdapter  

## Quick Start

### Installation

```bash
npm install @boostgpt/router boostgpt
```

### ES Module Example (Recommended)

```javascript
import { Router, DiscordAdapter, TelegramAdapter } from '@boostgpt/router';
import 'dotenv/config';

const router = new Router({
  apiKey: process.env.BOOSTGPT_API_KEY,
  projectId: process.env.BOOSTGPT_PROJECT_ID,
  defaultBotId: process.env.BOOSTGPT_BOT_ID,
  adapters: [
    new DiscordAdapter({ discordToken: process.env.DISCORD_TOKEN }),
    new TelegramAdapter({ telegramToken: process.env.TELEGRAM_TOKEN })
  ]
});

// One handler for ALL channels
router.onMessage(async (message, context) => {
  console.log(`[${context.channel}] ${message.userName}: ${message.content}`);
  return `Echo: ${message.content}`;
});

await router.start();
```

### CommonJS Example

```javascript
require('dotenv').config();
const { Router, DiscordAdapter } = require('@boostgpt/router');

const router = new Router({
  apiKey: process.env.BOOSTGPT_API_KEY,
  projectId: process.env.BOOSTGPT_PROJECT_ID,
  adapters: [new DiscordAdapter({ discordToken: process.env.DISCORD_TOKEN })]
});

router.onMessage(async (message) => {
  return `You said: ${message.content}`;
});

router.start();
```

**Both work perfectly!** The package automatically serves the right version.

## Module System Support

| Import Style | Syntax | Works? |
|--------------|--------|---------|
| **ES Module** | `import { Router } from '@boostgpt/router'` | ✅ Native |
| **CommonJS** | `const { Router } = require('@boostgpt/router')` | ✅ Native |

No hacks, no workarounds. Just clean, intuitive imports.

## Channel Setup

### Discord

```javascript
import { DiscordAdapter } from '@boostgpt/router';

new DiscordAdapter({
  discordToken: 'YOUR_BOT_TOKEN',
  botId: 'YOUR_BOOSTGPT_BOT_ID',
  replyInDMs: true,
  replyOnMention: true
})
```

### Telegram

```javascript
import { TelegramAdapter } from '@boostgpt/router';

new TelegramAdapter({
  telegramToken: 'YOUR_BOT_TOKEN',
  botId: 'YOUR_BOOSTGPT_BOT_ID',
  welcomeMessage: 'Hello {name}!'
})
```

### Slack

```javascript
import { SlackAdapter } from '@boostgpt/router';

new SlackAdapter({
  slackToken: 'xoxb-YOUR-TOKEN',
  slackSigningSecret: 'YOUR_SECRET',
  slackAppToken: 'xapp-YOUR-TOKEN', // Optional: for Socket Mode
  botId: 'YOUR_BOOSTGPT_BOT_ID'
})
```

### WhatsApp

```javascript
import { WhatsAppAdapter } from '@boostgpt/router';

new WhatsAppAdapter({
  botId: 'YOUR_BOOSTGPT_BOT_ID',
  allowedContacts: ['2349012345678'], // Optional whitelist
  useLocalAuth: true
})
```

### Crisp

```javascript
import { CrispAdapter } from '@boostgpt/router';

new CrispAdapter({
  crispIdentifier: 'YOUR_PLUGIN_ID',
  crispKey: 'YOUR_PLUGIN_KEY',
  botId: 'YOUR_BOOSTGPT_BOT_ID',
  onlyWhenOffline: true
})
```

## Advanced Usage

### Custom Message Handler

```javascript
router.onMessage(async (message, context) => {
  // Access channel info
  console.log(`Channel: ${context.channel}`);
  console.log(`User: ${message.userName}`);
  
  // Custom commands
  if (message.content === '/help') {
    return 'Available commands: /help, /status';
  }
  
  // Use BoostGPT for AI responses
  const response = await context.boostgpt.chat({
    bot_id: context.adapter.botId,
    message: message.content,
    chat_id: `${context.channel}-${message.userId}`
  });
  
  return response.response.chat.reply;
});
```

### Error Handling

```javascript
router.onError(async (error, message, context) => {
  console.error(`Error in ${context.channel}:`, error);
  return `Sorry ${message.userName}, something went wrong!`;
});
```

### Broadcast Messages

```javascript
// Send to all channels
await router.broadcast('Maintenance in 5 minutes!');

// Send to specific channels
await router.broadcast('Discord only!', ['discord']);
```

## API Reference

### Router

```javascript
new Router({
  apiKey: string,           // Required: BoostGPT API key
  projectId: string,        // Required: BoostGPT project ID
  adapters: Array,          // Array of adapter instances
  defaultBotId: string,     // Default bot ID for all adapters
  onError: Function,        // Global error handler
  enableLogging: boolean    // Enable console logging (default: true)
})
```

**Methods:**
- `onMessage(handler)` - Set custom message handler
- `onError(handler)` - Set custom error handler
- `start()` - Start all adapters
- `stop()` - Stop all adapters
- `getAdapter(channelName)` - Get specific adapter
- `sendMessage(channel, recipient, message)` - Send direct message
- `broadcast(message, channels?)` - Broadcast to channels
- `getStatus()` - Get router status

### Message Object

```javascript
{
  content: string,      // Message text
  userId: string,       // User identifier
  userName: string,     // User display name
  metadata: {           // Channel-specific data
    // varies by channel
  }
}
```

### Context Object

```javascript
{
  channel: string,      // Channel name
  adapter: BaseAdapter, // Adapter instance
  router: Router,       // Router instance
  boostgpt: BoostGPT   // BoostGPT instance
}
```

## Building Custom Adapters

```javascript
import { BaseAdapter } from '@boostgpt/router';

export class CustomAdapter extends BaseAdapter {
  constructor(options) {
    super({ ...options, channelName: 'custom' });
  }

  async start() {
    // Initialize your channel client
    this.isStarted = true;
  }

  async sendMessage(recipient, message) {
    // Send message via your channel
  }
}
```

## Environment Variables

Create a `.env` file:

```env
# BoostGPT
BOOSTGPT_API_KEY=your_api_key
BOOSTGPT_PROJECT_ID=your_project_id
BOOSTGPT_BOT_ID=your_bot_id

# Discord
DISCORD_TOKEN=your_discord_token

# Telegram
TELEGRAM_TOKEN=your_telegram_token

# Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your_secret
SLACK_APP_TOKEN=xapp-your-token

# WhatsApp
WHATSAPP_CONTACTS=2349012345678

# Crisp
CRISP_PLUGIN_IDENTIFIER=your_identifier
CRISP_PLUGIN_KEY=your_key
```

## Troubleshooting

### "Cannot find module"
Make sure you've installed dependencies:
```bash
npm install
```

### Discord bot not responding
- Enable `MESSAGE_CONTENT` intent in Discord Developer Portal
- Verify bot has permission to read/send messages

### WhatsApp QR code not showing
- Check console output for QR code
- Install `qrcode-terminal` for better display

## Package Structure

```
@boostgpt/router
├── src/              # ES module source (you import this)
├── dist/             # CommonJS bundle (created on build)
├── utils/            # Logger utility
└── examples/         # Usage examples
```

**How it works:**
- ES module users get `src/` (native)
- CommonJS users get `dist/index.cjs` (bundled)
- Node.js picks the right one automatically

## Support

- **Documentation:** [https://docs.boostgpt.co](https://docs.boostgpt.co)
- **Discord Community:** [https://discord.gg/KGhz5SnyXM](https://discord.gg/KGhz5SnyXM)
- **Issues:** [GitHub Issues](https://github.com/boostgpt/boostgpt-router/issues)
- **Email:** hello@boostgpt.co

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## License

MIT © [BoostGPT](https://boostgpt.co)

---

**Made with ❤️ by the BoostGPT team**

[Website](https://boostgpt.co) • [Documentation](https://docs.boostgpt.co) • [Blog](https://boostgpt.co/blog)