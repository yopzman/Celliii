const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { Shoukaku, Connectors } = require("shoukaku");
const logger = require("../../utils/logger");

// Custom safe spotify-url-info fetcher setup
let spotifyUrlInfo;
try {
  spotifyUrlInfo = require("spotify-url-info")(fetch);
} catch (err) {
  logger.warn("Failed to load spotify-url-info. Spotify URLs resolution will be disabled.", "MUSIC");
}

const queues = new Map();

module.exports = {
  name: "music",
  description: "Play music in voice channels using Lavalink (supports Spotify URLs)",
  isEnabled: true,

  init: async (client) => {
    // Shoukaku must be initialized after client is ready because it needs user id
  },

  events: {
    ready: async (client) => {
      logger.info("Initializing Shoukaku Lavalink Client...", "MUSIC");
      
      const nodes = client.config.lavalink;
      try {
        client.shoukaku = new Shoukaku(
          new Connectors.DiscordJS(client),
          nodes,
          { moveOnDisconnect: true, resume: true }
        );

        client.shoukaku.on("ready", (name) => logger.success(`Lavalink node "${name}" connected successfully! 🎵`, "MUSIC"));
        client.shoukaku.on("error", (name, error) => logger.error(`Lavalink node "${name}" encountered error`, error, "MUSIC"));
        client.shoukaku.on("close", (name, code, reason) => logger.warn(`Lavalink node "${name}" closed. Code: ${code}, Reason: ${reason}`, "MUSIC"));
        client.shoukaku.on("disconnect", (name, count) => logger.warn(`Lavalink node "${name}" disconnected. Reconnect count: ${count}`, "MUSIC"));
      } catch (err) {
        logger.error("Failed to initialize Shoukaku client", err, "MUSIC");
      }
    }
  },

  commands: [
    // PLAY
    {
      data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song/playlist from YouTube or Spotify in your voice channel")
        .addStringOption(opt => opt.setName("query").setDescription("The song title or URL (YouTube/Spotify)").setRequired(true)),
      execute: async (client, interaction) => {
        const query = interaction.options.getString("query");
        const voiceState = interaction.member.voice;

        if (!voiceState.channelId) {
          return interaction.reply({ content: "❌ You must be in a voice channel to play music!", ephemeral: true });
        }

        if (!client.shoukaku) {
          return interaction.reply({ content: "❌ Lavalink connector is not initialized yet. Please try again in a few moments.", ephemeral: true });
        }

        const node = client.shoukaku.options.nodeResolver
          ? client.shoukaku.options.nodeResolver(client.shoukaku.nodes)
          : client.shoukaku.nodes.values().next().value;

        if (!node || node.state !== 1) { // 1 = connected
          return interaction.reply({ content: "❌ No connected Lavalink nodes available to process your request.", ephemeral: true });
        }

        await interaction.deferReply();

        let searchQuery = query;
        let isSpotifyPlaylist = false;
        let spotifyTracks = [];

        // Resolve Spotify URLs
        if (spotifyUrlInfo && query.includes("spotify.com")) {
          try {
            if (query.includes("/track/")) {
              const preview = await spotifyUrlInfo.getPreview(query);
              if (preview) {
                searchQuery = `${preview.title} ${preview.artist}`;
              }
            } else if (query.includes("/playlist/") || query.includes("/album/")) {
              isSpotifyPlaylist = true;
              const tracks = await spotifyUrlInfo.getTracks(query);
              spotifyTracks = tracks.map(t => `${t.name} ${t.artists ? t.artists.map(a => a.name).join(" ") : ""}`);
            }
          } catch (err) {
            logger.error(`Error resolving Spotify URL: ${query}`, err, "MUSIC");
          }
        }

        let queue = queues.get(interaction.guild.id);

        if (isSpotifyPlaylist && spotifyTracks.length > 0) {
          await interaction.editReply(`🔍 Fetching **${spotifyTracks.length}** Spotify tracks...`);
          
          if (!queue) {
            queue = await module.exports.createQueue(client, interaction, voiceState.channelId, node);
          }

          for (const trackQuery of spotifyTracks) {
            const result = await node.rest.resolve(`ytsearch:${trackQuery}`);
            if (result && result.data && result.data.length > 0) {
              const track = result.data[0];
              queue.songs.push(track);
            }
          }

          await interaction.editReply(`✅ Added **${spotifyTracks.length}** Spotify tracks to the queue! 🌸`);
          if (!queue.current) {
            module.exports.playNext(client, interaction.guild.id);
          }
          return;
        }

        // Standard Youtube Search / URL Resolver
        let resolvedQuery = searchQuery;
        if (!searchQuery.startsWith("http")) {
          resolvedQuery = `ytsearch:${searchQuery}`;
        }

        const result = await node.rest.resolve(resolvedQuery);

        if (!result || result.loadType === "empty" || result.loadType === "error" || !result.data) {
          return interaction.editReply(`❌ Could not find any tracks matching \`${query}\`.`);
        }

        let tracks = [];
        let isPlaylist = false;
        let playlistName = "";

        if (result.loadType === "playlist") {
          isPlaylist = true;
          tracks = result.data.tracks || result.data;
          playlistName = result.data.info ? result.data.info.name : "Playlist";
        } else if (result.loadType === "search" || result.loadType === "track") {
          tracks = [result.data[0] || result.data];
        }

        if (tracks.length === 0) {
          return interaction.editReply("❌ No playable tracks found.");
        }

        if (!queue) {
          queue = await module.exports.createQueue(client, interaction, voiceState.channelId, node);
        }

        tracks.forEach(t => queue.songs.push(t));

        if (isPlaylist) {
          const embed = new EmbedBuilder()
            .setTitle("🌸 Playlist Added 🌸")
            .setDescription(`Added **${tracks.length}** songs from playlist **${playlistName}** to queue.`)
            .setColor(client.config.colors.primary);
          await interaction.editReply({ embeds: [embed] });
        } else {
          const song = tracks[0];
          const embed = new EmbedBuilder()
            .setTitle("🌸 Song Queued 🌸")
            .setDescription(`Added [${song.info.title}](${song.info.uri}) to the queue.`)
            .setColor(client.config.colors.primary);
          await interaction.editReply({ embeds: [embed] });
        }

        if (!queue.current) {
          module.exports.playNext(client, interaction.guild.id);
        }
      }
    },

    // SKIP
    {
      data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the currently playing song"),
      execute: async (client, interaction) => {
        const queue = queues.get(interaction.guild.id);
        if (!queue || !queue.current) {
          return interaction.reply({ content: "❌ There is nothing playing right now.", ephemeral: true });
        }

        await queue.player.stopTrack();
        return interaction.reply("⏭️ Skipped current track!");
      }
    },

    // STOP
    {
      data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop music playback and disconnect the bot"),
      execute: async (client, interaction) => {
        const queue = queues.get(interaction.guild.id);
        if (!queue) {
          return interaction.reply({ content: "❌ There is nothing playing right now.", ephemeral: true });
        }

        queue.songs = [];
        await queue.player.stopTrack();
        await client.shoukaku.leaveVoiceChannel(interaction.guild.id);
        queues.delete(interaction.guild.id);

        return interaction.reply("⏹️ Stopped playback and disconnected from voice channel.");
      }
    },

    // QUEUE
    {
      data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("View the current songs queue"),
      execute: async (client, interaction) => {
        const queue = queues.get(interaction.guild.id);
        if (!queue || (!queue.current && queue.songs.length === 0)) {
          return interaction.reply({ content: "❌ The queue is empty.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle("🎵 Music Queue")
          .setColor(client.config.colors.primary)
          .setTimestamp();

        if (queue.current) {
          embed.addFields({
            name: "▶️ Currently Playing",
            value: `[${queue.current.info.title}](${queue.current.info.uri}) | *Requested by Staff*`
          });
        }

        if (queue.songs.length > 0) {
          const songsList = queue.songs.slice(0, 10).map((s, idx) => `\`#${idx + 1}\` [${s.info.title}](${s.info.uri})`).join("\n");
          embed.addFields({
            name: "⏳ Up Next",
            value: songsList + (queue.songs.length > 10 ? `\n*...and ${queue.songs.length - 10} more songs*` : "")
          });
        }

        return interaction.reply({ embeds: [embed] });
      }
    },

    // VOLUME
    {
      data: new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Adjust the music playback volume")
        .addIntegerOption(opt => opt.setName("percentage").setDescription("Volume percentage (0-100)").setMinValue(0).setMaxValue(100).setRequired(true)),
      execute: async (client, interaction) => {
        const volume = interaction.options.getInteger("percentage");
        const queue = queues.get(interaction.guild.id);

        if (!queue) {
          return interaction.reply({ content: "❌ There is nothing playing right now.", ephemeral: true });
        }

        await queue.player.setGlobalVolume(volume);
        return interaction.reply(`🔊 Volume has been set to **${volume}%**.`);
      }
    },

    // PAUSE & RESUME
    {
      data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pause playback"),
      execute: async (client, interaction) => {
        const queue = queues.get(interaction.guild.id);
        if (!queue) return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
        
        await queue.player.setPaused(true);
        return interaction.reply("⏸️ Paused music playback.");
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume playback"),
      execute: async (client, interaction) => {
        const queue = queues.get(interaction.guild.id);
        if (!queue) return interaction.reply({ content: "❌ Nothing is playing.", ephemeral: true });
        
        await queue.player.setPaused(false);
        return interaction.reply("▶️ Resumed music playback.");
      }
    }
  ],

  // Queue Constructor
  createQueue: async (client, interaction, voiceChannelId, node) => {
    const player = await client.shoukaku.joinVoiceChannel({
      guildId: interaction.guild.id,
      channelId: voiceChannelId,
      shardId: interaction.guild.shardId
    });

    const queue = {
      player,
      textChannel: interaction.channel,
      songs: [],
      current: null
    };

    // Setup player listeners
    player.on("start", (data) => {
      const embed = new EmbedBuilder()
        .setTitle("▶️ Now Playing")
        .setDescription(`[${queue.current.info.title}](${queue.current.info.uri})`)
        .setColor(client.config.colors.success)
        .setThumbnail(`https://img.youtube.com/vi/${queue.current.info.identifier}/hqdefault.jpg`);
      queue.textChannel.send({ embeds: [embed] }).catch(() => {});
    });

    player.on("end", () => {
      module.exports.playNext(client, interaction.guild.id);
    });

    player.on("closed", () => {
      queues.delete(interaction.guild.id);
    });

    player.on("error", (error) => {
      logger.error("Player error encountered", error, "MUSIC");
      module.exports.playNext(client, interaction.guild.id);
    });

    queues.set(interaction.guild.id, queue);
    return queue;
  },

  // Play next queue item
  playNext: async (client, guildId) => {
    const queue = queues.get(guildId);
    if (!queue) return;

    if (queue.songs.length === 0) {
      queue.textChannel.send("🌸 The queue is empty! Disconnecting from voice.").catch(() => {});
      await client.shoukaku.leaveVoiceChannel(guildId);
      queues.delete(guildId);
      return;
    }

    queue.current = queue.songs.shift();
    await queue.player.playTrack({ track: queue.current.encoded || queue.current.track });
  }
};
