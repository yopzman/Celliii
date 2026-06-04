const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "modmail",
  description: "Allows members to open private support threads via DMing the bot",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS modmail (
        user_id TEXT PRIMARY KEY,
        channel_id TEXT,
        guild_id TEXT,
        status TEXT
      )
    `);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("modmail")
        .setDescription("Configure Modmail settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set up the category for Modmail channels")
             .addChannelOption(opt =>
               opt.setName("category")
                  .setDescription("The category to create Modmail threads under")
                  .addChannelTypes(ChannelType.GuildCategory)
                  .setRequired(true)
             )
        ),
      execute: async (client, interaction) => {
        const category = interaction.options.getChannel("category");
        const guildId = interaction.guild.id;

        client.db.setSetting(guildId, "modmail_category_id", category.id);
        client.db.setSetting(guildId, "modmail_guild_id", guildId);

        return interaction.reply({
          content: `✅ Modmail configured! Channels will open in the category **${category.name}** in this guild.`,
          ephemeral: true
        });
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName("modmail-close")
        .setDescription("Close the active modmail thread in this channel"),
      execute: async (client, interaction) => {
        const channelId = interaction.channel.id;
        const thread = client.db.get("SELECT user_id, guild_id FROM modmail WHERE channel_id = ?", channelId);

        if (!thread) {
          return interaction.reply({ content: "❌ This channel is not an active Modmail thread.", ephemeral: true });
        }

        await interaction.reply("🔒 **Closing Modmail thread and notifying user...**");

        const user = await client.users.fetch(thread.user_id).catch(() => null);
        if (user) {
          const closeEmbed = new EmbedBuilder()
            .setTitle("🌸 Modmail Thread Closed 🌸")
            .setDescription(`Your support thread has been marked as closed. Feel free to send another message if you need further help!`)
            .setColor(client.config.colors.error)
            .setTimestamp();
          await user.send({ embeds: [closeEmbed] }).catch(() => {});
        }

        client.db.run("DELETE FROM modmail WHERE channel_id = ?", channelId);

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
      }
    }
  ],

  events: {
    messageCreate: async (client, message) => {
      if (message.author.bot) return;

      // Case A: User DMs the Bot
      if (!message.guild) {
        // Find which guild has Modmail enabled (for simplicity, we grab the first modmail setup from DB)
        const setup = client.db.get("SELECT guild_id, value FROM settings WHERE key = 'modmail_category_id' LIMIT 1");
        if (!setup) return; // Modmail not configured on any guild

        const guildId = setup.guild_id;
        const categoryId = setup.value;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        // Check if thread exists in DB
        let thread = client.db.get("SELECT channel_id FROM modmail WHERE user_id = ?", message.author.id);
        let channel;

        if (thread) {
          channel = guild.channels.cache.get(thread.channel_id);
          if (!channel) {
            // Clean up stale db record if channel was deleted manually
            client.db.run("DELETE FROM modmail WHERE user_id = ?", message.author.id);
            thread = null;
          }
        }

        if (!thread) {
          // Open new thread
          channel = await guild.channels.create({
            name: `mail-${message.author.username}`,
            type: ChannelType.GuildText,
            parent: categoryId,
            topic: `Modmail thread with ${message.author.tag} (${message.author.id})`
          });

          client.db.run(
            "INSERT INTO modmail (user_id, channel_id, guild_id, status) VALUES (?, ?, ?, 'active')",
            message.author.id,
            channel.id,
            guildId
          );

          const dmOpenEmbed = new EmbedBuilder()
            .setTitle("🌸 Modmail Opened 🌸")
            .setDescription("Hello! Your message has been forwarded to the staff. We will reply to you as soon as possible! ✨")
            .setColor(client.config.colors.primary)
            .setTimestamp();
          await message.author.send({ embeds: [dmOpenEmbed] }).catch(() => {});

          const threadOpenEmbed = new EmbedBuilder()
            .setTitle("🌸 New Modmail Thread 🌸")
            .setDescription(`User <@${message.author.id}> has started a Modmail session.\nUse \`/modmail-close\` to close it.`)
            .addFields(
              { name: "👤 User Details", value: `${message.author.tag} (${message.author.id})`, inline: true }
            )
            .setColor(client.config.colors.success)
            .setTimestamp();

          await channel.send({ embeds: [threadOpenEmbed] });
        }

        // Forward DM to Staff Channel
        const forwardEmbed = new EmbedBuilder()
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
          .setDescription(message.content || "*No text content (likely media/attachment)*")
          .setColor(client.config.colors.secondary)
          .setTimestamp();

        if (message.attachments.size > 0) {
          const files = Array.from(message.attachments.values()).map(a => a.url);
          await channel.send({ embeds: [forwardEmbed], files });
        } else {
          await channel.send({ embeds: [forwardEmbed] });
        }
        return;
      }

      // Case B: Message in a Modmail Channel (Forward back to User DM)
      const thread = client.db.get("SELECT user_id FROM modmail WHERE channel_id = ?", message.channel.id);
      if (!thread) return; // Not a modmail channel

      // If staff starts command prefix/slash, ignore forwarding
      if (message.content.startsWith("/") || message.content.startsWith(client.config.prefix)) return;

      const user = await client.users.fetch(thread.user_id).catch(() => null);
      if (!user) {
        return message.channel.send("❌ Could not fetch user. They may have blocked the bot or left Discord.");
      }

      const replyEmbed = new EmbedBuilder()
        .setAuthor({ name: `Staff Team`, iconURL: client.user.displayAvatarURL() })
        .setDescription(message.content || "*No text content*")
        .setColor(client.config.colors.primary)
        .setFooter({ text: `From ${message.guild.name}` })
        .setTimestamp();

      try {
        if (message.attachments.size > 0) {
          const files = Array.from(message.attachments.values()).map(a => a.url);
          await user.send({ embeds: [replyEmbed], files });
        } else {
          await user.send({ embeds: [replyEmbed] });
        }
        // React to show successful delivery
        await message.react("✉️").catch(() => {});
      } catch (err) {
        logger.error(`Failed to DM user ${user.tag} in Modmail thread`, err, "MODMAIL");
        await message.channel.send("❌ Message failed to send. The user may have DMs closed or has blocked the bot.");
      }
    }
  }
};
