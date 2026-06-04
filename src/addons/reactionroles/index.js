const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const logger = require("../../utils/logger");

module.exports = {
  name: "reactionroles",
  description: "Create button panels that grant or remove roles when clicked",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("reactionrole")
        .setDescription("Create a button-based reaction role panel (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName("channel").setDescription("The channel to send the panel to").setRequired(true))
        .addStringOption(opt => opt.setName("title").setDescription("Embed title").setRequired(true))
        .addStringOption(opt => opt.setName("description").setDescription("Embed description").setRequired(true))
        .addRoleOption(opt => opt.setName("role1").setDescription("Role #1").setRequired(true))
        .addStringOption(opt => opt.setName("label1").setDescription("Button Label #1").setRequired(true))
        .addRoleOption(opt => opt.setName("role2").setDescription("Role #2").setRequired(false))
        .addStringOption(opt => opt.setName("label2").setDescription("Button Label #2").setRequired(false))
        .addRoleOption(opt => opt.setName("role3").setDescription("Role #3").setRequired(false))
        .addStringOption(opt => opt.setName("label3").setDescription("Button Label #3").setRequired(false))
        .addRoleOption(opt => opt.setName("role4").setDescription("Role #4").setRequired(false))
        .addStringOption(opt => opt.setName("label4").setDescription("Button Label #4").setRequired(false))
        .addRoleOption(opt => opt.setName("role5").setDescription("Role #5").setRequired(false))
        .addStringOption(opt => opt.setName("label5").setDescription("Button Label #5").setRequired(false)),
      execute: async (client, interaction) => {
        const channel = interaction.options.getChannel("channel");
        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");

        const roles = [];
        for (let i = 1; i <= 5; i++) {
          const role = interaction.options.getRole(`role${i}`);
          const label = interaction.options.getString(`label${i}`);
          if (role && label) {
            roles.push({ roleId: role.id, label });
          }
        }

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(client.config.colors.primary)
          .setTimestamp();

        const row = new ActionRowBuilder();
        const btnStyles = [ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Success, ButtonStyle.Danger, ButtonStyle.Primary];

        roles.forEach((r, idx) => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`reactionrole_${r.roleId}`)
              .setLabel(r.label)
              .setStyle(btnStyles[idx % btnStyles.length])
          );
        });

        await channel.send({ embeds: [embed], components: [row] });

        return interaction.reply({
          content: `✅ Reaction Role panel sent to <#${channel.id}> successfully with ${roles.length} roles.`,
          ephemeral: true
        });
      }
    }
  ],

  events: {
    interactionCreate: async (client, interaction) => {
      if (!interaction.isButton() || !interaction.customId.startsWith("reactionrole_")) return;

      await interaction.deferReply({ ephemeral: true });

      const roleId = interaction.customId.split("_")[1];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.editReply({ content: "❌ This role could not be found. It may have been deleted." });
      }

      const member = interaction.member;

      try {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(role);
          return interaction.editReply({ content: `🌸 Removed the role **${role.name}**!` });
        } else {
          await member.roles.add(role);
          return interaction.editReply({ content: `✨ Granted you the role **${role.name}**!` });
        }
      } catch (error) {
        logger.error(`Failed to toggle role ${role.name} for ${interaction.user.tag}`, error, "REACTION_ROLES");
        return interaction.editReply({ content: "❌ Failed to update your roles. Ensure the bot has permission and its role is above the target role." });
      }
    }
  }
};
