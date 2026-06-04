const CelliiiClient = require("./client");
const logger = require("./utils/logger");

// Handle uncaught exceptions so the bot doesn't crash on minor gateway errors
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection:", error, "CRASH_PREVENTION");
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error, "CRASH_PREVENTION");
});

const client = new CelliiiClient();

(async () => {
  try {
    await client.start();
  } catch (error) {
    logger.error("Fatal error starting Celliii client:", error, "BOOT");
    process.exit(1);
  }
})();
