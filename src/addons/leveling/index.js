const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const canvasHelper = require("../../utils/canvasHelper");
const logger = require("../../utils/logger");

const getXpNeeded = (level) => {
  return 5 * (level * level) + 50 * level + 100;
};

module.exports = {
  name: "leveling",
  description: "Text-activity experience tracker, leaderboards, and custom rank cards",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS leveling (
        guild_id TEXT,
        user_id TEXT,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        last_message INTEGER DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `);
  },

  commands: [
    // RANK CARD
    {
      data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("View your current leveling rank card")
        .addUserOption(opt => opt.setName("user").setDescription("The user to check").setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user") || interaction.user;
        const guildId = interaction.guild.id;

        if (user.bot) {
          return interaction.reply({ content: "❌ Bots do not have leveling stats.", ephemeral: true });
        }

        await interaction.deferReply();

        // Ensure user entry
        client.db.run(
          "INSERT OR IGNORE INTO leveling (guild_id, user_id, xp, level, last_message) VALUES (?, ?, 0, 0, 0)",
          guildId,
          user.id
        );

        const data = client.db.get("SELECT xp, level FROM leveling WHERE guild_id = ? AND user_id = ?", guildId, user.id);

        // Calculate Rank position
        const ranks = client.db.all(
          "SELECT user_id FROM leveling WHERE guild_id = ? ORDER BY xp DESC",
          guildId
        );
        const rankPos = ranks.findIndex(r => r.user_id === user.id) + 1;

        const currentXp = data.xp;
        const level = data.level;
        const requiredXp = getXpNeeded(level);

        const username = user.username;
        const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });

        // Draw Rank Card
        const cardBuffer = await canvasHelper.createRankCard(username, avatarUrl, currentXp, requiredXp, level, rankPos);

        if (cardBuffer) {
          const attachment = new AttachmentBuilder(cardBuffer, { name: "rank-card.png" });
          return interaction.editReply({ files: [attachment] });
        } else {
          // Fallback simple embed if canvas fails
          const embed = new EmbedBuilder()
            .setTitle(`🌸 Level Rank Info: ${user.username}`)
            .setDescription(`Rank: **#${rankPos}**\nLevel: **${level}**\nXP: **${currentXp} / ${requiredXp}**`)
            .setColor(client.config.colors.primary);
          return interaction.editReply({ embeds: [embed] });
        }
      }
    },

    // LEADERBOARD
    {
      data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the server leveling leaderboard"),
      execute: async (client, interaction) => {
        const guildId = interaction.guild.id;

        const leaders = client.db.all(
          "SELECT user_id, xp, level FROM leveling WHERE guild_id = ? ORDER BY xp DESC LIMIT 10",
          guildId
        );

        if (leaders.length === 0) {
          return interaction.reply("🌸 No active chat activity recorded yet.");
        }

        const embed = new EmbedBuilder()
          .setTitle(`🌸 ${interaction.guild.name} Level Leaderboard`)
          .setDescription("Top active members in our community chat! 🏆\n")
          .setColor(client.config.colors.primary)
          .setThumbnail(interaction.guild.iconURL())
          .setTimestamp();

        let listText = "";
        for (let i = 0; i < leaders.length; i++) {
          const leader = leaders[i];
          const user = await client.users.fetch(leader.user_id).catch(() => null);
          const name = user ? user.username : `User (${leader.user_id})`;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`#${i+1}\``;
          listText += `${medal} **${name}** - Level **${leader.level}** (XP: \`${leader.xp}\`)\n`;
        }

        embed.setDescription(embed.data.description + listText);

        return interaction.reply({ embeds: [embed] });
      }
    }
  ],

  events: {
    messageCreate: async (client, message) => {
      // Ignore bots, system, or DMs
      if (!message.guild || message.author.bot || message.system) return;

      const guildId = message.guild.id;
      const userId = message.author.id;

      // Ensure user database entry
      client.db.run(
        "INSERT OR IGNORE INTO leveling (guild_id, user_id, xp, level, last_message) VALUES (?, ?, 0, 0, 0)",
        guildId,
        userId
      );

      const data = client.db.get("SELECT xp, level, last_message FROM leveling WHERE guild_id = ? AND user_id = ?", guildId, userId);
      const now = Date.now();

      // Cooldown to prevent spamming: 60 seconds
      if (now - data.last_message < 60000) return;

      const xpEarned = Math.floor(Math.random() * 11) + 15; // 15 to 25 XP
      let newXp = data.xp + xpEarned;
      let level = data.level;
      let leveledUp = false;

      // Check level up
      let xpNeeded = getXpNeeded(level);
      while (newXp >= xpNeeded) {
        newXp -= xpNeeded;
        level += 1;
        xpNeeded = getXpNeeded(level);
        leveledUp = true;
      }

      // Update database
      client.db.run(
        "UPDATE leveling SET xp = ?, level = ?, last_message = ? WHERE guild_id = ? AND user_id = ?",
        newXp,
        level,
        now,
        guildId,
        userId
      );

      // Level up announcement
      if (leveledUp) {
        const embed = new EmbedBuilder()
          .setTitle("🌸 Level UP! 🌸")
          .setDescription(`🎉 Congratulations <@${userId}>! You reached **Level ${level}**! ✨\nKeep chatting to level up more!`)
          .setColor(client.config.colors.success)
          .setThumbnail(message.author.displayAvatarURL())
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
};
