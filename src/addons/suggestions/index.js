const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "suggestions",
  description: "Allows community suggestions with interactive voting and admin responses",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        user_id TEXT,
        message_id TEXT,
        suggestion TEXT,
        status TEXT DEFAULT 'pending',
        upvotes TEXT DEFAULT '',
        downvotes TEXT DEFAULT '',
        reason TEXT DEFAULT ''
      )
    `);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("suggestions")
        .setDescription("Configure suggestions settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set the channel for community suggestions")
             .addChannelOption(opt => opt.setName("channel").setDescription("The channel to send suggestions to").setRequired(true))
        ),
      execute: async (client, interaction) => {
        const channel = interaction.options.getChannel("channel");
        const guildId = interaction.guild.id;

        client.db.setSetting(guildId, "suggestions_channel_id", channel.id);
        return interaction.reply({ content: `✅ Suggestions channel has been configured to <#${channel.id}>.`, ephemeral: true });
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName("suggest")
        .setDescription("Submit a suggestion for the server")
        .addStringOption(opt => opt.setName("suggestion").setDescription("Write your suggestion here").setRequired(true)),
      execute: async (client, interaction) => {
        const text = interaction.options.getString("suggestion");
        const guildId = interaction.guild.id;
        const suggestChannelId = client.db.getSetting(guildId, "suggestions_channel_id");

        if (!suggestChannelId) {
          return interaction.reply({ content: "❌ Suggestions are not configured for this server yet.", ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(suggestChannelId);
        if (!channel) {
          return interaction.reply({ content: "❌ The suggestions channel could not be found.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Build temporary embed to fetch message ID
        const embed = new EmbedBuilder()
          .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
          .setTitle("💡 New Suggestion")
          .setDescription(text)
          .setColor(client.config.colors.primary)
          .addFields({ name: "Status", value: "⏳ Pending review..." })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("suggest_up").setLabel("👍 Upvote (0)").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("suggest_down").setLabel("👎 Downvote (0)").setStyle(ButtonStyle.Danger)
        );

        const msg = await channel.send({ embeds: [embed], components: [row] });

        // Save suggestion in DB
        client.db.run(
          "INSERT INTO suggestions (guild_id, user_id, message_id, suggestion) VALUES (?, ?, ?, ?)",
          guildId,
          interaction.user.id,
          msg.id,
          text
        );

        // Fetch suggestion ID
        const rowDb = client.db.get("SELECT id FROM suggestions WHERE message_id = ?", msg.id);

        // Update sent embed with Suggestion ID
        embed.setTitle(`💡 Suggestion #${rowDb.id}`);
        await msg.edit({ embeds: [embed] });

        return interaction.editReply(`✅ Your suggestion has been submitted successfully to <#${channel.id}>!`);
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName("suggest-respond")
        .setDescription("Respond to a suggestion (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption(opt => opt.setName("id").setDescription("Suggestion ID").setRequired(true))
        .addStringOption(opt => opt.setName("status").setDescription("Response status").setRequired(true).addChoices(
          { name: "Approve 👍", value: "approved" },
          { name: "Deny 👎", value: "denied" },
          { name: "Consider 🤔", value: "considered" }
        ))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for this status change").setRequired(false)),
      execute: async (client, interaction) => {
        const id = interaction.options.getInteger("id");
        const status = interaction.options.getString("status");
        const reason = interaction.options.getString("reason") || "No reason provided.";
        const guildId = interaction.guild.id;

        const sugg = client.db.get("SELECT * FROM suggestions WHERE id = ? AND guild_id = ?", id, guildId);
        if (!sugg) {
          return interaction.reply({ content: `❌ Suggestion #${id} not found in this guild.`, ephemeral: true });
        }

        const suggestChannelId = client.db.getSetting(guildId, "suggestions_channel_id");
        const channel = interaction.guild.channels.cache.get(suggestChannelId);
        if (!channel) return interaction.reply({ content: "❌ Suggestions channel not found.", ephemeral: true });

        const msg = await channel.messages.fetch(sugg.message_id).catch(() => null);
        if (!msg) return interaction.reply({ content: "❌ Suggestion message could not be found in the channel.", ephemeral: true });

        client.db.run(
          "UPDATE suggestions SET status = ?, reason = ? WHERE id = ?",
          status,
          reason,
          id
        );

        let color = client.config.colors.primary;
        let statusText = "";

        if (status === "approved") {
          color = client.config.colors.success;
          statusText = "✅ Approved";
        } else if (status === "denied") {
          color = client.config.colors.error;
          statusText = "❌ Denied";
        } else if (status === "considered") {
          color = client.config.colors.warn;
          statusText = "🤔 Considered";
        }

        const originalEmbed = msg.embeds[0];
        const newEmbed = EmbedBuilder.from(originalEmbed)
          .setColor(color)
          .setFields(
            { name: "Status", value: statusText, inline: true },
            { name: "Response by Staff", value: reason, inline: true }
          );

        // Keep buttons but disable them if resolved
        const originalRows = msg.components[0];
        const upCount = sugg.upvotes ? sugg.upvotes.split(",").filter(Boolean).length : 0;
        const downCount = sugg.downvotes ? sugg.downvotes.split(",").filter(Boolean).length : 0;

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("suggest_up").setLabel(`👍 Upvotes (${upCount})`).setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId("suggest_down").setLabel(`👎 Downvotes (${downCount})`).setStyle(ButtonStyle.Danger).setDisabled(true)
        );

        await msg.edit({ embeds: [newEmbed], components: [disabledRow] });

        return interaction.reply({ content: `✅ Updated Suggestion #${id} status to **${status}**.` });
      }
    }
  ],

  events: {
    interactionCreate: async (client, interaction) => {
      if (!interaction.isButton()) return;
      const customId = interaction.customId;
      if (customId !== "suggest_up" && customId !== "suggest_down") return;

      await interaction.deferReply({ ephemeral: true });
      const messageId = interaction.message.id;
      const guildId = interaction.guild.id;

      const sugg = client.db.get("SELECT * FROM suggestions WHERE message_id = ?", messageId);
      if (!sugg) return interaction.editReply("❌ Suggestion details not found in the database.");

      if (sugg.status !== "pending") {
        return interaction.editReply("❌ Voting has ended for this suggestion because it has already been resolved.");
      }

      const voterId = interaction.user.id;
      let upList = sugg.upvotes ? sugg.upvotes.split(",").filter(Boolean) : [];
      let downList = sugg.downvotes ? sugg.downvotes.split(",").filter(Boolean) : [];

      if (customId === "suggest_up") {
        if (upList.includes(voterId)) {
          // Remove upvote
          upList = upList.filter(id => id !== voterId);
        } else {
          // Add upvote, remove downvote if exists
          upList.push(voterId);
          downList = downList.filter(id => id !== voterId);
        }
      } else if (customId === "suggest_down") {
        if (downList.includes(voterId)) {
          // Remove downvote
          downList = downList.filter(id => id !== voterId);
        } else {
          // Add downvote, remove upvote if exists
          downList.push(voterId);
          upList = upList.filter(id => id !== voterId);
        }
      }

      const upStr = upList.join(",");
      const downStr = downList.join(",");

      // Save to database
      client.db.run(
        "UPDATE suggestions SET upvotes = ?, downvotes = ? WHERE message_id = ?",
        upStr,
        downStr,
        messageId
      );

      // Edit message buttons with counts
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("suggest_up").setLabel(`👍 Upvote (${upList.length})`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("suggest_down").setLabel(`👎 Downvote (${downList.length})`).setStyle(ButtonStyle.Danger)
      );

      await interaction.message.edit({ components: [row] });
      return interaction.editReply("✨ Your vote has been recorded!");
    }
  }
};
