const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const logger = require("./utils/logger");

const dbPath = path.join(__dirname, "../database.sqlite");
let db;

try {
  db = new Database(dbPath);
  // Optimize SQLite performance
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  logger.success("Database connected and optimized successfully.", "DATABASE");
} catch (error) {
  logger.error("Failed to connect to SQLite database", error, "DATABASE");
  process.exit(1);
}

// Create core settings and addons tables if they don't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS addons (
    name TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY (guild_id, key)
  )
`).run();

const dbManager = {
  // Direct access to raw database object for advanced queries
  raw: db,

  // Run a query (INSERT, UPDATE, DELETE)
  run: (sql, ...params) => {
    try {
      return db.prepare(sql).run(...params);
    } catch (error) {
      logger.error(`Failed to execute query: ${sql}`, error, "DATABASE");
      throw error;
    }
  },

  // Get single row
  get: (sql, ...params) => {
    try {
      return db.prepare(sql).get(...params);
    } catch (error) {
      logger.error(`Failed to get row: ${sql}`, error, "DATABASE");
      throw error;
    }
  },

  // Get all rows
  all: (sql, ...params) => {
    try {
      return db.prepare(sql).all(...params);
    } catch (error) {
      logger.error(`Failed to get all rows: ${sql}`, error, "DATABASE");
      throw error;
    }
  },

  // Addon management
  isAddonEnabled: (name) => {
    const row = db.prepare("SELECT enabled FROM addons WHERE name = ?").get(name);
    return row ? row.enabled === 1 : true; // Enabled by default
  },

  setAddonEnabled: (name, enabled) => {
    db.prepare("INSERT INTO addons (name, enabled) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled").run(name, enabled ? 1 : 0);
  },

  // Settings helpers
  getSetting: (guildId, key, defaultValue = null) => {
    const row = db.prepare("SELECT value FROM settings WHERE guild_id = ? AND key = ?").get(guildId, key);
    return row ? row.value : defaultValue;
  },

  setSetting: (guildId, key, value) => {
    db.prepare("INSERT INTO settings (guild_id, key, value) VALUES (?, ?, ?) ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value").run(guildId, key, String(value));
  },
  
  deleteSetting: (guildId, key) => {
    db.prepare("DELETE FROM settings WHERE guild_id = ? AND key = ?").run(guildId, key);
  }
};

module.exports = dbManager;
