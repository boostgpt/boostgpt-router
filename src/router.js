import { BoostGPT } from 'boostgpt';
import { Logger } from '../utils/logger.js';

export class Router {
  constructor({ 
    apiKey,
    projectId,
    adapters = [],
    defaultBotId = null,
    onError = null,
    enableLogging = true
  }) {
    if (!apiKey) {
      throw new Error('apiKey is required');
    }
    if (!projectId) {
      throw new Error('projectId is required');
    }

    this.boostgpt = new BoostGPT({
      key: apiKey,
      project_id: projectId
    });

    this.adapters = adapters;
    this.defaultBotId = defaultBotId;
    this.messageHandler = null;
    this.errorHandler = onError;
    this.isStarted = false;
    
    this.logger = enableLogging 
      ? new Logger('Router', { enableFileLogging: false })
      : null;

    // Inject BoostGPT instance into adapters
    this.adapters.forEach(adapter => {
      if (!adapter.boostgpt) {
        adapter.boostgpt = this.boostgpt;
      }
      if (!adapter.botId && this.defaultBotId) {
        adapter.botId = this.defaultBotId;
      }
    });
  }

  onMessage(handler) {
    this.messageHandler = handler;
    
    this.adapters.forEach(adapter => {
      adapter.setMessageHandler(async (message, context) => {
        try {
          return await handler(message, {
            ...context,
            router: this,
            boostgpt: this.boostgpt
          });
        } catch (error) {
          if (this.errorHandler) {
            return await this.errorHandler(error, message, context);
          }
          throw error;
        }
      });
    });

    return this;
  }

  onError(handler) {
    this.errorHandler = handler;
    return this;
  }

  async start() {
    if (this.isStarted) {
      this.logger?.warn('Already started');
      return;
    }

    this.logger?.info(`Starting ${this.adapters.length} adapters...`);

    try {
      await Promise.all(
        this.adapters.map(async (adapter) => {
          try {
            await adapter.start();
            this.logger?.info(`✓ ${adapter.channelName} adapter started`);
          } catch (error) {
            this.logger?.error(`✗ ${adapter.channelName} adapter failed to start:`, error);
            throw error;
          }
        })
      );

      this.isStarted = true;
      this.logger?.info('All adapters started successfully');
    } catch (error) {
      this.logger?.error('Failed to start all adapters:', error);
      throw error;
    }
  }

  async stop() {
    this.logger?.info('Stopping all adapters...');

    await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          if (adapter.stop) {
            await adapter.stop();
          }
          this.logger?.info(`✓ ${adapter.channelName} adapter stopped`);
        } catch (error) {
          this.logger?.error(`Error stopping ${adapter.channelName}:`, error);
        }
      })
    );

    this.isStarted = false;
    this.logger?.info('All adapters stopped');
  }

  getAdapter(channelName) {
    return this.adapters.find(a => a.channelName === channelName) || null;
  }

  async sendMessage(channelName, recipient, message) {
    const adapter = this.getAdapter(channelName);
    
    if (!adapter) {
      throw new Error(`Adapter for channel "${channelName}" not found`);
    }

    return await adapter.sendMessage(recipient, message);
  }

  async broadcast(message, channels = []) {
    const targetAdapters = channels.length > 0
      ? this.adapters.filter(a => channels.includes(a.channelName))
      : this.adapters;

    const results = await Promise.allSettled(
      targetAdapters.map(async (adapter) => {
        try {
          if (adapter.broadcast) {
            await adapter.broadcast(message);
            return { channel: adapter.channelName, success: true };
          } else {
            return { 
              channel: adapter.channelName, 
              success: false, 
              reason: 'broadcast not supported' 
            };
          }
        } catch (error) {
          return { 
            channel: adapter.channelName, 
            success: false, 
            error: error.message 
          };
        }
      })
    );

    return results.map(r => r.value || r.reason);
  }

  getStatus() {
    return {
      isStarted: this.isStarted,
      adapters: this.adapters.map(a => a.getStatus()),
      projectId: this.boostgpt.body.project_id,
      defaultBotId: this.defaultBotId
    };
  }

  addAdapter(adapter) {
    if (!adapter.boostgpt) {
      adapter.boostgpt = this.boostgpt;
    }
    if (!adapter.botId && this.defaultBotId) {
      adapter.botId = this.defaultBotId;
    }

    if (this.messageHandler) {
      adapter.setMessageHandler(this.messageHandler);
    }

    this.adapters.push(adapter);
    
    if (this.isStarted) {
      return adapter.start();
    }
  }

  async removeAdapter(channelName) {
    const index = this.adapters.findIndex(a => a.channelName === channelName);
    
    if (index === -1) {
      throw new Error(`Adapter for channel "${channelName}" not found`);
    }

    const adapter = this.adapters[index];
    
    if (adapter.stop) {
      await adapter.stop();
    }

    this.adapters.splice(index, 1);
  }
}