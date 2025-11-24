import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { BaseAdapter } from '../adapter.js';

export class DiscordAdapter extends BaseAdapter {
  constructor({ 
    discordToken,
    discordBotId = null,
    replyInDMs = true,
    replyOnMention = true,
    ...baseOptions 
  }) {
    super({ ...baseOptions, channelName: 'discord' });

    if (!discordToken) {
      throw new Error('discordToken is required');
    }

    this.discordToken = discordToken;
    this.discordBotId = discordBotId;
    this.replyInDMs = replyInDMs;
    this.replyOnMention = replyOnMention;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [
        Partials.Channel,
        Partials.Message
      ]
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        this.logger?.logConnection('Discord', 'connected');
        this.isStarted = true;
        
        if (!this.discordBotId) {
          this.discordBotId = this.client.user.id;
        }
        
        resolve();
      });

      this.client.on('messageCreate', async (message) => {
        await this._handleDiscordMessage(message);
      });

      this.client.login(this.discordToken).catch(reject);
    });
  }

  async _handleDiscordMessage(message) {
    if (message.author.id === this.discordBotId || message.author.bot) {
      return;
    }

    if (!message.content) {
      return;
    }

    try {
      const channel = message.channel || message.author;

      if (channel.sendTyping) {
        channel.sendTyping();
      }

      const normalizedMessage = {
        content: message.content,
        userId: message.author.id,
        userName: message.author.username,
        metadata: {
          channelId: message.channelId,
          guildId: message.guildId,
          messageId: message.id,
          isMention: message.mentions.has(this.client.user),
          isDM: message.channel.type === 1
        }
      };

      const reply = await this.handleMessage(normalizedMessage, {
        discordMessage: message,
        client: this.client
      });

      if (message.mentions.has(this.client.user) && this.replyOnMention) {
        await message.reply(reply);
      } else if (this.replyInDMs) {
        try {
          await message.author.send(reply);
        } catch (error) {
          await message.channel.send(reply);
        }
      } else {
        await message.channel.send(reply);
      }
    } catch (error) {
      this.logger?.error('Error handling message:', error);
      
      try {
        await message.reply(this.errorMessage);
      } catch (sendError) {
        this.logger?.error('Failed to send error message:', sendError);
      }
    }
  }

  async sendMessage(userId, message) {
    try {
      const user = await this.client.users.fetch(userId);
      return await user.send(message);
    } catch (error) {
      this.logger?.error(`Failed to send message to user ${userId}:`, error);
      throw error;
    }
  }

  async stop() {
    await this.client.destroy();
    await super.stop();
    this.logger?.logConnection('Discord', 'disconnected');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      username: this.client.user?.tag,
      userId: this.discordBotId,
      guildCount: this.client.guilds.cache.size
    };
  }
}