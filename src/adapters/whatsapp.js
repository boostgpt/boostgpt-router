import { BaseAdapter } from '../adapter.js';

export class WhatsAppAdapter extends BaseAdapter {
  constructor({ 
    allowedContacts = [],
    useLocalAuth = true,
    puppeteerArgs = ['--no-sandbox', '--disable-setuid-sandbox'],
    ...baseOptions 
  }) {
    super({ ...baseOptions, channelName: 'whatsapp' });

    this.allowedContacts = allowedContacts;
    this.useLocalAuth = useLocalAuth;
    this.puppeteerArgs = puppeteerArgs;
    // this.client is created in start(), once the SDK is loaded.
    this.client = null;
  }

  async start() {
    this.assertConfigured();

    const { Client: WhatsAppClient, LocalAuth } =
      await this.loadChannelModule('whatsapp-web.js');
    const { default: qrcode } = await this.loadChannelModule('qrcode-terminal');

    const clientConfig = {
      puppeteer: {
        args: this.puppeteerArgs
      }
    };

    if (this.useLocalAuth) {
      clientConfig.authStrategy = new LocalAuth();
    }

    this.client = new WhatsAppClient(clientConfig);

    return new Promise((resolve, reject) => {
      this.client.on('qr', (qr) => {
        this.logger?.info('QR Code received. Scan with your phone:');
        //console.log(qr);
        qrcode.generate(qr, { small: true });
      });

      this.client.on('authenticated', () => {
        this.logger?.info('Authenticated successfully');
      });

      this.client.on('ready', () => {
        this.logger?.logConnection('WhatsApp', 'connected');
        this.isStarted = true;
        resolve();
      });

      this.client.on('message', async (message) => {
        await this._handleWhatsAppMessage(message);
      });

      this.client.on('auth_failure', (error) => {
        this.logger?.error('Authentication failed:', error);
        reject(error);
      });

      this.client.initialize();
    });
  }

  async _handleWhatsAppMessage(message) {
    try {
      const chat = await message.getChat();
      
      if (this.allowedContacts.length > 0) {
        const contactId = chat.id.user;
        if (!this.allowedContacts.includes(contactId)) {
          return;
        }
      }

      await chat.sendStateTyping();

      const normalizedMessage = {
        content: message.body,
        userId: chat.id.user,
        userName: chat.name || chat.id.user,
        metadata: {
          chatId: chat.id._serialized,
          isGroup: chat.isGroup,
          messageId: message.id._serialized,
          timestamp: message.timestamp
        }
      };

      const reply = await this.handleMessage(normalizedMessage, {
        whatsappMessage: message,
        chat: chat,
        client: this.client
      });

      await chat.clearState();

      if (reply === null || reply === undefined || reply === '') {
        return;
      }

      await chat.sendMessage(reply);
    } catch (error) {
      this.logger?.error('Error handling message:', error);
      
      try {
        const chat = await message.getChat();
        await chat.clearState();
        await chat.sendMessage(this.errorMessage);
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
    await this.client.destroy();
    await super.stop();
    this.logger?.logConnection('WhatsApp', 'disconnected');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      allowedContacts: this.allowedContacts.length,
      hasAllowList: this.allowedContacts.length > 0
    };
  }
}