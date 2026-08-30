/**
 * BaseAdapter - Abstract class for all channel adapters
 */

import { Logger } from '../utils/logger.js';

const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    memory = null,
    reasoningMode = null,
    errorMessage = 'Sorry, I encountered an error processing your message.',
    channelName = 'unknown',
    enableLogging = true
  } = {}) {
    // boostgpt and botId are NOT required here. Adapters are constructed inside
    // the `adapters: [...]` array the Router receives, so the Router cannot
    // inject them until after every constructor has run. Throwing here made the
    // documented usage impossible; assertConfigured() checks at start() instead.
    this.boostgpt = boostgpt || null;
    this.botId = botId || null;
    this.model = model;
    this.sourceIds = sourceIds;
    this.tags = tags;
    this.top = top;
    this.maxReplyTokens = maxReplyTokens;
    this.providerKey = providerKey;
    this.memory = memory;
    // 'agent' runs BoostGPT's server-side tool loop; anything else is standard chat.
    this.reasoningMode = reasoningMode;
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
   * Throw unless this adapter has everything it needs to talk to BoostGPT.
   * Called by start() and before any message is processed.
   */
  assertConfigured() {
    const missing = [];
    if (!this.boostgpt) missing.push('boostgpt');
    if (!this.botId) missing.push('botId');

    if (missing.length > 0) {
      throw new Error(
        `${this.channelName} adapter is missing: ${missing.join(', ')}. ` +
        'Pass them to the adapter, or set apiKey/projectId/defaultBotId on the Router.'
      );
    }
  }

  /**
   * Load a channel SDK on demand.
   *
   * Channel SDKs are optional peer dependencies, so a consumer who only uses
   * Telegram never installs discord.js or whatsapp-web.js (the latter pulls
   * puppeteer, and with it a Chromium download). A top-level import would make
   * the whole package unloadable when one is absent, so each adapter imports
   * its SDK here, inside start().
   */
  async loadChannelModule(specifier) {
    try {
      const mod = await import(specifier);

      // These SDKs are CommonJS, and they reach ESM inconsistently: Node's
      // lexer detects some names (whatsapp-web.js `Client`) but not others
      // (`LocalAuth`, and @slack/bolt's `App`), which exist only on `default`.
      // Flatten both onto one object so adapters can destructure either way.
      const fromDefault =
        mod.default && typeof mod.default === 'object' ? mod.default : {};

      return { ...fromDefault, ...mod, default: mod.default };
    } catch (error) {
      throw new Error(
        `The ${this.channelName} adapter needs the "${specifier}" package. ` +
        `Install it with: npm install ${specifier}\n` +
        `(original error: ${error.message})`
      );
    }
  }

  /**
   * Process a message through BoostGPT
   */
  async processMessage(message, chatId, options = {}) {
    this.assertConfigured();

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
        stream: false
      };

      // Only send these when set: the SDK omits absent parameters entirely.
      const memory = options.memory ?? this.memory;
      if (memory !== null && memory !== undefined) payload.memory = memory;

      const reasoningMode = options.reasoningMode || this.reasoningMode;
      if (reasoningMode) payload.reasoning_mode = reasoningMode;

      let response;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          response = await this.boostgpt.chat(payload);
          break;
        } catch (error) {
          if (attempt === MAX_ATTEMPTS - 1) throw error;
          await sleep(1000 * Math.pow(2, attempt));
        }
      }

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
      const handled = await this.messageHandler(message, {
        ...context,
        channel: this.channelName,
        adapter: this
      });

      // A handler that returns null/undefined is declining this message, and
      // BoostGPT answers it instead. Returning the null straight through would
      // have the adapter send an empty reply.
      if (handled !== null && handled !== undefined) {
        return handled;
      }
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