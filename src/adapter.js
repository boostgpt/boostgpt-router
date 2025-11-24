/**
 * BaseAdapter - Abstract class for all channel adapters
 */

import { Logger } from '../utils/logger.js';

export class BaseAdapter {
  constructor({ 
    boostgpt, 
    botId, 
    model = null, 
    sourceIds = [], 
    tags = [], 
    top = null,
    maxReplyTokens = null,
    providerKey = null,
    errorMessage = 'Sorry, I encountered an error processing your message.',
    channelName = 'unknown',
    enableLogging = true
  }) {
    if (!boostgpt) {
      throw new Error('BoostGPT instance is required');
    }
    if (!botId) {
      throw new Error('botId is required');
    }

    this.boostgpt = boostgpt;
    this.botId = botId;
    this.model = model;
    this.sourceIds = sourceIds;
    this.tags = tags;
    this.top = top;
    this.maxReplyTokens = maxReplyTokens;
    this.providerKey = providerKey;
    this.errorMessage = errorMessage;
    this.channelName = channelName;
    this.messageHandler = null;
    this.isStarted = false;
    
    // Setup logger
    this.logger = enableLogging 
      ? new Logger(channelName, { enableFileLogging: false })
      : null;
  }

  /**
   * Process a message through BoostGPT
   */
  async processMessage(message, chatId, options = {}) {
    try {
      const payload = {
        bot_id: this.botId,
        model: options.model || this.model,
        provider_key: options.providerKey || this.providerKey,
        message: message,
        source_ids: options.sourceIds || this.sourceIds,
        tags: options.tags || this.tags,
        top: options.top || this.top,
        max_reply_tokens: options.maxReplyTokens || this.maxReplyTokens,
        chat_id: chatId,
        channel: this.channelName,
        stream: false,
        vector: true
      };

      let attempts = 0;
      let response;
      while (attempts < 3) {
        try {
          response = await this.boostgpt.chat(payload);
        } catch (error) {
          if (attempts === 2) throw error;
          await sleep(1000 * Math.pow(2, attempts));
          attempts++;
        }
      }
      //const response = await this.boostgpt.chat(payload);
      
      if (response.err) {
        this.logger?.error('BoostGPT Error:', response.err);
        throw response.err;
      }
      
      if (response.response && response.response.chat) {
        return response.response.chat.reply;
      }

      throw new Error('No response from BoostGPT');
    } catch (error) {
      this.logger?.error('Error processing message:', error);
      throw error;
    }
  }

  /**
   * Set a custom message handler
   */
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  /**
   * Handle an incoming message
   */
  async handleMessage(message, context = {}) {
    if (this.messageHandler) {
      return await this.messageHandler(message, {
        ...context,
        channel: this.channelName,
        adapter: this
      });
    }

    // Default: process through BoostGPT
    const chatId = `${this.channelName}-${message.userId}`;
    return await this.processMessage(message.content, chatId);
  }

  /**
   * Start the adapter (must be implemented by child classes)
   */
  async start() {
    throw new Error('start() must be implemented by child class');
  }

  /**
   * Stop the adapter
   */
  async stop() {
    this.isStarted = false;
    this.logger?.info('Adapter stopped');
  }

  /**
   * Send a message to a specific recipient
   */
  async sendMessage(recipient, message) {
    throw new Error('sendMessage() must be implemented by child class');
  }

  /**
   * Get adapter status
   */
  getStatus() {
    return {
      channel: this.channelName,
      isStarted: this.isStarted,
      botId: this.botId,
      model: this.model
    };
  }
}