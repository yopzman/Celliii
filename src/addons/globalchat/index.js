const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "globalchat",
  description: "Bridges a designated chat channel across multiple Discord servers using webhooks",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("globalchat")
        .setDescription("Configure global chat bridge settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Designate the channel for cross-server global chat")
             .addChannelOption(opt =>
               opt.setName("channel")
                  .setDescription("The chat channel")
                  .setRequired(true)
             )
        )
        .addSubcommand(sub =>
          sub.setName("disable")
             .setDescription("Disable the global chat bridge in this server")
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "setup") {
          const channel = interaction.options.getChannel("channel");
          client.db.setSetting(guildId, "globalchat_channel_id", channel.id);
          return interaction.reply({ content: `✅ Global Chat bridge set up in <#${channel.id}>! Messages sent here will now sync across servers.`, ephemeral: true });
        }

        if (subcommand === "disable") {
          client.db.deleteSetting(guildId, "globalchat_channel_id");
          return interaction.reply({ content: "✅ Disabled global chat bridge in this server.", ephemeral: true });
        }
      }
    }
  ],

  events: {
    messageCreate: async (client, message) => {
      // Ignore bot, system, or DM messages
      if (!message.guild || message.author.bot || message.system) return;

      const guildId = message.guild.id;
      const globalChannelId = client.db.getSetting(guildId, "globalchat_channel_id");

      // Verify the message was sent in the designated global channel
      if (!globalChannelId || message.channel.id !== globalChannelId) return;

      // Fetch all global chat channels across other servers
      const otherChannels = client.db.all(
        "SELECT guild_id, value FROM settings WHERE key = 'globalchat_channel_id' AND guild_id != ?",
        guildId
      );

      const content = message.content.trim();
      if (content.length === 0 && message.attachments.size === 0) return;

      const senderName = message.author.username;
      const senderAvatar = message.author.displayAvatarURL({ extension: "png", size: 256 });
      const guildName = message.guild.name;

      // Clean/truncate message
      const textToSend = content.length > 1000 ? content.slice(0, 1000) + "..." : content;

      for (const entry of otherChannels) {
        const targetGuild = client.guilds.cache.get(entry.guild_id);
        if (!targetGuild) continue;

        const targetChannel = targetGuild.channels.cache.get(entry.value);
        if (!targetChannel) continue;

        // Try using Webhook for native feel
        try {
          let webhook;
          const webhooks = await targetChannel.fetchWebhooks().catch(() => null);
          
          if (webhooks) {
            webhook = webhooks.find(wh => wh.name === "Celliii Global Chat");
          }

          if (!webhook) {
            // Create a new webhook
            webhook = await targetChannel.createWebhook({
              name: "Celliii Global Chat",
              avatar: client.user.displayAvatarURL(),
              reason: "Global Chat Bridge Hook"
            }).catch(() => null);
          }

          if (webhook) {
            await webhook.send({
              content: textToSend,
              username: `${senderName} [from ${guildName}]`,
              avatarURL: senderAvatar,
              files: Array.from(message.attachments.values()).map(a => a.url)
            });
            continue; // Webhook sent successfully!
          }
        } catch (err) {
          // Log and fallback to Embed
          logger.debug(`Webhook fail, falling back to embed in guild ${entry.guild_id}`);
        }

        // Fallback: Embed sending
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${senderName} (from ${guildName})`, iconURL: senderAvatar })
          .setDescription(textToSend || "*Sent an attachment*")
          .setColor(client.config.colors.primary)
          .setTimestamp();

        if (message.attachments.size > 0) {
          embed.setImage(message.attachments.first().url);
        }

        await targetChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};
