import { App } from '@slack/bolt';
import { BaseAdapter } from '../adapter.js';

export class SlackAdapter extends BaseAdapter {
  constructor({ 
    slackToken,
    slackSigningSecret,
    slackAppToken = null,
    port = 3000,
    ...baseOptions 
  }) {
    super({ ...baseOptions, channelName: 'slack' });

    if (!slackToken) {
      throw new Error('slackToken is required');
    }
    if (!slackSigningSecret) {
      throw new Error('slackSigningSecret is required');
    }

    this.slackToken = slackToken;
    this.slackSigningSecret = slackSigningSecret;
    this.port = port;

    const appConfig = {
      token: slackToken,
      signingSecret: slackSigningSecret
    };

    if (slackAppToken) {
      appConfig.socketMode = true;
      appConfig.appToken = slackAppToken;
    } else {
      appConfig.port = port;
    }

    this.client = new App(appConfig);
  }

  async start() {
    this.client.message(async ({ message, say }) => {
      await this._handleSlackMessage(message, say);
    });

    await this.client.start();
    
    this.logger?.logConnection('Slack', 'connected');
    this.isStarted = true;
  }

  async _handleSlackMessage(message, say) {
    if (message.subtype || message.bot_id) {
      return;
    }

    if (!message.text) {
      return;
    }

    try {
      const normalizedMessage = {
        content: message.text,
        userId: message.user,
        userName: message.username || message.user,
        metadata: {
          channel: message.channel,
          threadTs: message.thread_ts,
          ts: message.ts,
          channelType: message.channel_type
        }
      };

      const reply = await this.handleMessage(normalizedMessage, {
        slackMessage: message,
        say: say,
        client: this.client
      });

      const responseOptions = {
        text: reply
      };

      if (message.thread_ts) {
        responseOptions.thread_ts = message.thread_ts;
      }

      await say(responseOptions);
    } catch (error) {
      this.logger?.error('Error handling message:', error);
      
      try {
        await say({
          text: this.errorMessage,
          thread_ts: message.thread_ts
        });
      } catch (sendError) {
        this.logger?.error('Failed to send error message:', sendError);
      }
    }
  }

  async sendMessage(channel, message) {
    try {
      return await this.client.client.chat.postMessage({
        channel: channel,
        text: message
      });
    } catch (error) {
      this.logger?.error(`Failed to send message to channel ${channel}:`, error);
      throw error;
    }
  }

  async stop() {
    await this.client.stop();
    await super.stop();
    this.logger?.logConnection('Slack', 'disconnected');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      port: this.port
    };
  }
}