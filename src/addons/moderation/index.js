const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

module.exports = {
  name: "moderation",
  description: "Core moderation commands: ban, kick, mute, warn, clear",
  isEnabled: true,

  init: async (client) => {
    // Initialize warnings table in DB
    client.db.run(`
      CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        user_id TEXT,
        moderator_id TEXT,
        reason TEXT,
        timestamp INTEGER
      )
    `);
  },

  commands: [
    // BAN
    {
      data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName("user").setDescription("The user to ban").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for the ban").setRequired(false))
        .addIntegerOption(opt => opt.setName("delete_messages").setDescription("Delete message history (days)").setMinValue(0).setMaxValue(7).setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const deleteDays = interaction.options.getInteger("delete_messages") || 0;

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && !member.bannable) {
          return interaction.reply({ content: "❌ I cannot ban this user! They may have a higher role than me.", ephemeral: true });
        }

        await interaction.guild.members.ban(user.id, {
          deleteMessageSeconds: deleteDays * 24 * 60 * 60,
          reason: `${interaction.user.tag}: ${reason}`
        });

        const embed = new EmbedBuilder()
          .setTitle("🌸 Member Banned 🌸")
          .setDescription(`**${user.tag}** has been banned from the server.`)
          .addFields(
            { name: "👤 Banned User", value: `<@${user.id}> (${user.id})`, inline: true },
            { name: "🛡️ Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📄 Reason", value: reason }
          )
          .setColor(client.config.colors.error)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    },

    // KICK
    {
      data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user from the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName("user").setDescription("The user to kick").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for the kick").setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          return interaction.reply({ content: "❌ That user is not in this server.", ephemeral: true });
        }
        if (!member.kickable) {
          return interaction.reply({ content: "❌ I cannot kick this user! They may have a higher role than me.", ephemeral: true });
        }

        await member.kick(`${interaction.user.tag}: ${reason}`);

        const embed = new EmbedBuilder()
          .setTitle("🌸 Member Kicked 🌸")
          .setDescription(`**${user.tag}** has been kicked.`)
          .addFields(
            { name: "👤 Kicked User", value: `<@${user.id}> (${user.id})`, inline: true },
            { name: "🛡️ Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📄 Reason", value: reason }
          )
          .setColor(client.config.colors.warn)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    },

    // MUTE (TIMEOUT)
    {
      data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Mute (timeout) a user in the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName("user").setDescription("The user to mute").setRequired(true))
        .addIntegerOption(opt => opt.setName("duration").setDescription("Duration of the mute in minutes").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for the mute").setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user");
        const duration = interaction.options.getInteger("duration");
        const reason = interaction.options.getString("reason") || "No reason provided";

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          return interaction.reply({ content: "❌ That user is not in this server.", ephemeral: true });
        }
        if (!member.moderatable) {
          return interaction.reply({ content: "❌ I cannot mute this user! They may have a higher role or permissions.", ephemeral: true });
        }

        await member.timeout(duration * 60 * 1000, `${interaction.user.tag}: ${reason}`);

        const embed = new EmbedBuilder()
          .setTitle("🌸 Member Muted 🌸")
          .setDescription(`**${user.tag}** has been timed out.`)
          .addFields(
            { name: "👤 Muted User", value: `<@${user.id}>`, inline: true },
            { name: "⏳ Duration", value: `${duration} minutes`, inline: true },
            { name: "🛡️ Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📄 Reason", value: reason }
          )
          .setColor(client.config.colors.warn)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    },

    // UNMUTE
    {
      data: new SlashCommandBuilder()
        .setName("unmute")
        .setDescription("Remove mute (timeout) from a user")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName("user").setDescription("The user to unmute").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for unmuting").setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          return interaction.reply({ content: "❌ That user is not in this server.", ephemeral: true });
        }
        if (!member.moderatable) {
          return interaction.reply({ content: "❌ I cannot moderate this user.", ephemeral: true });
        }
        if (!member.communicationDisabledUntilTimestamp) {
          return interaction.reply({ content: "❌ This user is not currently muted.", ephemeral: true });
        }

        await member.timeout(null, `${interaction.user.tag}: ${reason}`);

        const embed = new EmbedBuilder()
          .setTitle("🌸 Member Unmuted 🌸")
          .setDescription(`Timeout removed for **${user.tag}**.`)
          .addFields(
            { name: "👤 Unmuted User", value: `<@${user.id}>`, inline: true },
            { name: "🛡️ Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📄 Reason", value: reason }
          )
          .setColor(client.config.colors.success)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    },

    // WARN
    {
      data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user in the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName("user").setDescription("The user to warn").setRequired(true))
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for the warning").setRequired(true)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        if (user.bot) {
          return interaction.reply({ content: "❌ You cannot warn a bot.", ephemeral: true });
        }

        // Save warn to SQLite database
        client.db.run(
          "INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
          interaction.guild.id,
          user.id,
          interaction.user.id,
          reason,
          Date.now()
        );

        // Send DM to user if possible
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle(`⚠️ Warning in ${interaction.guild.name}`)
            .setDescription(`You have received a warning from a moderator.`)
            .addFields(
              { name: "📄 Reason", value: reason }
            )
            .setColor(client.config.colors.error)
            .setTimestamp();
          await user.send({ embeds: [dmEmbed] });
        } catch {
          // Ignore DM failure
        }

        const embed = new EmbedBuilder()
          .setTitle("🌸 Warning Issued 🌸")
          .setDescription(`Warning added for **${user.tag}**.`)
          .addFields(
            { name: "👤 Warned User", value: `<@${user.id}>`, inline: true },
            { name: "🛡️ Moderator", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📄 Reason", value: reason }
          )
          .setColor(client.config.colors.warn)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    },

    // WARNINGS LIST & CLEAR
    {
      data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("View or manage warnings for a user")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName("user").setDescription("The user to check").setRequired(true))
        .addStringOption(opt => opt.setName("action").setDescription("Action to take").addChoices(
          { name: "View Warnings", value: "view" },
          { name: "Clear All Warnings", value: "clear" }
        ).setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user");
        const action = interaction.options.getString("action") || "view";

        if (action === "clear") {
          client.db.run("DELETE FROM warnings WHERE guild_id = ? AND user_id = ?", interaction.guild.id, user.id);
          return interaction.reply({ content: `✅ Cleared all warnings for **${user.tag}**.` });
        }

        const warns = client.db.all(
          "SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC",
          interaction.guild.id,
          user.id
        );

        if (warns.length === 0) {
          return interaction.reply({ content: `🌸 **${user.tag}** has 0 active warnings.` });
        }

        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Warnings for ${user.tag}`)
          .setDescription(`Total Warnings: **${warns.length}**`)
          .setColor(client.config.colors.neutral)
          .setTimestamp();

        warns.forEach((warn, index) => {
          const date = new Date(warn.timestamp).toLocaleDateString();
          embed.addFields({
            name: `Warning #${warns.length - index} | Issued by <@${warn.moderator_id}>`,
            value: `*Date:* ${date}\n*Reason:* ${warn.reason}`
          });
        });

        await interaction.reply({ embeds: [embed] });
      }
    },

    // CLEAR (PURGE) MESSAGES
    {
      data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Bulk delete messages in the current channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => opt.setName("amount").setDescription("Number of messages to clear").setMinValue(1).setMaxValue(100).setRequired(true))
        .addUserOption(opt => opt.setName("user").setDescription("Filter messages from a specific user").setRequired(false)),
      execute: async (client, interaction) => {
        const amount = interaction.options.getInteger("amount");
        const targetUser = interaction.options.getUser("user");

        // Fetch messages first
        const messages = await interaction.channel.messages.fetch({ limit: amount });
        
        let messagesToDelete = messages;
        if (targetUser) {
          messagesToDelete = messages.filter(m => m.author.id === targetUser.id);
        }

        if (messagesToDelete.size === 0) {
          return interaction.reply({ content: "❌ No messages matched the filter.", ephemeral: true });
        }

        const deleted = await interaction.channel.bulkDelete(messagesToDelete, true).catch(err => {
          return null;
        });

        if (!deleted) {
          return interaction.reply({ content: "❌ Failed to delete messages. They may be older than 14 days.", ephemeral: true });
        }

        await interaction.reply({
          content: `✅ Successfully deleted **${deleted.size}** messages${targetUser ? ` from ${targetUser.tag}` : ""}.`,
          ephemeral: true
        });
      }
    }
  ]
};
