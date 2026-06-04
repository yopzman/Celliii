const { ShardingManager } = require("discord.js");
const path = require("path");
require("dotenv").config();
const logger = require("./utils/logger");

const token = process.env.DISCORD_TOKEN;

if (!token || token === "your_discord_token_here") {
  logger.error("No valid DISCORD_TOKEN found in your environment variables (.env). Sharding manager aborted.", null, "SHARDING");
  process.exit(1);
}

const manager = new ShardingManager(path.join(__dirname, "index.js"), {
  token: token,
  totalShards: "auto"
});

manager.on("shardCreate", (shard) => {
  logger.info(`Launched shard ${shard.id}`, "SHARDING");
});

manager.spawn().then(() => {
  logger.success("All shards spawned successfully!", "SHARDING");
}).catch((error) => {
  logger.error("Error spawning shards:", error, "SHARDING");
});
