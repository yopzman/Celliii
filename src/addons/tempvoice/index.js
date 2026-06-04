const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "tempvoice",
  description: "Creates temporary 'Join to Create' voice channels that self-delete when empty",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS temp_voice (
        channel_id TEXT PRIMARY KEY,
        owner_id TEXT,
        guild_id TEXT
      )
    `);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("tempvoice")
        .setDescription("Configure temporary voice settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set up the Join to Create voice room")
             .addChannelOption(opt =>
               opt.setName("channel")
                  .setDescription("The voice channel members join to create a room")
                  .addChannelTypes(ChannelType.GuildVoice)
                  .setRequired(true)
             )
        ),
      execute: async (client, interaction) => {
        const channel = interaction.options.getChannel("channel");
        const categoryId = channel.parentId;
        const guildId = interaction.guild.id;

        client.db.setSetting(guildId, "tempvoice_channel_id", channel.id);
        if (categoryId) {
          client.db.setSetting(guildId, "tempvoice_category_id", categoryId);
        }

        return interaction.reply({
          content: `✅ Temporary Voice Room configured! Members joining <#${channel.id}> will now get their own rooms.`,
          ephemeral: true
        });
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName("voice")
        .setDescription("Manage your active temporary voice room")
        .addSubcommand(sub =>
          sub.setName("lock")
             .setDescription("Lock your voice room so others cannot join")
        )
        .addSubcommand(sub =>
          sub.setName("unlock")
             .setDescription("Unlock your voice room")
        )
        .addSubcommand(sub =>
          sub.setName("limit")
             .setDescription("Set a user limit for your voice room")
             .addIntegerOption(opt =>
               opt.setName("count")
                  .setDescription("User limit (0 to remove)")
                  .setRequired(true)
                  .setMinValue(0)
                  .setMaxValue(99)
             )
        )
        .addSubcommand(sub =>
          sub.setName("name")
             .setDescription("Rename your voice room")
             .addStringOption(opt =>
               opt.setName("title")
                  .setDescription("New name for the room")
                  .setRequired(true)
             )
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Check if user is in their voice channel
        const voiceState = interaction.member.voice;
        if (!voiceState.channelId) {
          return interaction.reply({ content: "❌ You must be in a voice channel to use this command.", ephemeral: true });
        }

        const room = client.db.get("SELECT * FROM temp_voice WHERE channel_id = ? AND owner_id = ?", voiceState.channelId, userId);
        if (!room) {
          return interaction.reply({ content: "❌ You are not the owner of this temporary voice room!", ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(voiceState.channelId);
        if (!channel) return;

        if (subcommand === "lock") {
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: false
          });
          return interaction.reply({ content: "🔒 Your voice room has been **locked**." });
        }

        if (subcommand === "unlock") {
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            Connect: true
          });
          return interaction.reply({ content: "🔓 Your voice room has been **unlocked**." });
        }

        if (subcommand === "limit") {
          const limit = interaction.options.getInteger("count");
          await channel.setUserLimit(limit);
          return interaction.reply({ content: limit === 0 ? "✨ Removed user limit." : `👥 Set user limit to **${limit}**.` });
        }

        if (subcommand === "name") {
          const name = interaction.options.getString("title");
          await channel.setName(`🌸 ${name}`);
          return interaction.reply({ content: `✅ Renamed your voice room to: **🌸 ${name}**.` });
        }
      }
    }
  ],

  events: {
    voiceStateUpdate: async (client, oldState, newState) => {
      const guildId = newState.guild.id;
      const setupChannelId = client.db.getSetting(guildId, "tempvoice_channel_id");
      if (!setupChannelId) return;

      // 1. Check if joining "Join to Create" channel
      if (newState.channelId === setupChannelId) {
        const member = newState.member;
        const categoryId = client.db.getSetting(guildId, "tempvoice_category_id");

        try {
          const tempChannel = await newState.guild.channels.create({
            name: `🌸 ${member.user.username}'s Room`,
            type: ChannelType.GuildVoice,
            parent: categoryId || null,
            permissionOverwrites: [
              {
                id: member.id,
                allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers]
              }
            ]
          });

          // Move user
          await member.voice.setChannel(tempChannel);

          // Save in DB
          client.db.run(
            "INSERT INTO temp_voice (channel_id, owner_id, guild_id) VALUES (?, ?, ?)",
            tempChannel.id,
            member.id,
            guildId
          );
        } catch (err) {
          logger.error("Failed to create temporary voice room", err, "TEMP_VOICE");
        }
      }

      // 2. Check if leaving a temporary voice channel
      if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const room = client.db.get("SELECT channel_id FROM temp_voice WHERE channel_id = ?", oldState.channelId);
        if (room) {
          const channel = oldState.guild.channels.cache.get(oldState.channelId);
          if (channel && channel.members.size === 0) {
            // Delete channel
            try {
              await channel.delete();
              client.db.run("DELETE FROM temp_voice WHERE channel_id = ?", oldState.channelId);
            } catch (err) {
              logger.error(`Failed to delete empty temporary voice room ${oldState.channelId}`, err, "TEMP_VOICE");
            }
          }
        }
      }
    }
  }
};
