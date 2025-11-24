import Crisp from 'crisp-api';
import { BaseAdapter } from '../adapter.js';

export class CrispAdapter extends BaseAdapter {
  constructor({ 
    crispIdentifier,
    crispKey,
    websiteId = null,
    onlyWhenOffline = true,
    ...baseOptions 
  }) {
    super({ ...baseOptions, channelName: 'crisp' });

    if (!crispIdentifier) {
      throw new Error('crispIdentifier is required');
    }
    if (!crispKey) {
      throw new Error('crispKey is required');
    }

    this.crispIdentifier = crispIdentifier;
    this.crispKey = crispKey;
    this.websiteId = websiteId;
    this.onlyWhenOffline = onlyWhenOffline;
    
    this.client = new Crisp();
    this.client.authenticateTier('plugin', crispIdentifier, crispKey);
  }

  async start() {
    this.logger?.info('Bot starting...');

    this.client.on('message:send', async (message) => {
      await this._handleCrispMessage(message);
    })
    .then(() => {
      this.logger?.logConnection('Crisp', 'connected');
      this.isStarted = true;
    })
    .catch((error) => {
      this.logger?.error('Failed to start listening:', error);
      throw error;
    });
  }

  async _handleCrispMessage(message) {
    if (!message.content || message.origin !== 'chat') {
      return;
    }

    if (this.onlyWhenOffline) {
      try {
        const availability = await this.client.website.getWebsiteAvailabilityStatus(
          message.website_id
        );
        
        if (availability.status === 'online') {
          return;
        }
      } catch (error) {
        this.logger?.error('Error checking availability:', error);
      }
    }

    try {
      const normalizedMessage = {
        content: message.content,
        userId: message.session_id,
        userName: message.from || 'User',
        metadata: {
          websiteId: message.website_id,
          sessionId: message.session_id,
          fingerprint: message.fingerprint
        }
      };

      const reply = await this.handleMessage(normalizedMessage, {
        crispMessage: message,
        client: this.client
      });

      await this._sendCrispMessage(message.website_id, message.session_id, reply);
    } catch (error) {
      this.logger?.error('Error handling message:', error);
      
      try {
        await this._sendCrispMessage(
          message.website_id, 
          message.session_id, 
          this.errorMessage
        );
      } catch (sendError) {
        this.logger?.error('Failed to send error message:', sendError);
      }
    }
  }

  async _sendCrispMessage(websiteId, sessionId, text) {
    return await this.client.website.sendMessageInConversation(
      websiteId,
      sessionId,
      {
        type: 'text',
        content: text,
        from: 'operator',
        origin: 'chat'
      }
    );
  }

  async sendMessage(recipient, message) {
    const [websiteId, sessionId] = recipient.split(':');
    
    if (!websiteId || !sessionId) {
      throw new Error('Recipient must be in format "websiteId:sessionId"');
    }

    try {
      return await this._sendCrispMessage(websiteId, sessionId, message);
    } catch (error) {
      this.logger?.error('Failed to send message:', error);
      throw error;
    }
  }

  async stop() {
    await super.stop();
    this.logger?.logConnection('Crisp', 'disconnected');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      identifier: this.crispIdentifier,
      onlyWhenOffline: this.onlyWhenOffline
    };
  }
}