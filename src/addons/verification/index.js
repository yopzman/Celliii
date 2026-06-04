const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "verification",
  description: "Simple verification panel to grant members entry roles",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Configure verification settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set up the verification system in a channel")
             .addChannelOption(opt =>
               opt.setName("channel")
                  .setDescription("The channel to send the verification panel to")
                  .setRequired(true)
             )
             .addRoleOption(opt =>
               opt.setName("role")
                  .setDescription("The role to grant upon verification")
                  .setRequired(true)
             )
        ),
      execute: async (client, interaction) => {
        const channel = interaction.options.getChannel("channel");
        const role = interaction.options.getRole("role");
        const guildId = interaction.guild.id;

        // Store setup parameters in DB
        client.db.setSetting(guildId, "verification_role_id", role.id);
        client.db.setSetting(guildId, "verification_channel_id", channel.id);

        const embed = new EmbedBuilder()
          .setTitle("🌸 Verification Panel 🌸")
          .setDescription("Welcome! Please click the button below to verify yourself and unlock the rest of the server channels! ✨")
          .setColor(client.config.colors.primary)
          .setThumbnail(client.user.displayAvatarURL());

        const button = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("verify_member")
            .setLabel("Verify 🌸")
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [embed], components: [button] });

        return interaction.reply({
          content: `✅ Verification system configured successfully! Sent panel to <#${channel.id}>. Role to grant: **${role.name}**.`,
          ephemeral: true
        });
      }
    }
  ],

  events: {
    interactionCreate: async (client, interaction) => {
      if (!interaction.isButton() || interaction.customId !== "verify_member") return;

      await interaction.deferReply({ ephemeral: true });
      const guildId = interaction.guild.id;
      const roleId = client.db.getSetting(guildId, "verification_role_id");

      if (!roleId) {
        return interaction.editReply({
          content: "❌ Verification is not configured on this server yet. Please contact an administrator."
        });
      }

      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        return interaction.editReply({
          content: "❌ The verification role no longer exists. Please contact an administrator."
        });
      }

      const member = interaction.member;
      if (member.roles.cache.has(roleId)) {
        return interaction.editReply({
          content: "🌸 You are already verified!"
        });
      }

      try {
        await member.roles.add(role);
        return interaction.editReply({
          content: "🎉 Congratulations! You have been verified successfully. Welcome to the server! 🌸"
        });
      } catch (error) {
        logger.error(`Failed to grant verification role to ${interaction.user.tag}`, error, "VERIFICATION");
        return interaction.editReply({
          content: "❌ Failed to assign verification role. Make sure the bot's role is placed above the verification role in server settings!"
        });
      }
    }
  }
};
