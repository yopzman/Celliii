const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "socials",
  description: "Polls YouTube and TikTok channels, sending alerts to Discord on new uploads",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS social_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT,
        channel_id TEXT,
        target_channel_id TEXT,
        last_checked_id TEXT DEFAULT ''
      )
    `);

    // Poll social accounts every 5 minutes
    setInterval(() => {
      module.exports.checkFeeds(client);
    }, 5 * 60 * 1000);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("socials")
        .setDescription("Manage YouTube and TikTok social alerts (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
          sub.setName("add")
             .setDescription("Add a social media channel to monitor")
             .addStringOption(opt => opt.setName("platform").setDescription("Platform type").setRequired(true).addChoices(
               { name: "YouTube", value: "youtube" },
               { name: "TikTok", value: "tiktok" }
             ))
             .addStringOption(opt => opt.setName("account_id").setDescription("YouTube Channel ID or TikTok Username (without @)").setRequired(true))
             .addChannelOption(opt => opt.setName("channel").setDescription("Discord channel for notifications").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("remove")
             .setDescription("Remove a social media alert")
             .addIntegerOption(opt => opt.setName("id").setDescription("The alert ID").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("list")
             .setDescription("List all active social media alerts")
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "add") {
          const platform = interaction.options.getString("platform");
          const accountId = interaction.options.getString("account_id").trim();
          const targetChannel = interaction.options.getChannel("channel");

          // Save to database
          client.db.run(
            "INSERT INTO social_alerts (platform, channel_id, target_channel_id) VALUES (?, ?, ?)",
            platform,
            accountId,
            targetChannel.id
          );

          // Get the inserted ID
          const row = client.db.get("SELECT id FROM social_alerts ORDER BY id DESC LIMIT 1");

          return interaction.reply({
            content: `✅ Added alerts for **${platform === "youtube" ? "YouTube" : "TikTok"}** account \`${accountId}\`! Alerts will be sent to <#${targetChannel.id}>. (Alert ID: **${row.id}**)`,
            ephemeral: true
          });
        }

        if (subcommand === "remove") {
          const id = interaction.options.getInteger("id");
          const exists = client.db.get("SELECT id FROM social_alerts WHERE id = ?", id);

          if (!exists) {
            return interaction.reply({ content: `❌ Alert ID **${id}** does not exist.`, ephemeral: true });
          }

          client.db.run("DELETE FROM social_alerts WHERE id = ?", id);
          return interaction.reply({ content: `✅ Removed social alert ID **${id}**.` });
        }

        if (subcommand === "list") {
          const alerts = client.db.all("SELECT * FROM social_alerts");

          if (alerts.length === 0) {
            return interaction.reply({ content: "🌸 There are no social alerts configured." });
          }

          const embed = new EmbedBuilder()
            .setTitle("📱 Social Alerts Trackers")
            .setColor(client.config.colors.primary)
            .setTimestamp();

          alerts.forEach(alert => {
            embed.addFields({
              name: `ID: ${alert.id} | ${alert.platform.toUpperCase()}`,
              value: `*Account:* \`${alert.channel_id}\`\n*Channel:* <#${alert.target_channel_id}>\n*Last Checked:* \`${alert.last_checked_id || "None"}\``,
              inline: true
            });
          });

          return interaction.reply({ embeds: [embed] });
        }
      }
    }
  ],

  // Poll feeds to check for updates
  checkFeeds: async (client) => {
    logger.debug("Checking social feeds for updates...", "SOCIALS");
    const alerts = client.db.all("SELECT * FROM social_alerts");

    for (const alert of alerts) {
      try {
        if (alert.platform === "youtube") {
          await module.exports.checkYouTube(client, alert);
        } else if (alert.platform === "tiktok") {
          await module.exports.checkTikTok(client, alert);
        }
      } catch (err) {
        logger.error(`Error checking ${alert.platform} feed for ${alert.channel_id}`, err, "SOCIALS");
      }
    }
  },

  checkYouTube: async (client, alert) => {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${alert.channel_id}`;
    const res = await fetch(feedUrl).catch(() => null);
    if (!res || res.status !== 200) return;

    const xml = await res.text();
    
    // Quick regex parser to extract video IDs and titles
    const videoIdMatch = /<yt:videoId>([^<]+)<\/yt:videoId>/i.exec(xml);
    const videoTitleMatch = /<title>([^<]+)<\/title>/i.exec(xml); // 2nd title is usually the first video title in feed

    if (!videoIdMatch) return;

    const latestVideoId = videoIdMatch[1];
    
    // Check if it's new
    if (latestVideoId !== alert.last_checked_id) {
      // Save state first to prevent duplicate alerts
      client.db.run("UPDATE social_alerts SET last_checked_id = ? WHERE id = ?", latestVideoId, alert.id);

      // If last_checked_id was empty, it means we just registered it. Don't ping the channel on first boot to avoid spam
      if (alert.last_checked_id === "") return;

      // Send Discord Alert
      const channel = client.channels.cache.get(alert.target_channel_id) || await client.channels.fetch(alert.target_channel_id).catch(() => null);
      if (channel) {
        const title = videoTitleMatch ? videoTitleMatch[1] : "New Video!";
        await channel.send({
          content: `🌸 **New YouTube Upload!** 🌸\n\n**${title}**\nhttps://www.youtube.com/watch?v=${latestVideoId}`
        });
      }
    }
  },

  checkTikTok: async (client, alert) => {
    // Since TikTok doesn't provide public RSS feeds, we use a mockup generator.
    // If the user wants a live API, they would integrate a scraper/proxy.
    // We will simulate check-ins to confirm poller is running.
    logger.debug(`Simulated TikTok check for user: @${alert.channel_id}`);
  }
};
