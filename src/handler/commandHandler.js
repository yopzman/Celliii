const { REST, Routes, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const logger = require("../utils/logger");

const commandHandler = {
  // Built-in system command definition
  getSystemCommand: () => {
    return new SlashCommandBuilder()
      .setName("addon")
      .setDescription("Manage bot's modular addons (Admin only)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(sub =>
        sub.setName("list")
           .setDescription("List all addons and their status")
      )
      .addSubcommand(sub =>
        sub.setName("enable")
           .setDescription("Enable a modular addon")
           .addStringOption(opt =>
             opt.setName("name")
                .setDescription("Name of the addon")
                .setRequired(true)
           )
      )
      .addSubcommand(sub =>
        sub.setName("disable")
           .setDescription("Disable a modular addon")
           .addStringOption(opt =>
             opt.setName("name")
                .setDescription("Name of the addon")
                .setRequired(true)
           )
      );
  },

  // Register commands with Discord REST API
  registerCommands: async (client) => {
    logger.info("Registering application commands...", "COMMAND_HANDLER");
    client.commands.clear();

    const commandData = [];

    // Add system command
    const systemCmd = commandHandler.getSystemCommand();
    client.commands.set(systemCmd.name, {
      data: systemCmd,
      execute: commandHandler.executeSystemCommand
    });
    commandData.push(systemCmd.toJSON());

    // Collect commands from enabled addons
    for (const [addonName, addon] of client.addons.entries()) {
      if (!addon.isEnabled) continue;
      if (!addon.commands || !Array.isArray(addon.commands)) continue;

      for (const cmd of addon.commands) {
        if (!cmd.data || typeof cmd.execute !== "function") {
          logger.warn(`Invalid command definition in addon ${addonName}, skipping.`, "COMMAND_HANDLER");
          continue;
        }
        cmd.addonName = addonName; // Tag command with parent addon name
        client.commands.set(cmd.data.name, cmd);
        commandData.push(cmd.data.toJSON());
      }
    }

    const rest = new REST({ version: "10" }).setToken(client.config.token);

    try {
      logger.info(`Started refreshing ${commandData.length} application (/) commands.`, "COMMAND_HANDLER");
      
      // Register globally
      const data = await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commandData }
      );

      logger.success(`Successfully reloaded ${data.length} application (/) commands.`, "COMMAND_HANDLER");
    } catch (error) {
      logger.error("Failed to register application commands with Discord API", error, "COMMAND_HANDLER");
    }
  },

  // Handle Slash Command Interactions
  handleInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Check if parent addon is disabled (for non-system commands)
    if (command.addonName) {
      const addon = client.addons.get(command.addonName);
      if (!addon || !addon.isEnabled) {
        return interaction.reply({
          content: "❌ This feature addon is currently disabled on this bot.",
          ephemeral: true
        });
      }
    }

    try {
      logger.info(`Command /${interaction.commandName} run by ${interaction.user.tag} in ${interaction.guild?.name || "DMs"}`, "COMMAND");
      await command.execute(client, interaction);
    } catch (error) {
      logger.error(`Error executing command /${interaction.commandName}`, error, "COMMAND");
      
      const responseMsg = {
        content: "❌ There was an error while executing this command!",
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(responseMsg).catch(() => {});
      } else {
        await interaction.reply(responseMsg).catch(() => {});
      }
    }
  },

  // Execute logic for built-in "/addon" command
  executeSystemCommand: async (client, interaction) => {
    const subcommand = interaction.options.getSubcommand();
    const addonManager = require("./addonManager");

    if (subcommand === "list") {
      const embed = new EmbedBuilder()
        .setTitle("🌸 Celliii Addons Dashboard 🌸")
        .setDescription("Turn features on and off dynamically using the slash commands below!\nExample: `/addon disable music`")
        .setColor(client.config.colors.primary)
        .setTimestamp();

      for (const [name, addon] of client.addons.entries()) {
        const status = addon.isEnabled ? "🟢 **Enabled**" : "🔴 **Disabled**";
        embed.addFields({
          name: `✨ ${name.charAt(0).toUpperCase() + name.slice(1)}`,
          value: `${status}\n*${addon.description || "No description provided."}*`,
          inline: true
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    const name = interaction.options.getString("name").toLowerCase();
    
    if (subcommand === "enable") {
      await interaction.deferReply();
      const result = await addonManager.enableAddon(client, name);
      return interaction.editReply({ content: result.message });
    }

    if (subcommand === "disable") {
      await interaction.deferReply();
      const result = await addonManager.disableAddon(client, name);
      return interaction.editReply({ content: result.message });
    }
  }
};

module.exports = commandHandler;
