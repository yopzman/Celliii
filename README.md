# 🌸 Celliii - Cute Modular Discord Companion Bot 🌸

Celliii is a gorgeous, fully-featured, all-in-one companion Discord bot written in Node.js. It features a complete modular addon system to toggle features on and off dynamically, Visual welcome & level rank cards (using `@napi-rs/canvas`), virtual pets, Wordle, text adventures, global chats, music via Lavalink, and AI conversation support powered by Google Gemini!

---

## ✨ Features Highlight

| Administrative & Moderation | Fun & Interactive Games | Integration & Socials |
| :--- | :--- | :--- |
| 🛡️ Ban, Kick, Warn, Timeout | 💰 Economy & Daily Job Shop | 🎵 Lavalink + Spotify Music |
| 🤬 Automod (Spam & Bad words) | 📊 Leveling & Custom Rank Cards | 🤖 Gemini AI Chats (`/ask`) |
| 🎟️ Support Tickets & Logs | 🐱 Virtual Pets Simulator | 📱 YouTube Alert Feeds |
| ✉️ Modmail Support System | 🎮 Wordle & 🌲 Text RPG | 🔀 Global Bridged Server Chats |
| 📋 Verification & Button Roles | 🎉 Giveaways Manager | 🔊 Temp Voice Rooms |

---

## 🛠️ Requirements & Prerequisites

To run Celliii, you will need:
1. **Node.js v18.0.0 or higher** (Ensure you have Node.js installed on your Windows machine).
2. **Discord Bot Token:** Create an application on the [Discord Developer Portal](https://discord.com/developers/applications).
   - In the **Bot** tab, ensure you enable the **Privileged Gateway Intents**:
     - `Presence Intent`
     - `Server Members Intent`
     - `Message Content Intent`
3. **Google Gemini API Key** (Get one from [Google AI Studio](https://aistudio.google.com/) for the AI addon).
4. **Spotify API Client ID & Secret** (Optional, for resolving Spotify URLs in the music command).
5. **Lavalink Server** (For the music addon). You can run one locally or use a public Lavalink node.

---

## 🚀 Installation & Setup

1. **Clone or download the project files** into a directory.
2. **Install dependencies:**
   Open a terminal (e.g. PowerShell/CMD) in the project root directory and run:
   ```bash
   npm install
   ```
   *(Note: `@napi-rs/canvas` installs precompiled binaries, avoiding node-gyp compilation errors on Windows!)*

3. **Configure Environment Variables:**
   Rename the `.env` file or create one in the root folder with the following variables:
   ```env
   DISCORD_TOKEN=your_discord_token_here
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Optional Spotify resolver support
   SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
   
   # Optional custom Lavalink configuration (Defaults to localhost:2333)
   LAVALINK_URL=localhost:2333
   LAVALINK_AUTH=youshallnotpass
   ```

4. **Configure Global Settings:**
   Open `config.json` and replace `YOUR_USER_ID_HERE` with your Discord account user ID (so you have administrator command overrides):
   ```json
   {
     "prefix": "c!",
     "ownerIds": [
       "123456789012345678"
     ]
   }
   ```

---

## ⚙️ How to Run

### Option A: Standard Development Mode (Single Process)
Ideal for testing or hosting on a single guild.
```bash
npm run start
```

### Option B: Sharded Production Mode (Multi-Process)
Recommended for hosting on 2,500+ servers or scaling horizontally. It runs multiple shard instances managed by the main sharding manager.
```bash
npm run shard
```

---

## 🔧 Managing Addons (Admin Commands)

You can toggle feature addons on and off dynamically using Discord slash commands:

- `/addon list` - View all loaded modules and their status.
- `/addon disable [name]` - Turn off a feature (e.g., `/addon disable socials`).
- `/addon enable [name]` - Turn on a feature (e.g., `/addon enable music`).

*Note: Core administration features like `moderation` cannot be disabled.*
