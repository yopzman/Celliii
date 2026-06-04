const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const WORD_LIST = ["apple", "sweet", "bunny", "cloud", "angel", "magic", "party", "candy", "fairy", "dance", "smile", "happy", "honey", "stars", "kitty", "puppy", "melon", "lemon", "berry", "grape", "peach", "mango", "daisy", "tulip", "roses", "ocean"];
const activeGames = new Map();

function generateGrid(guess, secret) {
  let result = "";
  const secretArr = secret.split("");
  const guessArr = guess.split("");
  const rowColors = Array(5).fill("⬛");

  // First pass: mark greens
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === secretArr[i]) {
      rowColors[i] = "🟩";
      secretArr[i] = null; // Consume letter
      guessArr[i] = null;
    }
  }

  // Second pass: mark yellows
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] !== null) {
      const idx = secretArr.indexOf(guessArr[i]);
      if (idx !== -1) {
        rowColors[i] = "🟨";
        secretArr[idx] = null; // Consume letter
      }
    }
  }

  return rowColors.join(" ");
}

module.exports = {
  name: "wordle",
  description: "Play a cute 5-letter Wordle game directly in Discord chat",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("wordle")
        .setDescription("Start a new game of Wordle!"),
      execute: async (client, interaction) => {
        const userId = interaction.user.id;

        if (activeGames.has(userId)) {
          return interaction.reply({ content: "❌ You already have an active Wordle game session! Finish that one first.", ephemeral: true });
        }

        const secretWord = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
        const gameSession = {
          secretWord,
          guesses: [],
          maxGuesses: 6,
          active: true
        };

        activeGames.set(userId, gameSession);

        const embed = new EmbedBuilder()
          .setTitle("🌸 Celliii Wordle Game 🌸")
          .setDescription("I've chosen a secret 5-letter word! Guess it in **6 tries**.\n\nType your first 5-letter word directly in the chat to start!\n*(Type `quit` to end the game)*")
          .addFields(
            { name: "💡 Emojis guide", value: "🟩: Correct letter & position\n🟨: Correct letter, wrong position\n⬛: Letter not in word" }
          )
          .setColor(client.config.colors.primary)
          .setFooter({ text: "Time limit: 5 minutes" });

        await interaction.reply({ embeds: [embed] });

        // Set up message collector
        const filter = m => m.author.id === userId && m.channel.id === interaction.channel.id;
        const collector = interaction.channel.createMessageCollector({ filter, time: 5 * 60 * 1000 });

        collector.on("collect", async (message) => {
          const guess = message.content.trim().toLowerCase();

          if (guess === "quit") {
            collector.stop("quit");
            return;
          }

          if (guess.length !== 5) {
            return message.reply("⚠️ Your guess must be exactly **5 letters** long!").then(msg => {
              setTimeout(() => {
                msg.delete().catch(() => {});
                message.delete().catch(() => {});
              }, 4000);
            });
          }

          // Evaluate guess
          const gridRow = generateGrid(guess, secretWord);
          gameSession.guesses.push({ guess, gridRow });

          // Build grid message
          let boardText = "";
          for (let i = 0; i < gameSession.maxGuesses; i++) {
            if (i < gameSession.guesses.length) {
              const g = gameSession.guesses[i];
              boardText += `${g.gridRow}  |  \`${g.guess.toUpperCase()}\`\n`;
            } else {
              boardText += "⬜ ⬜ ⬜ ⬜ ⬜  |  `?????`\n";
            }
          }

          const gameEmbed = new EmbedBuilder()
            .setTitle(`🌸 Wordle: ${interaction.user.username}'s Game`)
            .setDescription(boardText)
            .setColor(client.config.colors.secondary)
            .setFooter({ text: `Guess ${gameSession.guesses.length} of ${gameSession.maxGuesses}` });

          await message.reply({ embeds: [gameEmbed] }).catch(() => {});

          // Check winning conditions
          if (guess === secretWord) {
            collector.stop("win");
          } else if (gameSession.guesses.length >= gameSession.maxGuesses) {
            collector.stop("lose");
          }
        });

        collector.on("end", async (collected, reason) => {
          activeGames.delete(userId);

          let endText = "";
          let color = client.config.colors.neutral;

          if (reason === "win") {
            endText = `🎉 **Congratulations!** You guessed the secret word **${secretWord.toUpperCase()}**! 🌸`;
            color = client.config.colors.success;
          } else if (reason === "lose") {
            endText = `😢 **Game Over!** You ran out of guesses. The secret word was **${secretWord.toUpperCase()}**.`;
            color = client.config.colors.error;
          } else if (reason === "quit") {
            endText = `⏹️ Game ended. The secret word was **${secretWord.toUpperCase()}**.`;
          } else {
            endText = `⏳ Time's up! The game session has expired. The secret word was **${secretWord.toUpperCase()}**.`;
          }

          const finalEmbed = new EmbedBuilder()
            .setTitle("🌸 Wordle Game Result")
            .setDescription(endText)
            .setColor(color)
            .setTimestamp();

          await interaction.channel.send({ content: `<@${userId}>`, embeds: [finalEmbed] }).catch(() => {});
        });
      }
    }
  ]
};
