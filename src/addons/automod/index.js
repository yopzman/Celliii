const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const spamTrackers = new Map();
const DEFAULT_BAD_WORDS = ["scam", "discord.gg/free-nitro", "hack", "exploit", "crap", "fuck", "shit", "bitch", "asshole"];

module.exports = {
  name: "automod",
  description: "Automated filters for bad words and message spamming",
  isEnabled: true,

  init: async (client) => {
    // Addon specific database tables (none needed since we use client.db's general key-value settings)
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("automod")
        .setDescription("Configure AutoMod settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("status")
             .setDescription("Check current AutoMod status")
        )
        .addSubcommand(sub =>
          sub.setName("toggle")
             .setDescription("Toggle AutoMod features")
             .addStringOption(opt =>
               opt.setName("feature")
                  .setDescription("Feature to toggle")
                  .setRequired(true)
                  .addChoices(
                    { name: "Spam Filter", value: "spam" },
                    { name: "Bad Words Filter", value: "words" }
                  )
             )
             .addBooleanOption(opt =>
               opt.setName("enabled")
                  .setDescription("Enable or disable this feature")
                  .setRequired(true)
             )
        )
        .addSubcommand(sub =>
          sub.setName("words")
             .setDescription("Manage the filtered bad words list")
             .addStringOption(opt =>
               opt.setName("action")
                  .setDescription("Action to take")
                  .setRequired(true)
                  .addChoices(
                    { name: "Add Word", value: "add" },
                    { name: "Remove Word", value: "remove" },
                    { name: "List Words", value: "list" }
                  )
             )
             .addStringOption(opt =>
               opt.setName("word")
                  .setDescription("The word to add or remove")
                  .setRequired(false)
             )
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "status") {
          const spamEnabled = client.db.getSetting(guildId, "automod_spam_enabled", "true") === "true";
          const wordsEnabled = client.db.getSetting(guildId, "automod_words_enabled", "true") === "true";
          const rawWords = client.db.getSetting(guildId, "automod_bad_words", DEFAULT_BAD_WORDS.join(","));
          const wordsList = rawWords.split(",").filter(w => w.trim().length > 0);

          const embed = new EmbedBuilder()
            .setTitle("🛡️ Celliii AutoMod Panel")
            .setDescription("AutoMod is keeping your server safe! 🌸")
            .addFields(
              { name: "⏳ Spam Prevention", value: spamEnabled ? "🟢 **Enabled** (Max 5 msgs in 3s)" : "🔴 **Disabled**", inline: true },
              { name: "🤬 Bad Words Filter", value: wordsEnabled ? "🟢 **Enabled**" : "🔴 **Disabled**", inline: true },
              { name: "📋 Filtered Words count", value: `**${wordsList.length}** words`, inline: true }
            )
            .setColor(client.config.colors.primary)
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === "toggle") {
          const feature = interaction.options.getString("feature");
          const enabled = interaction.options.getBoolean("enabled");
          
          client.db.setSetting(guildId, `automod_${feature}_enabled`, enabled ? "true" : "false");
          return interaction.reply({ content: `✅ ${feature === "spam" ? "Spam filter" : "Bad Words filter"} has been ${enabled ? "**enabled**" : "**disabled**"}.` });
        }

        if (subcommand === "words") {
          const action = interaction.options.getString("action");
          const word = interaction.options.getString("word");
          
          const rawWords = client.db.getSetting(guildId, "automod_bad_words", DEFAULT_BAD_WORDS.join(","));
          let wordsList = rawWords.split(",").map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

          if (action === "list") {
            const wordListStr = wordsList.length > 0 ? wordsList.map(w => `\`${w}\``).join(", ") : "No bad words filtered.";
            const embed = new EmbedBuilder()
              .setTitle("🤬 Filtered Bad Words")
              .setDescription(wordListStr)
              .setColor(client.config.colors.neutral);
            return interaction.reply({ embeds: [embed] });
          }

          if (!word) {
            return interaction.reply({ content: "❌ You must specify a word for this action.", ephemeral: true });
          }

          const targetWord = word.trim().toLowerCase();

          if (action === "add") {
            if (wordsList.includes(targetWord)) {
              return interaction.reply({ content: `❌ \`${targetWord}\` is already in the bad words list.` });
            }
            wordsList.push(targetWord);
            client.db.setSetting(guildId, "automod_bad_words", wordsList.join(","));
            return interaction.reply({ content: `✅ Added \`${targetWord}\` to the bad words list.` });
          }

          if (action === "remove") {
            if (!wordsList.includes(targetWord)) {
              return interaction.reply({ content: `❌ \`${targetWord}\` is not in the bad words list.` });
            }
            wordsList = wordsList.filter(w => w !== targetWord);
            client.db.setSetting(guildId, "automod_bad_words", wordsList.join(","));
            return interaction.reply({ content: `✅ Removed \`${targetWord}\` from the bad words list.` });
          }
        }
      }
    }
  ],

  events: {
    messageCreate: async (client, message) => {
      // Ignore bots, DMs, or server administrators
      if (!message.guild || message.author.bot || message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

      const guildId = message.guild.id;
      const userId = message.author.id;

      // 1. Spam Prevention Check
      const spamEnabled = client.db.getSetting(guildId, "automod_spam_enabled", "true") === "true";
      if (spamEnabled) {
        const key = `${userId}-${guildId}`;
        const now = Date.now();
        
        if (!spamTrackers.has(key)) {
          spamTrackers.set(key, []);
        }

        const timestamps = spamTrackers.get(key);
        // Keep logs within last 3 seconds
        const recentTimestamps = timestamps.filter(t => now - t < 3000);
        recentTimestamps.push(now);
        spamTrackers.set(key, recentTimestamps);

        if (recentTimestamps.length > 5) {
          // Trigger Spam Action: delete message and mute user temporarily
          try {
            await message.delete().catch(() => {});
          } catch {}

          // Mute (timeout) for 5 minutes
          const member = await message.guild.members.fetch(userId).catch(() => null);
          if (member && member.moderatable && !member.communicationDisabledUntilTimestamp) {
            await member.timeout(5 * 60 * 1000, "AutoMod: Spamming messages");
            
            const warnEmbed = new EmbedBuilder()
              .setTitle("⚠️ Warning")
              .setDescription(`❌ <@${userId}>, you have been timed out for 5 minutes due to spamming!`)
              .setColor(client.config.colors.error);

            return message.channel.send({ content: `<@${userId}>`, embeds: [warnEmbed] }).then(msg => {
              setTimeout(() => msg.delete().catch(() => {}), 10000);
            });
          }
        }
      }

      // 2. Bad Words Filtering Check
      const wordsEnabled = client.db.getSetting(guildId, "automod_words_enabled", "true") === "true";
      if (wordsEnabled) {
        const rawWords = client.db.getSetting(guildId, "automod_bad_words", DEFAULT_BAD_WORDS.join(","));
        const wordsList = rawWords.split(",").map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

        if (wordsList.length > 0) {
          const contentLower = message.content.toLowerCase();
          const containsBadWord = wordsList.some(word => {
            // Regex to match complete word or isolated string patterns
            const regex = new RegExp(`\\b${word}\\b|${word}`, "i");
            return regex.test(contentLower);
          });

          if (containsBadWord) {
            try {
              await message.delete().catch(() => {});
            } catch {}

            const warnEmbed = new EmbedBuilder()
              .setTitle("🌸 Keep it Friendly! 🌸")
              .setDescription(`⚠️ <@${userId}>, your message was deleted because it contained a filtered word! Please keep the chat clean.`)
              .setColor(client.config.colors.warn);

            return message.channel.send({ content: `<@${userId}>`, embeds: [warnEmbed] }).then(msg => {
              setTimeout(() => msg.delete().catch(() => {}), 6000);
            });
          }
        }
      }
    }
  }
};
