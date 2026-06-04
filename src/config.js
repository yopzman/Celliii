require("dotenv").config();
const fs = require("fs");
const path = require("path");
const logger = require("./utils/logger");

const configPath = path.join(__dirname, "../config.json");
let rawConfig = {};

if (fs.existsSync(configPath)) {
  try {
    rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    logger.error("Failed to parse config.json, using defaults", error);
  }
} else {
  logger.warn("config.json not found, using default template settings.");
}

const config = {
  token: process.env.DISCORD_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  
  prefix: rawConfig.prefix || "c!",
  ownerIds: rawConfig.ownerIds || [],
  colors: rawConfig.colors || {
    primary: "#FFB7C5",
    secondary: "#AEC6CF",
    success: "#BDFCC9",
    error: "#FF9899",
    warn: "#FDFD96",
    neutral: "#B39EB5"
  },
  
  lavalink: rawConfig.lavalink || [
    {
      name: "Local Node",
      url: process.env.LAVALINK_URL || "localhost:2333",
      auth: process.env.LAVALINK_AUTH || "youshallnotpass",
      secure: false
    }
  ],
  
  defaultSettings: rawConfig.defaultSettings || {
    welcomeMessage: "Welcome {user} to {guild}! You are member #{count}! 🌸",
    verificationRole: "Verified",
    modmailCategoryName: "Modmail",
    tempVoiceCategoryName: "Temp Voice",
    tempVoiceChannelName: "Join to Create"
  }
};

// Simple validations
if (!config.token || config.token === "your_discord_token_here") {
  logger.warn("No valid DISCORD_TOKEN found in your environment variables (.env). Please configure it before running.");
}

module.exports = config;
