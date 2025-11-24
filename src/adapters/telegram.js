import TelegramBot from 'node-telegram-bot-api';
import { BaseAdapter } from '../adapter.js';

export class TelegramAdapter extends BaseAdapter {
  constructor({ 
    telegramToken,
    welcomeMessage = 'Hello! How can I help you today?',
    ...baseOptions 
  }) {
    super({ ...baseOptions, channelName: 'telegram' });

    if (!telegramToken) {
      throw new Error('telegramToken is required');
    }

    this.telegramToken = telegramToken;
    this.welcomeMessage = welcomeMessage;
    this.client = new TelegramBot(telegramToken, { polling: true });
  }

  async start() {
    this.logger?.info('Bot starting...');
    
    this.client.on('message', async (message) => {
      await this._handleTelegramMessage(message);
    });

    const botInfo = await this.client.getMe();
    this.logger?.logConnection('Telegram', 'connected');
    this.botUsername = botInfo.username;
    this.botId = botInfo.id;
    this.isStarted = true;
  }

  async _handleTelegramMessage(message) {
    if (message.from.is_bot) {
      return;
    }

    if (!message.text) {
      return;
    }

    const chatId = message.chat.id;

    try {
      await this.client.sendChatAction(chatId, 'typing');

      if (message.text === '/start') {
        const greeting = this.welcomeMessage.replace('{name}', message.from.first_name);
        await this.client.sendMessage(chatId, greeting);
        return;
      }

      const normalizedMessage = {
        content: message.text,
        userId: message.from.id.toString(),
        userName: message.from.username || message.from.first_name,
        metadata: {
          chatId: chatId,
          messageId: message.message_id,
          firstName: message.from.first_name,
          lastName: message.from.last_name,
          chatType: message.chat.type
        }
      };

      const reply = await this.handleMessage(normalizedMessage, {
        telegramMessage: message,
        client: this.client
      });

      await this.client.sendMessage(chatId, reply);
    } catch (error) {
      this.logger?.error('Error handling message:', error);
      
      try {
        await this.client.sendMessage(chatId, this.errorMessage);
      } catch (sendError) {
        this.logger?.error('Failed to send error message:', sendError);
      }
    }
  }

  async sendMessage(chatId, message) {
    try {
      return await this.client.sendMessage(chatId, message);
    } catch (error) {
      this.logger?.error(`Failed to send message to chat ${chatId}:`, error);
      throw error;
    }
  }

  async stop() {
    await this.client.stopPolling();
    await super.stop();
    this.logger?.logConnection('Telegram', 'disconnected');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      username: this.botUsername,
      botId: this.botId
    };
  }
}