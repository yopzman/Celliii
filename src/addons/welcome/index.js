const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const canvasHelper = require("../../utils/canvasHelper");
const logger = require("../../utils/logger");

module.exports = {
  name: "welcome",
  description: "Greets new members with a cute welcome card image",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("welcome")
        .setDescription("Configure welcome messages settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set the channel for welcome messages")
             .addChannelOption(opt =>
               opt.setName("channel")
                  .setDescription("The welcome channel")
                  .setRequired(true)
             )
        )
        .addSubcommand(sub =>
          sub.setName("toggle")
             .setDescription("Enable or disable welcome greetings")
             .addBooleanOption(opt =>
               opt.setName("enabled")
                  .setDescription("Whether greetings are enabled")
                  .setRequired(true)
             )
        )
        .addSubcommand(sub =>
          sub.setName("message")
             .setDescription("Set custom welcome text (use {user}, {guild}, {count})")
             .addStringOption(opt =>
               opt.setName("text")
                  .setDescription("Welcome message template")
                  .setRequired(true)
             )
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "setup") {
          const channel = interaction.options.getChannel("channel");
          client.db.setSetting(guildId, "welcome_channel_id", channel.id);
          return interaction.reply({ content: `✅ Welcome channel has been set to <#${channel.id}>.`, ephemeral: true });
        }

        if (subcommand === "toggle") {
          const enabled = interaction.options.getBoolean("enabled");
          client.db.setSetting(guildId, "welcome_enabled", enabled ? "true" : "false");
          return interaction.reply({ content: `✅ Welcome cards are now ${enabled ? "**enabled**" : "**disabled**"}.`, ephemeral: true });
        }

        if (subcommand === "message") {
          const text = interaction.options.getString("text");
          client.db.setSetting(guildId, "welcome_message", text);
          return interaction.reply({ content: `✅ Welcome message set to:\n\`${text}\``, ephemeral: true });
        }
      }
    }
  ],

  events: {
    guildMemberAdd: async (client, member) => {
      const guildId = member.guild.id;
      const isEnabled = client.db.getSetting(guildId, "welcome_enabled", "true") === "true";
      if (!isEnabled) return;

      const welcomeChannelId = client.db.getSetting(guildId, "welcome_channel_id");
      if (!welcomeChannelId) return;

      const channel = member.guild.channels.cache.get(welcomeChannelId);
      if (!channel) return;

      // Prepare custom greeting string
      const defaultMsg = client.config.defaultSettings.welcomeMessage;
      let template = client.db.getSetting(guildId, "welcome_message", defaultMsg);
      
      const memberCount = member.guild.memberCount;
      const userString = `<@${member.user.id}>`;
      const guildName = member.guild.name;
      
      template = template
        .replace(/{user}/g, userString)
        .replace(/{guild}/g, guildName)
        .replace(/{count}/g, memberCount);

      // Generate the gorgeous Canvas Welcome Card
      const username = member.user.username;
      const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });

      // Generate card buffer
      const cardBuffer = await canvasHelper.createWelcomeCard(username, avatarUrl, memberCount, guildName);

      if (cardBuffer) {
        const attachment = new AttachmentBuilder(cardBuffer, { name: "welcome-card.png" });
        await channel.send({
          content: template,
          files: [attachment]
        }).catch(err => {
          logger.error(`Failed to send welcome message in guild ${guildId}`, err, "WELCOME");
        });
      } else {
        // Fallback to text message if canvas rendering fails
        await channel.send({ content: template }).catch(() => {});
      }
    }
  }
};
