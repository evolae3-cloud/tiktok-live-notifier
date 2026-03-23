import express, { Request, Response } from 'express';

/**
 * TikTok live connector expects the profile "uniqueId" (the @handle without @).
 * You can set either TIKTOK_PROFILE_URL (paste browser URL) or TIKTOK_USERNAME.
 * If someone changes their @handle, the URL changes — update this once (not auto-magic).
 */
function resolveTikTokUniqueId(profileUrl: string, username: string): string {
  const url = String(profileUrl || '').trim();
  if (url) {
    const m = url.match(/tiktok\.com\/@([^/?#]+)/i);
    if (m && m[1]) {
      return decodeURIComponent(m[1]).replace(/^@/, '');
    }
    throw new Error(
      'TIKTOK_PROFILE_URL is set but no @handle found. Use e.g. https://www.tiktok.com/@theirhandle'
    );
  }
  const u = String(username || '').trim().replace(/^@/, '');
  return u;
}

/** One entry = full profile URL or bare @handle (no URL). Comma, newline, or | separated. */
function parseTikTokProfileSegment(segment: string): string {
  const s = String(segment || '').trim();
  if (!s) return '';
  if (/tiktok\.com\//i.test(s)) {
    return resolveTikTokUniqueId(s, '');
  }
  return s.replace(/^@/, '').trim();
}

/** Multiple accounts: set TIKTOK_PROFILE_URLS. Single: TIKTOK_PROFILE_URL or TIKTOK_USERNAME. */
function parseAllTikTokUniqueIds(): string[] {
  const multi = (process.env.TIKTOK_PROFILE_URLS || '').trim();
  if (multi) {
    const raw = multi.split(/[,\n|]+/);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw) {
      const id = parseTikTokProfileSegment(part);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }
  const one = resolveTikTokUniqueId(process.env.TIKTOK_PROFILE_URL || '', process.env.TIKTOK_USERNAME || '');
  return one ? [one] : [];
}

import Logger from './utils/logger';
import DiscordService from './services/discordService';
import TikTokService from './services/tiktokService';
import ILogger from './interfaces/iLogger';
import * as Sentry from "@sentry/node";
import DatabaseService from './services/databaseService';

class App {
  private enableLogs: boolean;
  private debug: boolean;
  private tiktokUniqueIds: string[];
  private useVariableInterval: boolean;
  private defaultInterval: number;
  private minInterval: number;
  private maxInterval: number;
  private useSentry: boolean;
  private sentryDsn: string;
  private useExpress: boolean;
  private expressApp: express.Application | undefined;
  private endpoint: string;
  private port: number;
  private proxyAccess: string;
  private proxyType: string;
  private proxyTimeout: number;
  private minViewers: number;
  private minUpdateInterval: number;
  private sqliteDbPath: string;
  private discordToken: string;
  private channelId: string;
  private discordMessage: string;

  private tikTokServices: TikTokService[];
  private logger: ILogger;

  constructor() {
    require('dotenv').config();

    this.enableLogs = process.env.ENABLE_LOGS === 'true';
    this.debug = process.env.DEBUG === 'true';
    this.tiktokUniqueIds = parseAllTikTokUniqueIds();
    this.useVariableInterval = process.env.USE_VARIABLE_INTERVAL === 'true';
    this.defaultInterval = process.env.DEFAULT_INTERVAL_IN_SECONDS ? parseInt(process.env.DEFAULT_INTERVAL_IN_SECONDS) * 1000 : 60000;
    this.minInterval = process.env.MIN_INTERVAL_IN_SECONDS ? parseInt(process.env.MIN_INTERVAL_IN_SECONDS) * 1000 : 60000;
    this.maxInterval = process.env.MAX_INTERVAL_IN_SECONDS ? parseInt(process.env.MAX_INTERVAL_IN_SECONDS) * 1000 : 90000;
    this.useSentry = process.env.USE_SENTRY === 'true';
    this.sentryDsn = process.env.SENTRY_DSN || '';
    this.useExpress = process.env.USE_EXPRESS === 'true';
    this.endpoint = process.env.ENDPOINT || '/';
    this.port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    this.proxyAccess = process.env.PROXY_ACCESS || '';
    this.proxyType = process.env.PROXY_TYPE || 'http';
    this.proxyTimeout = process.env.PROXY_TIMEOUT_IN_MILLISECONDS ? parseInt(process.env.PROXY_TIMEOUT_IN_MILLISECONDS) : 30000;
    this.minViewers = process.env.MINIMUM_VIEWERS_TO_SEND_NOTIFICATION ? parseInt(process.env.MINIMUM_VIEWERS_TO_SEND_NOTIFICATION) : 10;
    this.minUpdateInterval = process.env.MINIMUM_TIME_TO_SEND_NOTIFICATION_IN_SECONDS ? parseInt(process.env.MINIMUM_TIME_TO_SEND_NOTIFICATION_IN_SECONDS) : 3600;
    this.sqliteDbPath = process.env.SQLITE_FILE_PATH || 'sqlite://database.sqlite';
    this.discordToken = process.env.DISCORD_TOKEN || '';
    this.channelId = process.env.DISCORD_CHANNEL_ID || '';
    this.discordMessage = process.env.DISCORD_MESSAGE || '';

    if (this.tiktokUniqueIds.length === 0) {
      throw new Error(
        'Set TIKTOK_PROFILE_URLS (comma-separated URLs) or TIKTOK_PROFILE_URL or TIKTOK_USERNAME — see README'
      );
    }

    if (this.useSentry && this.sentryDsn === '') {
      throw new Error('Please set SENTRY_DSN environment variable');
    } else if (this.useSentry) {
      Sentry.init({ dsn: this.sentryDsn });
      this.logger = new Logger(Sentry);
    } else {
      this.logger = new Logger();
    }

    if (this.proxyType !== 'http' && this.proxyType !== 'socks5') {
      throw new Error('Proxy type must be http or socks5');
    }

    const useDiscordWebhook = (process.env.DISCORD_WEBHOOK_URL || '').trim() !== '';
    if (!useDiscordWebhook) {
      if (this.discordToken === '') {
        throw new Error('Set DISCORD_WEBHOOK_URL (like IG/FB bot) or DISCORD_TOKEN for a Discord bot');
      }
      if (this.channelId === '') {
        throw new Error('Please set DISCORD_CHANNEL_ID when using DISCORD_TOKEN (not needed for webhooks)');
      }
    }

    if (this.discordMessage === '') {
      throw new Error('Please set DISCORD_MESSAGE environment variable');
    } else {
      this.discordMessage = this.discordMessage.replace(/\\n/g, '\n');
    }

    const discordService = new DiscordService(this.discordToken, this.channelId, this.debug, this.enableLogs, this.logger);
    discordService.message = this.discordMessage;

    const databaseService = new DatabaseService(this.sqliteDbPath, this.debug, this.enableLogs, this.logger);
    this.tikTokServices = this.tiktokUniqueIds.map(
      (username) =>
        new TikTokService({
          username,
          discordService: discordService,
          databaseService: databaseService,
          minViewers: this.minViewers,
          minUpdateInterval: this.minUpdateInterval,
          proxyAccess: this.proxyAccess,
          proxyType: this.proxyType,
          proxyTimeout: this.proxyTimeout,
          debug: this.debug,
          log: this.enableLogs,
          logger: this.logger
        })
    );

    console.log(
      `[tiktok-live-notifier] Monitoring ${this.tikTokServices.length} account(s): ${this.tiktokUniqueIds.map((u) => '@' + u).join(', ')}`
    );

    if (this.useExpress) {
      this.expressApp = express();

      if (this.useSentry) {
        this.expressApp.use(Sentry.Handlers.requestHandler());
      }

      this.setupExpressRoutes();
      this.startExpressServer();
    } else {
      this.runTikTokService((error?: Error) => {
        if (this.enableLogs) {
          if (error) {
            const errorToString = error.toString();
            this.logger.log(errorToString);
          } else {
            this.logger.log('Finished running TikTok Service');
          }
        }
      });
    }
  }

  private async forceConnectToChat(): Promise<void> {
    for (const svc of this.tikTokServices) {
      const isConnected = await svc.connectToChat();
      if (isConnected) {
        svc.startChatListener();
      }
    }
  }

  private setupExpressRoutes(): void {
    this.expressApp!.get(this.endpoint, async (req: Request, res: Response) => {
      try {
        for (const svc of this.tikTokServices) {
          await svc.runViaExpress();
        }
        res.status(200).json({ message: 'TikTok service executed successfully.' });
      } catch (error: any) {
        res.status(500).json({ message: 'There was an error while processing the request. Please check the error log.' });
      }
    });
  }

  private startExpressServer(): void {
    this.expressApp!.listen(this.port, () => {
      console.log(`Server listening on port ${this.port}`);
    });
  }

  private runTikTokService(callback: (error?: Error) => void): void {
    let interval: NodeJS.Timeout;

    const runWithVariableInterval = () => {
      try {
        for (const svc of this.tikTokServices) {
          svc.runViaInterval();
        }
      } catch (error: any) {
        clearInterval(interval);
        callback(error);
      }

      if (this.useVariableInterval) {
        const variableInterval = Math.random() * (this.maxInterval - this.minInterval) + this.minInterval;
        clearInterval(interval);
        interval = setTimeout(runWithVariableInterval, variableInterval);

        if (this.debug) {
          console.log('Random interval: ', parseInt(variableInterval.toString()));
        }
      } else {
        interval = setTimeout(runWithVariableInterval, this.defaultInterval);
      }
    };

    interval = setTimeout(runWithVariableInterval, this.defaultInterval);
  }
}

new App();