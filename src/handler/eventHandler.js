const commandHandler = require("./commandHandler");
const logger = require("../utils/logger");

const eventHandler = {
  init: async (client) => {
    logger.info("Setting up event dispatcher...", "EVENT_HANDLER");

    // 1. Gather all unique event names from addons
    const eventNames = new Set();
    
    // Core event interactionCreate for commands is always needed
    eventNames.add("interactionCreate");
    eventNames.add("ready");

    for (const addon of client.addons.values()) {
      if (addon.events && typeof addon.events === "object") {
        for (const eventName of Object.keys(addon.events)) {
          eventNames.add(eventName);
        }
      }
    }

    // 2. Register unified listener for each event
    for (const eventName of eventNames) {
      client.on(eventName, async (...args) => {
        // Special core handling for ready
        if (eventName === "ready") {
          logger.success(`Logged in as ${client.user.tag}! Bot is ready.🌸`, "CLIENT");
          
          // Set presence
          client.user.setPresence({
            activities: [{ name: "over the community | 🌸", type: 3 }], // Type 3 = Watching
            status: "online"
          });

          // Register command slash inputs
          await commandHandler.registerCommands(client).catch(err => 
            logger.error("Failed to register commands during ready event", err, "EVENT_HANDLER")
          );
        }

        // Special core handling for slash command interactions
        if (eventName === "interactionCreate") {
          const [interaction] = args;
          if (interaction.isChatInputCommand()) {
            try {
              await commandHandler.handleInteraction(client, interaction);
            } catch (err) {
              logger.error(`Critical error handling interaction ${interaction.commandName}`, err, "EVENT_HANDLER");
            }
          }
        }

        // Dispatch event to all enabled addons that listen to it
        for (const addon of client.addons.values()) {
          if (!addon.isEnabled) continue;
          if (addon.events && typeof addon.events[eventName] === "function") {
            try {
              await addon.events[eventName](client, ...args);
            } catch (err) {
              logger.error(`Error in addon '${addon.name}' executing event '${eventName}'`, err, "EVENT_DISPATCHER");
            }
          }
        }
      });
    }

    logger.success(`Event dispatcher registered ${eventNames.size} events.`, "EVENT_HANDLER");
  }
};

module.exports = eventHandler;
