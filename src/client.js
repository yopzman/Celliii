const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config");
const database = require("./database");
const logger = require("./utils/logger");

class CelliiiClient extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
        Partials.ThreadMember
      ]
    });

    this.commands = new Collection();
    this.addons = new Map();
    this.db = database;
    this.config = config;
    this.shoukaku = null; // Initialized in music addon
  }

  async start() {
    logger.info("Initializing Celliii Discord Client...", "CLIENT");
    
    // Load handlers
    const addonManager = require("./handler/addonManager");
    const commandHandler = require("./handler/commandHandler");
    const eventHandler = require("./handler/eventHandler");

    // Load and initialize addons
    await addonManager.init(this);

    // Register event listeners
    await eventHandler.init(this);

    // Login to Discord
    await this.login(this.config.token);
  }
}

module.exports = CelliiiClient;
