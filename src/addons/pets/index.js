const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const PET_TYPES = {
  cat: { emoji: "🐱", label: "Kitten" },
  dog: { emoji: "🐶", label: "Puppy" },
  bunny: { emoji: "🐰", label: "Bunny" },
  fox: { emoji: "🦊", label: "Fox" },
  dragon: { emoji: "🐉", label: "Dragon" }
};

function makeProgressBar(value, max = 100) {
  const percent = Math.max(0, Math.min(value / max, 1));
  const filledCount = Math.round(percent * 10);
  const emptyCount = 10 - filledCount;
  return `\`[${"█".repeat(filledCount)}${"░".repeat(emptyCount)}]\` ${Math.round(percent * 100)}%`;
}

module.exports = {
  name: "pets",
  description: "Adopt and raise a virtual cute pet with interactive stats and economy integration",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS pets (
        user_id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        hunger INTEGER DEFAULT 100,
        happiness INTEGER DEFAULT 100,
        energy INTEGER DEFAULT 100,
        last_interaction INTEGER DEFAULT 0
      )
    `);
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("pet")
        .setDescription("Interact with your virtual pet")
        .addSubcommand(sub =>
          sub.setName("adopt")
             .setDescription("Adopt a new virtual pet")
             .addStringOption(opt => opt.setName("type").setDescription("Type of pet").setRequired(true).addChoices(
               { name: "🐱 Cat", value: "cat" },
               { name: "🐶 Dog", value: "dog" },
               { name: "🐰 Bunny", value: "bunny" },
               { name: "🦊 Fox", value: "fox" },
               { name: "🐉 Dragon", value: "dragon" }
             ))
             .addStringOption(opt => opt.setName("name").setDescription("Name of your pet").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("status")
             .setDescription("Check your pet's current health and stats")
        )
        .addSubcommand(sub =>
          sub.setName("feed")
             .setDescription("Feed your pet (+30 Hunger, costs 15 coins)")
        )
        .addSubcommand(sub =>
          sub.setName("play")
             .setDescription("Play with your pet (+30 Happiness, -20 Energy, grants XP)")
        )
        .addSubcommand(sub =>
          sub.setName("sleep")
             .setDescription("Put your pet to sleep (+60 Energy, -15 Hunger)")
        ),
      execute: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        // Adopt Pet
        if (subcommand === "adopt") {
          const type = interaction.options.getString("type");
          const name = interaction.options.getString("name").trim();

          const existing = client.db.get("SELECT name FROM pets WHERE user_id = ?", userId);
          if (existing) {
            return interaction.reply(`❌ You already have a pet named **${existing.name}**! You cannot adopt another one right now.`);
          }

          if (name.length > 15) {
            return interaction.reply("❌ Your pet's name is too long! Keep it under 15 characters.");
          }

          client.db.run(
            "INSERT INTO pets (user_id, name, type, level, xp, hunger, happiness, energy, last_interaction) VALUES (?, ?, ?, 1, 0, 100, 100, 100, ?)",
            userId,
            name,
            type,
            Date.now()
          );

          const pet = PET_TYPES[type];
          return interaction.reply(`🎉 Congratulations! You adopted a cute **${pet.label}** named **${name}**! ${pet.emoji} 🌸`);
        }

        // Fetch user's pet
        const petData = client.db.get("SELECT * FROM pets WHERE user_id = ?", userId);
        if (!petData) {
          return interaction.reply("❌ You don't have a virtual pet yet! Use `/pet adopt` to adopt one! 🌸");
        }

        const petInfo = PET_TYPES[petData.type];
        const nextXpNeeded = petData.level * 100;

        // Calculate statistics decay based on time elapsed since last interaction
        const timeElapsed = Date.now() - petData.last_interaction;
        const hoursElapsed = Math.floor(timeElapsed / (60 * 60 * 1000));
        
        let hunger = petData.hunger;
        let happiness = petData.happiness;
        let energy = petData.energy;

        if (hoursElapsed > 0) {
          // Lose 5 hunger/happiness/energy per hour
          hunger = Math.max(0, hunger - hoursElapsed * 5);
          happiness = Math.max(0, happiness - hoursElapsed * 3);
          energy = Math.max(0, energy - hoursElapsed * 4);

          // Save decayed stats
          client.db.run(
            "UPDATE pets SET hunger = ?, happiness = ?, energy = ?, last_interaction = ? WHERE user_id = ?",
            hunger,
            happiness,
            energy,
            Date.now(),
            userId
          );
        }

        if (subcommand === "status") {
          const embed = new EmbedBuilder()
            .setTitle(`${petInfo.emoji} ${petData.name}'s Status`)
            .setDescription(`**Level:** ${petData.level} | **XP:** ${petData.xp} / ${nextXpNeeded}`)
            .addFields(
              { name: "🍗 Hunger", value: `${makeProgressBar(hunger)}\n*(Keep filled to avoid starvation)*` },
              { name: "🧶 Happiness", value: `${makeProgressBar(happiness)}\n*(Play with your pet to make them happy)*` },
              { name: "⚡ Energy", value: `${makeProgressBar(energy)}\n*(Put to sleep to regain energy)*` }
            )
            .setColor(client.config.colors.primary)
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === "feed") {
          // Connect with economy: Check if user has coins
          const econAddon = client.addons.get("economy");
          let hasCoins = true;
          
          if (econAddon && econAddon.isEnabled) {
            const balance = client.db.get("SELECT coins FROM economy WHERE user_id = ?", userId);
            if (!balance || balance.coins < 15) {
              return interaction.reply("❌ You do not have enough coins to buy pet food! (Costs 15 coins. Go work to earn some!)");
            }
            // Deduct coins
            client.db.run("UPDATE economy SET coins = coins - 15 WHERE user_id = ?", userId);
          }

          if (hunger >= 100) {
            return interaction.reply(`❌ **${petData.name}** is already completely full!`);
          }

          const newHunger = Math.min(100, hunger + 30);
          client.db.run(
            "UPDATE pets SET hunger = ?, last_interaction = ? WHERE user_id = ?",
            newHunger,
            Date.now(),
            userId
          );

          return interaction.reply(`🍗 You fed **${petData.name}** for 15 coins! They feel full. (+30 Hunger)`);
        }

        if (subcommand === "play") {
          if (energy < 20) {
            return interaction.reply(`❌ **${petData.name}** is too exhausted to play! Let them sleep first.`);
          }

          const newHappiness = Math.min(100, happiness + 30);
          const newEnergy = Math.max(0, energy - 20);
          
          // Grant XP and check level up
          let xp = petData.xp + 25;
          let level = petData.level;
          let lvlUp = false;

          if (xp >= nextXpNeeded) {
            xp -= nextXpNeeded;
            level += 1;
            lvlUp = true;
          }

          client.db.run(
            "UPDATE pets SET happiness = ?, energy = ?, xp = ?, level = ?, last_interaction = ? WHERE user_id = ?",
            newHappiness,
            newEnergy,
            xp,
            level,
            Date.now(),
            userId
          );

          let reply = `🧶 You played fetch with **${petData.name}**! They look happy. (+30 Happiness, -20 Energy, +25 XP)`;
          if (lvlUp) {
            reply += `\n🎉 **Congratulations! ${petData.name} leveled up to Level ${level}!** ${petInfo.emoji}`;
          }

          return interaction.reply(reply);
        }

        if (subcommand === "sleep") {
          if (energy >= 100) {
            return interaction.reply(`❌ **${petData.name}** is wide awake and doesn't want to sleep!`);
          }

          const newEnergy = Math.min(100, energy + 60);
          const newHunger = Math.max(0, hunger - 15);

          client.db.run(
            "UPDATE pets SET energy = ?, hunger = ?, last_interaction = ? WHERE user_id = ?",
            newEnergy,
            newHunger,
            Date.now(),
            userId
          );

          return interaction.reply(`💤 **${petData.name}** is taking a nap. Sweet dreams! (+60 Energy, -15 Hunger)`);
        }
      }
    }
  ]
};
