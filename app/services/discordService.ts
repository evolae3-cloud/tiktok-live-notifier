import IDiscordService from "../interfaces/iDiscordService";
import ILogger from "../interfaces/iLogger";
import axios from "axios";

const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');

/** Hot pink for embed sidebar (Discord integer color). */
const EMBED_PINK = 0xff69b4;

type DiscordMode = 'webhook' | 'bot';

class DiscordService implements IDiscordService {
    public message: string = '';
    private isReady: boolean = false;
    private token: String;
    private client: typeof Client | null = null;
    private channelId: string;
    private debug: boolean = false;
    private log: boolean = false;
    private logger: ILogger;
    private embedTitle: string;
    private roleIdToPing: string;
    private mode: DiscordMode;
    private webhookUrl: string;

     constructor(token: String, channelId: string, debug: boolean, enableLogs: boolean, logger: ILogger) {
        this.token = token;
        this.channelId = channelId;
        this.debug = debug;
        this.log = enableLogs;
        this.logger = logger;
        this.embedTitle = (process.env.DISCORD_EMBED_TITLE || 'TikTok Live').trim() || 'TikTok Live';
        const roleEnv = process.env.DISCORD_ROLE_ID;
        this.roleIdToPing =
            roleEnv !== undefined ? String(roleEnv).trim() : '1485140538704396400';

        this.webhookUrl = (process.env.DISCORD_WEBHOOK_URL || '').trim();
        if (this.webhookUrl) {
            this.mode = 'webhook';
            this.isReady = true;
            if (this.enableLogsOrDebug()) {
                console.log('[discord] Using DISCORD_WEBHOOK_URL (no bot token required)');
            }
            return;
        }

        this.mode = 'bot';
        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

        this.clientReady();

        this.client.login(this.token);
    }

    private enableLogsOrDebug(): boolean {
        return this.debug || this.log;
    }

    getMessage(): string {
        return this.message;
    }

    public async sendMessage(message: string) {
        try {
            if (this.mode === 'webhook') {
                await this.sendViaWebhook(message);
                return;
            }

            await this.waitForClientReady();
            const channel = await this.client!.channels.fetch(this.channelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(this.embedTitle)
                    .setDescription(message)
                    .setColor(EMBED_PINK)
                    .setTimestamp()
                    .setFooter({ text: 'TikTok Live Notifier' });

                const payload: {
                    embeds: InstanceType<typeof EmbedBuilder>[];
                    content?: string;
                    allowedMentions?: { parse: []; roles: string[] };
                } = { embeds: [embed] };

                if (this.roleIdToPing) {
                    payload.content = `<@&${this.roleIdToPing}>`;
                    payload.allowedMentions = { parse: [], roles: [this.roleIdToPing] };
                }

                await channel.send(payload);

                if (this.debug) {
                    console.info('Message sent successfully!');
                }
            } else {
                if (this.debug) {
                    console.log(`Unable to send message to channel with ID: ${this.channelId}`);
                }
            }
        } catch (error: any) {
            if (this.debug) {
                console.error('Error sending message:', error);
            }

            if (this.log) {
                this.logger.log(error);
            }
        }
    }

    private async sendViaWebhook(description: string): Promise<void> {
        const embed = {
            title: this.embedTitle,
            description,
            color: EMBED_PINK,
            timestamp: new Date().toISOString(),
            footer: { text: 'TikTok Live Notifier' },
        };

        const body: {
            embeds: typeof embed[];
            content?: string;
            allowed_mentions?: { parse: []; roles: string[] };
        } = { embeds: [embed] };

        if (this.roleIdToPing) {
            body.content = `<@&${this.roleIdToPing}>`;
            body.allowed_mentions = { parse: [], roles: [this.roleIdToPing] };
        }

        const res = await axios.post(this.webhookUrl, body, {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: () => true,
            timeout: 15000,
        });

        if (res.status < 200 || res.status >= 300) {
            throw new Error(`Webhook HTTP ${res.status}: ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`);
        }

        if (this.debug) {
            console.info('Webhook message sent successfully!');
        }
    }

    private async clientReady() {
        await this.client!.on(Events.ClientReady, async (c: { user: { tag: string; }; }) => {

            if (this.debug) {
                console.log(`Logged in as ${c.user.tag}!`);
            }

            this.isReady = true;
        });
    }

    private async waitForClientReady() {
        if (this.mode === 'webhook') {
            return;
        }
        return new Promise((resolve) => {
            if (this.isReady) {
                resolve(true);
            } else {
                this.client!.on(Events.ClientReady, () => {
                    resolve(true);
                });
            }
        });
    }
}

export default DiscordService;
