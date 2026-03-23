import IDiscordService from "../interfaces/iDiscordService";
import ILogger from "../interfaces/iLogger";
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');

/** Hot pink for embed sidebar (Discord integer color). */
const EMBED_PINK = 0xff69b4;

class DiscordService implements IDiscordService {
    public message: string = '';
    private isReady: boolean = false;
    private token: String;
    private client: typeof Client;
    private channelId: string;
    private debug: boolean = false;
    private log: boolean = false;
    private logger: ILogger;
    private embedTitle: string;
    /** Role to ping above the embed; unset env defaults to AppleStoreQueen live-alert role. Set DISCORD_ROLE_ID= to empty to disable. */
    private roleIdToPing: string;

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
        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

        this.clientReady();

        this.client.login(this.token);
    }

    getMessage(): string {
        return this.message;
    }

    public async sendMessage(message: string) {
        try {
            await this.waitForClientReady();
            const channel = await this.client.channels.fetch(this.channelId);
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

    private async clientReady() {
        await this.client.on(Events.ClientReady, async (c: { user: { tag: string; }; }) => {
            
            if (this.debug) {
                console.log(`Logged in as ${c.user.tag}!`);
            }

            this.isReady = true;
        });
    }

    private async waitForClientReady() {
        return new Promise((resolve) => {
            if (this.isReady) {
                resolve(true);
            } else {
                this.client.on(Events.ClientReady, () => {
                    resolve(true);
                });
            }
        });
    }
}

export default DiscordService;