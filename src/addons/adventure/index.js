const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const activeStories = new Map();

// Story States Definitions
const STORY_NODES = {
  start: {
    title: "🌲 The Whispering Woods",
    desc: "You wake up on a bed of glowing moss inside a mystical forest. Your head hurts, and you only remember your name. Nearby, you see a dark cavern entrance and a dirt path leading towards chimney smoke.",
    choices: [
      { label: "🪨 Explore Cavern", customId: "adv_choice_cave", style: ButtonStyle.Primary },
      { label: "🏡 Follow Path", customId: "adv_choice_village", style: ButtonStyle.Success },
      { label: "⏹️ End Game", customId: "adv_choice_quit", style: ButtonStyle.Danger }
    ]
  },
  cave: {
    title: "🪨 The Goblin Cavern",
    desc: "The cave is dark and smells like old copper. As you walk deeper, a green Goblin jumps from behind a stalagmite holding a wooden club! He screeches and charges at you!",
    choices: [
      { label: "⚔️ Fight!", customId: "adv_choice_fight", style: ButtonStyle.Danger },
      { label: "🏃 Run Away!", customId: "adv_choice_start", style: ButtonStyle.Secondary }
    ]
  },
  village: {
    title: "🏡 Sunnyvale Village",
    desc: "You arrive at a cozy village. A bard is playing a harp nearby, and the smell of fresh bread fills the air. You see an Inn and a Merchant Shop.",
    choices: [
      { label: "🛒 Visit Shop", customId: "adv_choice_shop", style: ButtonStyle.Primary },
      { label: "🛏️ Rest at Inn", customId: "adv_choice_inn", style: ButtonStyle.Success },
      { label: "🌲 Return to Forest", customId: "adv_choice_start", style: ButtonStyle.Secondary }
    ]
  },
  shop: {
    title: "🛒 The Merchant Stall",
    desc: "A friendly merchant welcomes you. \"Greetings traveler! Want to upgrade your gear?\"\n\n🎁 **Rusty Sword** (Cost: 15 Gold) - Increase combat damage.",
    choices: [
      { label: "🗡️ Buy Sword (15g)", customId: "adv_choice_buysword", style: ButtonStyle.Success },
      { label: "🔙 Back to Village", customId: "adv_choice_village", style: ButtonStyle.Secondary }
    ]
  }
};

module.exports = {
  name: "adventure",
  description: "Text-based RPG adventure mini-game using Discord interactive buttons",
  isEnabled: true,

  init: async (client) => {},

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("adventure")
        .setDescription("Start a text-based RPG adventure game!"),
      execute: async (client, interaction) => {
        const userId = interaction.user.id;

        if (activeStories.has(userId)) {
          return interaction.reply({ content: "❌ You already have an active adventure session! Finish or quit that one first.", ephemeral: true });
        }

        const playerState = {
          hp: 100,
          weapon: "Fists",
          weaponPower: 10,
          gold: 10,
          currentNode: "start"
        };

        activeStories.set(userId, playerState);
        await module.exports.renderNode(client, interaction, userId, "start", true);
      }
    }
  ],

  events: {
    interactionCreate: async (client, interaction) => {
      if (!interaction.isButton() || !interaction.customId.startsWith("adv_choice_")) return;

      const userId = interaction.user.id;
      const player = activeStories.get(userId);

      if (!player) {
        return interaction.reply({ content: "❌ You do not have an active adventure session. Type `/adventure` to start!", ephemeral: true });
      }

      // Ensure only the owner can click buttons
      if (interaction.message.interaction?.user.id !== userId) {
        // Fallback check if the slash command interaction user doesn't match
        const commandUser = interaction.message.embeds[0]?.footer?.text.split(": ")[1];
        if (commandUser && commandUser !== interaction.user.username) {
          return interaction.reply({ content: "❌ This is not your game session! Start your own with `/adventure`.", ephemeral: true });
        }
      }

      const choice = interaction.customId.replace("adv_choice_", "");

      if (choice === "quit") {
        activeStories.delete(userId);
        return interaction.update({ content: "⏹️ Adventure ended. Thanks for playing!", embeds: [], components: [] });
      }

      if (choice === "start") {
        player.currentNode = "start";
        return module.exports.renderNode(client, interaction, userId, "start", false);
      }

      if (choice === "cave") {
        player.currentNode = "cave";
        return module.exports.renderNode(client, interaction, userId, "cave", false);
      }

      if (choice === "village") {
        player.currentNode = "village";
        return module.exports.renderNode(client, interaction, userId, "village", false);
      }

      if (choice === "shop") {
        player.currentNode = "shop";
        return module.exports.renderNode(client, interaction, userId, "shop", false);
      }

      // Buy Sword
      if (choice === "buysword") {
        if (player.gold < 15) {
          return interaction.reply({ content: "❌ You do not have enough Gold! Explore the cavern and fight goblins to earn some.", ephemeral: true });
        }
        if (player.weapon === "Rusty Sword") {
          return interaction.reply({ content: "❌ You already own a Rusty Sword!", ephemeral: true });
        }

        player.gold -= 15;
        player.weapon = "Rusty Sword";
        player.weaponPower = 25;
        player.currentNode = "shop";

        return module.exports.renderNode(client, interaction, userId, "shop", false);
      }

      // Rest at Inn
      if (choice === "inn") {
        if (player.gold < 5) {
          return interaction.reply({ content: "❌ You need at least 5 Gold to rest at the Inn!", ephemeral: true });
        }
        if (player.hp >= 100) {
          return interaction.reply({ content: "❌ You are already at full health!", ephemeral: true });
        }

        player.gold -= 5;
        player.hp = Math.min(100, player.hp + 40);
        player.currentNode = "village";

        return module.exports.renderNode(client, interaction, userId, "village", false);
      }

      // Fight Goblin
      if (choice === "fight") {
        const combatChance = Math.random();
        let combatText = "";
        let gameEnded = false;

        if (combatChance > 0.4) {
          // Win
          const goldEarned = Math.floor(Math.random() * 15) + 10;
          player.gold += goldEarned;
          combatText = `⚔️ **Victory!** You swing your ${player.weapon} and defeat the Goblin! You search its pockets and find **${goldEarned} Gold**!`;
          player.currentNode = "start"; // return to forest
        } else {
          // Lose health
          const dmg = Math.floor(Math.random() * 20) + 15;
          player.hp -= dmg;
          combatText = `💥 **Ouch!** The Goblin dodges your strike and hits you with his club, dealing **${dmg} Damage** before fleeing!`;
          
          if (player.hp <= 0) {
            combatText += "\n\n💀 **You Died!** Your adventure ends here. Try again next time!";
            gameEnded = true;
          } else {
            player.currentNode = "start"; // return to forest
          }
        }

        const fightEmbed = new EmbedBuilder()
          .setTitle("⚔️ Combat Result!")
          .setDescription(`${combatText}\n\n*Press the button below to continue.*`)
          .addFields(
            { name: "❤️ HP", value: `${player.hp}/100`, inline: true },
            { name: "🗡️ Weapon", value: player.weapon, inline: true },
            { name: "🪙 Gold", value: `${player.gold}g`, inline: true }
          )
          .setColor(gameEnded ? client.config.colors.error : client.config.colors.warn);

        const row = new ActionRowBuilder();
        if (gameEnded) {
          activeStories.delete(userId);
          row.addComponents(
            new ButtonBuilder().setCustomId("adv_choice_quit").setLabel("Exit").setStyle(ButtonStyle.Danger)
          );
        } else {
          row.addComponents(
            new ButtonBuilder().setCustomId("adv_choice_start").setLabel("Continue").setStyle(ButtonStyle.Primary)
          );
        }

        return interaction.update({ embeds: [fightEmbed], components: [row] });
      }
    }
  },

  renderNode: async (client, interaction, userId, nodeKey, isFirstRun) => {
    const player = activeStories.get(userId);
    const node = STORY_NODES[nodeKey];

    const embed = new EmbedBuilder()
      .setTitle(node.title)
      .setDescription(node.desc)
      .addFields(
        { name: "❤️ HP", value: `${player.hp}/100`, inline: true },
        { name: "🗡️ Weapon", value: player.weapon, inline: true },
        { name: "🪙 Gold", value: `${player.gold}g`, inline: true }
      )
      .setColor(client.config.colors.primary)
      .setFooter({ text: `Adventurer: ${interaction.user.username}` });

    const row = new ActionRowBuilder();
    node.choices.forEach(c => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(c.customId)
          .setLabel(c.label)
          .setStyle(c.style)
      );
    });

    if (isFirstRun) {
      await interaction.reply({ embeds: [embed], components: [row] });
    } else {
      await interaction.update({ embeds: [embed], components: [row] });
    }
  }
};
