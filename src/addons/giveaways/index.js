const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const logger = require("../../utils/logger");

function parseDuration(str) {
  const num = parseInt(str);
  if (isNaN(num)) return null;
  const unit = str.replace(num, "").trim().toLowerCase();
  if (unit === "s" || unit.startsWith("sec")) return num * 1000;
  if (unit === "m" || unit.startsWith("min")) return num * 60 * 1000;
  if (unit === "h" || unit.startsWith("hour")) return num * 60 * 60 * 1000;
  if (unit === "d" || unit.startsWith("day")) return num * 24 * 60 * 60 * 1000;
  return num * 60 * 1000; // default to minutes if unspecified
}

module.exports = {
  name: "giveaways",
  description: "Complete database-backed giveaway system with enter buttons",
  isEnabled: true,

  init: async (client) => {
    // Initialize DB tables
    client.db.run(`
      CREATE TABLE IF NOT EXISTS giveaways (
        message_id TEXT PRIMARY KEY,
        channel_id TEXT,
        guild_id TEXT,
        prize TEXT,
        winner_count INTEGER,
        end_time INTEGER,
        ended INTEGER DEFAULT 0
      )
    `);

    client.db.run(`
      CREATE TABLE IF NOT EXISTS giveaway_entries (
        message_id TEXT,
        user_id TEXT,
        PRIMARY KEY (message_id, user_id)
      )
    `);

    // Start periodic check timer (every 10 seconds)
    setInterval(() => {
      module.exports.checkGiveaways(client);
    }, 10000);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage server giveaways (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
          sub.setName("start")
             .setDescription("Start a new giveaway")
             .addStringOption(opt => opt.setName("duration").setDescription("Giveaway duration (e.g. 10m, 2h, 1d)").setRequired(true))
             .addIntegerOption(opt => opt.setName("winners").setDescription("Number of winners to roll").setRequired(true))
             .addStringOption(opt => opt.setName("prize").setDescription("The giveaway prize").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("end")
             .setDescription("End an active giveaway immediately")
             .addStringOption(opt => opt.setName("message_id").setDescription("The giveaway message ID").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("reroll")
             .setDescription("Reroll winners for an ended giveaway")
             .addStringOption(opt => opt.setName("message_id").setDescription("The giveaway message ID").setRequired(true))
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "start") {
          const durationStr = interaction.options.getString("duration");
          const winners = interaction.options.getInteger("winners");
          const prize = interaction.options.getString("prize");

          const ms = parseDuration(durationStr);
          if (!ms) {
            return interaction.reply({ content: "❌ Invalid duration format! Use formats like `10s`, `5m`, `2h`, or `1d`.", ephemeral: true });
          }

          const endTime = Date.now() + ms;

          const embed = new EmbedBuilder()
            .setTitle(`🎉 GIVEAWAY: ${prize} 🎉`)
            .setDescription(`React with the button below to enter!\n\n⏳ **Ends:** <t:${Math.floor(endTime / 1000)}:R>\n👤 **Hosted by:** <@${interaction.user.id}>\n🏆 **Winners:** ${winners}`)
            .setColor(client.config.colors.primary)
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("giveaway_enter")
              .setLabel("Enter 🎉")
              .setStyle(ButtonStyle.Primary)
          );

          await interaction.reply({ content: "Starting giveaway...", ephemeral: true });
          const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

          client.db.run(
            "INSERT INTO giveaways (message_id, channel_id, guild_id, prize, winner_count, end_time) VALUES (?, ?, ?, ?, ?, ?)",
            msg.id,
            interaction.channel.id,
            guildId,
            prize,
            winners,
            endTime
          );

          return interaction.editReply(`✅ Giveaway started in <#${interaction.channel.id}>.`);
        }

        if (subcommand === "end") {
          const messageId = interaction.options.getString("message_id");
          const gway = client.db.get("SELECT * FROM giveaways WHERE message_id = ? AND ended = 0", messageId);
          
          if (!gway) {
            return interaction.reply({ content: "❌ No active giveaway found with that message ID.", ephemeral: true });
          }

          // Force update time to end now and process immediately
          client.db.run("UPDATE giveaways SET end_time = ? WHERE message_id = ?", Date.now() - 1, messageId);
          await interaction.reply({ content: "⏳ Ending giveaway immediately...", ephemeral: true });
          await module.exports.checkGiveaways(client);
          return interaction.editReply("✅ Giveaway ended.");
        }

        if (subcommand === "reroll") {
          const messageId = interaction.options.getString("message_id");
          const gway = client.db.get("SELECT * FROM giveaways WHERE message_id = ? AND ended = 1", messageId);

          if (!gway) {
            return interaction.reply({ content: "❌ No completed giveaway found with that message ID.", ephemeral: true });
          }

          await interaction.reply({ content: "🎲 Rerolling winners...", ephemeral: true });
          
          const rolled = await module.exports.rollWinners(client, gway, true);
          if (rolled) {
            return interaction.editReply("✅ Rerolled winners successfully!");
          } else {
            return interaction.editReply("❌ Failed to reroll. No entries found for this giveaway.");
          }
        }
      }
    }
  ],

  events: {
    interactionCreate: async (client, interaction) => {
      if (!interaction.isButton() || interaction.customId !== "giveaway_enter") return;

      const messageId = interaction.message.id;
      const userId = interaction.user.id;

      // Check if giveaway is active
      const gway = client.db.get("SELECT ended FROM giveaways WHERE message_id = ?", messageId);
      if (!gway || gway.ended === 1) {
        return interaction.reply({ content: "❌ This giveaway has already ended!", ephemeral: true });
      }

      // Check existing entry
      const exists = client.db.get("SELECT user_id FROM giveaway_entries WHERE message_id = ? AND user_id = ?", messageId, userId);

      if (exists) {
        // Toggle entry (leave giveaway)
        client.db.run("DELETE FROM giveaway_entries WHERE message_id = ? AND user_id = ?", messageId, userId);
        return interaction.reply({ content: "❌ You have left the giveaway.", ephemeral: true });
      } else {
        // Join giveaway
        client.db.run("INSERT INTO giveaway_entries (message_id, user_id) VALUES (?, ?)", messageId, userId);
        return interaction.reply({ content: "🎉 You have entered the giveaway successfully! Good luck! 🌸", ephemeral: true });
      }
    }
  },

  // Process giveaways that have reached their target time
  checkGiveaways: async (client) => {
    const active = client.db.all("SELECT * FROM giveaways WHERE ended = 0 AND end_time <= ?", Date.now());
    for (const gway of active) {
      try {
        await module.exports.rollWinners(client, gway, false);
      } catch (err) {
        logger.error(`Error ending giveaway ${gway.message_id}`, err, "GIVEAWAYS");
      }
    }
  },

  // Perform rolling logic
  rollWinners: async (client, gway, isReroll = false) => {
    const entries = client.db.all("SELECT user_id FROM giveaway_entries WHERE message_id = ?", gway.message_id);

    const channel = client.channels.cache.get(gway.channel_id) || await client.channels.fetch(gway.channel_id).catch(() => null);
    if (!channel) return false;

    const msg = await channel.messages.fetch(gway.message_id).catch(() => null);
    if (!msg) return false;

    // Mark as ended in DB
    client.db.run("UPDATE giveaways SET ended = 1 WHERE message_id = ?", gway.message_id);

    if (entries.length === 0) {
      const emptyEmbed = EmbedBuilder.from(msg.embeds[0])
        .setDescription(`⚠️ **Ended**\n\nNo entries were recorded for this giveaway.`)
        .setColor(client.config.colors.neutral);

      await msg.edit({ embeds: [emptyEmbed], components: [] });
      await channel.send(`⚠️ No entries for giveaway: **${gway.prize}** (Message ID: ${gway.message_id}).`);
      return false;
    }

    // Select random winners
    const winners = [];
    const entryIds = entries.map(e => e.user_id);
    const rollsCount = Math.min(gway.winner_count, entryIds.length);

    for (let i = 0; i < rollsCount; i++) {
      const idx = Math.floor(Math.random() * entryIds.length);
      winners.push(entryIds.splice(idx, 1)[0]);
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(", ");

    const endEmbed = EmbedBuilder.from(msg.embeds[0])
      .setDescription(`🎉 **Ended**\n\n🏆 **Winners:** ${winnerMentions}\n👤 **Hosted by:** ${msg.embeds[0].description.match(/<@\d+>/)[0]}`)
      .setColor(client.config.colors.neutral);

    await msg.edit({ embeds: [endEmbed], components: [] });

    await channel.send({
      content: `🎉 ${isReroll ? "Reroll complete!" : "Congratulations!"} ${winnerMentions} won **${gway.prize}**! 🌸`
    });

    return true;
  }
};
