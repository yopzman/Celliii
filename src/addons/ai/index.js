const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../../utils/logger");

const SYSTEM_PROMPT = `You are Celliii, a cute, bubbly, and extremely helpful Discord companion bot. 
You love pastel colors, flowers (especially cherry blossoms 🌸), and using cute emojis like ✨, 🌸, 🐾, 🎀, and 🧸. 
Keep your responses friendly, helpful, and relatively concise (since it is a chat application). 
Always sound cheerful, supportive, and use a playful tone! Avoid acting like a sterile computer program.`;

module.exports = {
  name: "ai",
  description: "Conversational AI chat companion powered by Google Gemini",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("aichat")
        .setDescription("Configure AI chat settings (Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
          sub.setName("setup")
             .setDescription("Set the dedicated channel for AI chat conversations")
             .addChannelOption(opt =>
               opt.setName("channel")
                  .setDescription("The chat channel")
                  .setRequired(true)
             )
        )
        .addSubcommand(sub =>
          sub.setName("disable")
             .setDescription("Disable AI conversation channel")
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === "setup") {
          const channel = interaction.options.getChannel("channel");
          client.db.setSetting(guildId, "aichat_channel_id", channel.id);
          return interaction.reply({ content: `✅ Dedicated AI chat channel has been configured to <#${channel.id}>! You can chat with me directly there. 🌸`, ephemeral: true });
        }

        if (subcommand === "disable") {
          client.db.deleteSetting(guildId, "aichat_channel_id");
          return interaction.reply({ content: "✅ AI conversation channel has been disabled.", ephemeral: true });
        }
      }
    },
    {
      data: new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask Celliii AI a one-off question")
        .addStringOption(opt => opt.setName("question").setDescription("The question to ask").setRequired(true)),
      execute: async (client, interaction) => {
        const prompt = interaction.options.getString("question");

        if (!client.config.geminiApiKey || client.config.geminiApiKey === "your_gemini_api_key_here") {
          return interaction.reply({ content: "❌ Google Gemini API Key is not configured for this bot. Staff needs to update the `.env` file.", ephemeral: true });
        }

        await interaction.deferReply();

        try {
          const genAI = new GoogleGenerativeAI(client.config.geminiApiKey);
          // Using gemini-1.5-flash as the fast/reliable standard
          const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: SYSTEM_PROMPT
          });

          const result = await model.generateContent(prompt);
          const response = result.response.text();

          // Split response if it exceeds 2000 chars
          if (response.length > 2000) {
            const chunks = response.match(/[\s\S]{1,1900}/g) || [];
            await interaction.editReply(chunks[0]);
            for (let i = 1; i < chunks.length; i++) {
              await interaction.followUp(chunks[i]);
            }
          } else {
            await interaction.editReply(response);
          }
        } catch (error) {
          logger.error("Error communicating with Gemini API", error, "AI");
          return interaction.editReply("❌ Apologies! I couldn't reach my brain servers to answer that right now.");
        }
      }
    }
  ],

  events: {
    messageCreate: async (client, message) => {
      // Ignore bot, system, or DM messages
      if (!message.guild || message.author.bot || message.system) return;

      const guildId = message.guild.id;
      const aiChannelId = client.db.getSetting(guildId, "aichat_channel_id");

      // Verify the message was sent in the designated AI channel
      if (!aiChannelId || message.channel.id !== aiChannelId) return;

      // Ensure API key is present
      if (!client.config.geminiApiKey || client.config.geminiApiKey === "your_gemini_api_key_here") return;

      // Start typing indicator
      await message.channel.sendTyping().catch(() => {});

      try {
        const genAI = new GoogleGenerativeAI(client.config.geminiApiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          systemInstruction: SYSTEM_PROMPT
        });

        // Fetch recent messages for history
        const recentMessages = await message.channel.messages.fetch({ limit: 10 }).catch(() => null);
        const history = [];

        if (recentMessages) {
          // Sort messages chronologically
          const sorted = Array.from(recentMessages.values()).reverse();
          
          for (const msg of sorted) {
            if (msg.id === message.id) continue; // Skip current prompt
            
            if (msg.author.id === client.user.id) {
              history.push({
                role: "model",
                parts: [{ text: msg.content }]
              });
            } else if (!msg.author.bot) {
              history.push({
                role: "user",
                parts: [{ text: `${msg.author.username}: ${msg.content}` }]
              });
            }
          }
        }

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(message.content);
        const response = result.response.text();

        // Send response (handling > 2000 chars)
        if (response.length > 2000) {
          const chunks = response.match(/[\s\S]{1,1900}/g) || [];
          for (const chunk of chunks) {
            await message.reply(chunk).catch(() => {});
          }
        } else {
          await message.reply(response).catch(() => {});
        }
      } catch (error) {
        logger.error("Error generating Gemini chat completion in channel", error, "AI");
        await message.reply("❌ Oh dear! I got a little dizzy and couldn't think of a response. Please try again!").catch(() => {});
      }
    }
  }
};
