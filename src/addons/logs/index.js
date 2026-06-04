const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

module.exports = {
  name: "logs",
  description: "Tracks server changes, audits, and messages in a logs channel",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Configure logging settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set the logs channel")
             .addChannelOption(opt =>
               opt.setName("channel")
                  .setDescription("The logs channel")
                  .setRequired(true)
             )
        )
        .addSubcommand(sub =>
          sub.setName("disable")
             .setDescription("Disable server logging")
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "setup") {
          const channel = interaction.options.getChannel("channel");
          client.db.setSetting(guildId, "logs_channel_id", channel.id);
          return interaction.reply({ content: `✅ Audit logs channel has been set to <#${channel.id}>.`, ephemeral: true });
        }

        if (subcommand === "disable") {
          client.db.deleteSetting(guildId, "logs_channel_id");
          return interaction.reply({ content: "✅ Server logging has been disabled.", ephemeral: true });
        }
      }
    }
  ],

  events: {
    // Message Update (Edit)
    messageUpdate: async (client, oldMessage, newMessage) => {
      if (oldMessage.author?.bot || !oldMessage.guild) return;
      if (oldMessage.content === newMessage.content) return; // Ignore embeds updates

      const guildId = oldMessage.guild.id;
      const logChannelId = client.db.getSetting(guildId, "logs_channel_id");
      if (!logChannelId) return;

      const logChannel = oldMessage.guild.channels.cache.get(logChannelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setAuthor({ name: oldMessage.author.tag, iconURL: oldMessage.author.displayAvatarURL() })
        .setTitle("📝 Message Edited")
        .setDescription(`Message edited in <#${oldMessage.channel.id}>. [Jump to Message](${newMessage.url})`)
        .addFields(
          { name: "Before", value: oldMessage.content ? oldMessage.content.slice(0, 1024) : "*None*" },
          { name: "After", value: newMessage.content ? newMessage.content.slice(0, 1024) : "*None*" }
        )
        .setColor(client.config.colors.secondary)
        .setFooter({ text: `User ID: ${oldMessage.author.id}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    },

    // Message Delete
    messageDelete: async (client, message) => {
      if (message.author?.bot || !message.guild) return;

      const guildId = message.guild.id;
      const logChannelId = client.db.getSetting(guildId, "logs_channel_id");
      if (!logChannelId) return;

      const logChannel = message.guild.channels.cache.get(logChannelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setTitle("🗑️ Message Deleted")
        .setDescription(`Message deleted in <#${message.channel.id}>.`)
        .addFields(
          { name: "Content", value: message.content ? message.content.slice(0, 1024) : "*None*" }
        )
        .setColor(client.config.colors.error)
        .setFooter({ text: `User ID: ${message.author.id}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    },

    // Member Join
    guildMemberAdd: async (client, member) => {
      const guildId = member.guild.id;
      const logChannelId = client.db.getSetting(guildId, "logs_channel_id");
      if (!logChannelId) return;

      const logChannel = member.guild.channels.cache.get(logChannelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle("📥 Member Joined")
        .setDescription(`<@${member.id}> joined the server.`)
        .addFields(
          { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setColor(client.config.colors.success)
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    },

    // Member Leave
    guildMemberRemove: async (client, member) => {
      const guildId = member.guild.id;
      const logChannelId = client.db.getSetting(guildId, "logs_channel_id");
      if (!logChannelId) return;

      const logChannel = member.guild.channels.cache.get(logChannelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle("📤 Member Left")
        .setDescription(`${member.user.tag} left the server.`)
        .setColor(client.config.colors.neutral)
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    },

    // Voice State Update
    voiceStateUpdate: async (client, oldState, newState) => {
      const member = newState.member;
      if (!member || member.user.bot) return;

      const guildId = newState.guild.id;
      const logChannelId = client.db.getSetting(guildId, "logs_channel_id");
      if (!logChannelId) return;

      const logChannel = newState.guild.channels.cache.get(logChannelId);
      if (!logChannel) return;

      let title = "";
      let desc = "";
      let color = client.config.colors.neutral;

      if (!oldState.channelId && newState.channelId) {
        title = "🔊 Voice Join";
        desc = `<@${member.id}> joined voice channel <#${newState.channelId}>.`;
        color = client.config.colors.success;
      } else if (oldState.channelId && !newState.channelId) {
        title = "🔇 Voice Leave";
        desc = `<@${member.id}> left voice channel <#${oldState.channelId}>.`;
        color = client.config.colors.error;
      } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        title = "🔀 Voice Switch";
        desc = `<@${member.id}> moved from voice channel <#${oldState.channelId}> to <#${newState.channelId}>.`;
        color = client.config.colors.secondary;
      } else {
        return; // Ignore other updates (mute, deafen, stream, video etc)
      }

      const embed = new EmbedBuilder()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
