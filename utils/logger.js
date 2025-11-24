/**
 * Logger Utility
 * Provides structured logging with colored output and file transports
 */
 
import fs from 'fs';
import path from 'path';
import { format } from 'util';
import { red, yellow, blue, gray, cyan } from 'colorette';

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LEVEL_COLORS = {
  ERROR: red,
  WARN: yellow,
  INFO: blue,
  DEBUG: gray
};

const LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG'
};

export class Logger {
  constructor(component = 'App', options = {}) {
    this.component = component;
    this.level = LOG_LEVELS.INFO;
    this.startTime = Date.now();
    this.fileTransports = options.fileTransports || [];
    this.logDir = options.logDir || './logs';
    this.enableFileLogging = options.enableFileLogging !== false;
    
    if (this.enableFileLogging) {
      this.ensureLogDirectory();
      if (this.fileTransports.length === 0) {
        this.setupDefaultFileTransports();
      }
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  setupDefaultFileTransports() {
    this.fileTransports = [
      {
        filename: path.join(this.logDir, 'error.log'),
        level: LOG_LEVELS.ERROR,
        format: 'json'
      },
      {
        filename: path.join(this.logDir, 'combined.log'),
        level: LOG_LEVELS.DEBUG,
        format: 'json'
      }
    ];
  }

  setLevel(level) {
    if (typeof level === 'string') {
      const upperLevel = level.toUpperCase();
      if (upperLevel in LOG_LEVELS) {
        this.level = LOG_LEVELS[upperLevel];
      }
    } else if (typeof level === 'number') {
      this.level = level;
    }
  }

  error(...args) {
    this.log(LOG_LEVELS.ERROR, ...args);
  }

  warn(...args) {
    this.log(LOG_LEVELS.WARN, ...args);
  }

  info(...args) {
    this.log(LOG_LEVELS.INFO, ...args);
  }

  debug(...args) {
    this.log(LOG_LEVELS.DEBUG, ...args);
  }

  log(level, ...args) {
    if (level > this.level) return;

    const timestamp = this.getTimestamp();
    const isoTimestamp = new Date().toISOString();
    const levelName = LEVEL_NAMES[level];
    const colorFn = LEVEL_COLORS[levelName];
    
    const message = args.length === 1 && typeof args[0] === 'string' 
      ? args[0] 
      : format(...args);

    const consoleLogEntry = `${gray(timestamp)} ${colorFn(levelName.padEnd(5))} ${cyan(`[${this.component}]`)} ${message}`;

    console.error(consoleLogEntry);

    if (this.enableFileLogging) {
      const structuredLogEntry = {
        timestamp: isoTimestamp,
        level: levelName,
        component: this.component,
        message: message,
        pid: process.pid
      };

      if (level === LOG_LEVELS.ERROR && args.length > 0) {
        const lastArg = args[args.length - 1];
        if (lastArg instanceof Error) {
          structuredLogEntry.error = {
            name: lastArg.name,
            message: lastArg.message,
            stack: lastArg.stack
          };
          console.error(gray(lastArg.stack));
        }
      }

      this.writeToFileTransports(level, structuredLogEntry);
    }
  }

  writeToFileTransports(level, logEntry) {
    this.fileTransports.forEach(transport => {
      if (level <= transport.level) {
        try {
          const logLine = transport.format === 'json' 
            ? JSON.stringify(logEntry) + '\n'
            : `${logEntry.timestamp} ${logEntry.level.padEnd(5)} [${logEntry.component}] ${logEntry.message}\n`;
          
          fs.appendFileSync(transport.filename, logLine, 'utf8');
        } catch (error) {
          console.error(`Failed to write to log file ${transport.filename}:`, error.message);
        }
      }
    });
  }

  getTimestamp() {
    const now = new Date();
    const elapsed = now.getTime() - this.startTime;
    return `${now.toISOString().substring(11, 23)} (+${elapsed}ms)`;
  }

  createChild(childComponent) {
    const child = new Logger(`${this.component}:${childComponent}`, {
      fileTransports: this.fileTransports,
      logDir: this.logDir,
      enableFileLogging: false
    });
    child.setLevel(this.level);
    child.startTime = this.startTime;
    return child;
  }

  logConnection(type, status) {
    const icons = {
      connected: '🔗',
      disconnected: '🔌',
      error: '❌',
      reconnecting: '🔄'
    };
    const icon = icons[status] || '📡';
    this.info(`${icon} ${type} connection ${status}`);
  }
}