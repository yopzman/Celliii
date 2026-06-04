const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const addonManager = {
  addons: new Map(),

  init: async (client) => {
    logger.info("Discovering addons...", "ADDON_MANAGER");
    const addonsPath = path.join(__dirname, "../addons");

    if (!fs.existsSync(addonsPath)) {
      fs.mkdirSync(addonsPath, { recursive: true });
    }

    const addonDirs = fs.readdirSync(addonsPath);

    for (const dir of addonDirs) {
      const addonIndexPath = path.join(addonsPath, dir, "index.js");
      if (!fs.existsSync(addonIndexPath)) continue;

      try {
        const addon = require(addonIndexPath);
        if (!addon.name) {
          logger.warn(`Addon at ${dir} is missing a 'name' field, skipping.`, "ADDON_MANAGER");
          continue;
        }

        // Check if enabled in DB (inserts if not present)
        const isEnabled = client.db.isAddonEnabled(addon.name);
        addon.isEnabled = isEnabled;

        // Save metadata
        client.addons.set(addon.name, addon);
        addonManager.addons.set(addon.name, addon);

        if (isEnabled) {
          logger.info(`Loading addon: ${addon.name}`, "ADDON_MANAGER");
          if (typeof addon.init === "function") {
            try {
              await addon.init(client);
            } catch (err) {
              logger.error(`Error initializing addon: ${addon.name}`, err, "ADDON_MANAGER");
            }
          }
        } else {
          logger.info(`Addon: ${addon.name} is disabled. Skipping initialization.`, "ADDON_MANAGER");
        }
      } catch (error) {
        logger.error(`Failed to load addon: ${dir}`, error, "ADDON_MANAGER");
      }
    }

    logger.success(`Loaded ${client.addons.size} addons (${Array.from(client.addons.values()).filter(a => a.isEnabled).length} active)`, "ADDON_MANAGER");
  },

  enableAddon: async (client, name) => {
    const addon = client.addons.get(name);
    if (!addon) return { success: false, message: "Addon not found." };
    if (addon.isEnabled) return { success: false, message: "Addon is already enabled." };

    client.db.setAddonEnabled(name, true);
    addon.isEnabled = true;

    // Run init
    if (typeof addon.init === "function") {
      try {
        await addon.init(client);
      } catch (err) {
        logger.error(`Error initializing addon: ${name}`, err, "ADDON_MANAGER");
      }
    }

    // Refresh application commands dynamically
    const commandHandler = require("./commandHandler");
    await commandHandler.registerCommands(client);

    logger.success(`Enabled addon: ${name}`, "ADDON_MANAGER");
    return { success: true, message: `Addon \`${name}\` has been enabled successfully!` };
  },

  disableAddon: async (client, name) => {
    const addon = client.addons.get(name);
    if (!addon) return { success: false, message: "Addon not found." };
    if (!addon.isEnabled) return { success: false, message: "Addon is already disabled." };
    if (name === "moderation" || name === "system") {
      return { success: false, message: "This core addon cannot be disabled." };
    }

    client.db.setAddonEnabled(name, false);
    addon.isEnabled = false;

    // Refresh application commands dynamically
    const commandHandler = require("./commandHandler");
    await commandHandler.registerCommands(client);

    logger.success(`Disabled addon: ${name}`, "ADDON_MANAGER");
    return { success: true, message: `Addon \`${name}\` has been disabled successfully!` };
  }
};

module.exports = addonManager;
