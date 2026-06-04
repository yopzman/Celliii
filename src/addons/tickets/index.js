const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "tickets",
  description: "Interactive ticket support system with logging and panels",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT,
        user_id TEXT,
        status TEXT,
        created_at INTEGER
      )
    `);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("tickets")
        .setDescription("Configure tickets settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set up the ticket panel")
             .addChannelOption(opt => opt.setName("channel").setDescription("The channel to send the ticket panel to").setRequired(true))
             .addChannelOption(opt => opt.setName("category").setDescription("The category to create tickets under").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
             .addChannelOption(opt => opt.setName("log_channel").setDescription("The channel for ticket closing logs").setRequired(true))
        ),
      execute: async (client, interaction) => {
        const channel = interaction.options.getChannel("channel");
        const category = interaction.options.getChannel("category");
        const logChannel = interaction.options.getChannel("log_channel");
        const guildId = interaction.guild.id;

        client.db.setSetting(guildId, "tickets_category_id", category.id);
        client.db.setSetting(guildId, "tickets_log_channel_id", logChannel.id);

        const embed = new EmbedBuilder()
          .setTitle("🎟️ Support Ticket Desk")
          .setDescription("Need help? Click the button below to open a private support ticket and talk to our moderation staff! 🌸")
          .setColor(client.config.colors.primary)
          .setFooter({ text: "Celliii Support Ticket System" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_create")
            .setLabel("Open Ticket 🎟️")
            .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });

        return interaction.reply({
          content: `✅ Ticket system set up! Panel sent to <#${channel.id}>. Tickets will be created under category **${category.name}** and logged to <#${logChannel.id}>.`,
          ephemeral: true
        });
      }
    }
  ],

  events: {
    interactionCreate: async (client, interaction) => {
      if (!interaction.isButton()) return;

      const guildId = interaction.guild?.id;

      // 1. CREATE TICKET
      if (interaction.customId === "ticket_create") {
        await interaction.deferReply({ ephemeral: true });

        const categoryId = client.db.getSetting(guildId, "tickets_category_id");
        if (!categoryId) {
          return interaction.editReply("❌ Tickets are not fully configured yet. Staff needs to run `/tickets setup`.");
        }

        // Check if user already has an open ticket
        const existing = client.db.get(
          "SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'",
          guildId,
          interaction.user.id
        );

        if (existing) {
          const ch = interaction.guild.channels.cache.get(existing.channel_id);
          if (ch) {
            return interaction.editReply(`❌ You already have an open ticket in <#${ch.id}>!`);
          } else {
            // Clean up stale db record if channel was deleted manually
            client.db.run("DELETE FROM tickets WHERE channel_id = ?", existing.channel_id);
          }
        }

        // Create Channel
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            {
              // Allow anyone with Administrator
              id: interaction.guild.roles.premiumSubscriberRole ? interaction.guild.roles.premiumSubscriberRole.id : interaction.guild.id, // placeholder
              deny: [] // Will override with admin access natively
            }
          ]
        });

        // Save in DB
        client.db.run(
          "INSERT INTO tickets (channel_id, guild_id, user_id, status, created_at) VALUES (?, ?, ?, 'open', ?)",
          ticketChannel.id,
          guildId,
          interaction.user.id,
          Date.now()
        );

        // Welcome embed in ticket
        const ticketEmbed = new EmbedBuilder()
          .setTitle(`🎟️ Ticket Opened`)
          .setDescription(`Welcome <@${interaction.user.id}>! Please describe your issue in detail. A staff member will assist you shortly. 🌸`)
          .setColor(client.config.colors.success)
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_claim")
            .setLabel("Claim 🙋")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Close 🔒")
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `<@${interaction.user.id}> | Staff`, embeds: [ticketEmbed], components: [row] });

        return interaction.editReply(`✅ Ticket opened successfully in <#${ticketChannel.id}>!`);
      }

      // 2. CLAIM TICKET
      if (interaction.customId === "ticket_claim") {
        await interaction.deferReply({ ephemeral: false });

        // Update permissions so only claimer and owner can write
        const ticket = client.db.get("SELECT user_id, status FROM tickets WHERE channel_id = ?", interaction.channel.id);
        if (!ticket) return interaction.editReply("❌ This channel is not a registered ticket.");

        await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });

        const embed = new EmbedBuilder()
          .setDescription(`🙋 **This ticket has been claimed by <@${interaction.user.id}>.**`)
          .setColor(client.config.colors.secondary);

        // Disable Claim button
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_claim")
            .setLabel("Claimed 🙋")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Close 🔒")
            .setStyle(ButtonStyle.Danger)
        );

        await interaction.message.edit({ components: [disabledRow] });
        return interaction.editReply({ embeds: [embed] });
      }

      // 3. CLOSE TICKET
      if (interaction.customId === "ticket_close") {
        await interaction.reply("🔒 **Closing this ticket in 5 seconds...**");

        const ticket = client.db.get("SELECT user_id FROM tickets WHERE channel_id = ?", interaction.channel.id);
        if (!ticket) return;

        // Log close details
        const logChannelId = client.db.getSetting(guildId, "tickets_log_channel_id");
        if (logChannelId) {
          const logChannel = interaction.guild.channels.cache.get(logChannelId);
          if (logChannel) {
            // Collect messages for simple transcript
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const transcript = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleTimeString()}] ${m.author.tag}: ${m.content}`).join("\n");
            
            const buffer = Buffer.from(transcript, "utf-8");
            const attachment = new AttachmentBuilder(buffer, { name: `transcript-${interaction.channel.name}.txt` });

            const logEmbed = new EmbedBuilder()
              .setTitle("🎟️ Ticket Closed")
              .addFields(
                { name: "Channel", value: interaction.channel.name, inline: true },
                { name: "Opened By", value: `<@${ticket.user_id}>`, inline: true },
                { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true }
              )
              .setColor(client.config.colors.error)
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(() => {});
          }
        }

        client.db.run("DELETE FROM tickets WHERE channel_id = ?", interaction.channel.id);

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
      }
    }
  }
};
