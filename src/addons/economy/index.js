const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const SHOP_ITEMS = {
  cookie: { name: "🌸 Cookie", price: 15, desc: "A sweet strawberry cookie. Yummy!" },
  charm: { name: "✨ Lucky Charm", price: 150, desc: "Brings good luck for level rolls!" },
  plushie: { name: "🧸 Celliii Plushie", price: 500, desc: "A super soft plushie of your favorite bot." },
  ticket: { name: "🎟️ Golden Ticket", price: 1200, desc: "Unlocks special VIP server perks." },
  crown: { name: "👑 Golden Crown", price: 5000, desc: "The ultimate status symbol of riches." }
};

const WORK_JOBS = [
  "You worked as a professional cat cuddler and earned {amount} coins. 🐾",
  "You baked delicious strawberry cupcakes and earned {amount} coins. 🧁",
  "You helped decorate the town square and earned {amount} coins. 🎨",
  "You cleaned the server's spam filters and earned {amount} coins. 🛡️",
  "You played harp in a local tavern and earned {amount} coins. 🎵",
  "You found a shiny treasure chest in the woods and earned {amount} coins. 🪙",
  "You walked a pack of hyperactive puppies and earned {amount} coins. 🐶"
];

module.exports = {
  name: "economy",
  description: "Virtual currency system with daily rewards, funny jobs, shop, and inventory",
  isEnabled: true,

  init: async (client) => {
    client.db.run(`
      CREATE TABLE IF NOT EXISTS economy (
        user_id TEXT PRIMARY KEY,
        coins INTEGER DEFAULT 0,
        bank INTEGER DEFAULT 0,
        last_daily INTEGER DEFAULT 0,
        last_work INTEGER DEFAULT 0
      )
    `);

    client.db.run(`
      CREATE TABLE IF NOT EXISTS economy_inventory (
        user_id TEXT,
        item_id TEXT,
        amount INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, item_id)
      )
    `);
  },

  // Helper to ensure user exists in database
  ensureUser: (client, userId) => {
    client.db.run(
      "INSERT OR IGNORE INTO economy (user_id, coins, bank) VALUES (?, 0, 0)",
      userId
    );
  },

  commands: [
    // BALANCE
    {
      data: new SlashCommandBuilder()
        .setName("balance")
        .setDescription("View your current coin balance")
        .addUserOption(opt => opt.setName("user").setDescription("The user to check").setRequired(false)),
      execute: async (client, interaction) => {
        const user = interaction.options.getUser("user") || interaction.user;
        module.exports.ensureUser(client, user.id);

        const data = client.db.get("SELECT coins, bank FROM economy WHERE user_id = ?", user.id);

        const embed = new EmbedBuilder()
          .setTitle(`🪙 ${user.username}'s Wallet`)
          .setDescription("Keep working to grow your fortune! 🌸")
          .addFields(
            { name: "👛 Wallet", value: `\`${data.coins}\` coins`, inline: true },
            { name: "🏦 Bank", value: `\`${data.bank}\` coins`, inline: true },
            { name: "💰 Total Wealth", value: `\`${data.coins + data.bank}\` coins`, inline: false }
          )
          .setColor(client.config.colors.primary)
          .setThumbnail(user.displayAvatarURL());

        return interaction.reply({ embeds: [embed] });
      }
    },

    // DAILY
    {
      data: new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Claim your daily reward of 200 coins"),
      execute: async (client, interaction) => {
        const userId = interaction.user.id;
        module.exports.ensureUser(client, userId);

        const data = client.db.get("SELECT last_daily FROM economy WHERE user_id = ?", userId);
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours
        const elapsed = Date.now() - data.last_daily;

        if (elapsed < cooldown) {
          const remaining = cooldown - elapsed;
          const hours = Math.floor(remaining / (60 * 60 * 1000));
          const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
          return interaction.reply(`⏳ You've already claimed your daily reward! Try again in **${hours}h ${minutes}m**.`);
        }

        const amount = 200;
        client.db.run(
          "UPDATE economy SET coins = coins + ?, last_daily = ? WHERE user_id = ?",
          amount,
          Date.now(),
          userId
        );

        return interaction.reply(`🎉 You claimed your daily reward of **${amount}** coins! 🌸`);
      }
    },

    // WORK
    {
      data: new SlashCommandBuilder()
        .setName("work")
        .setDescription("Perform some jobs to earn coins"),
      execute: async (client, interaction) => {
        const userId = interaction.user.id;
        module.exports.ensureUser(client, userId);

        const data = client.db.get("SELECT last_work FROM economy WHERE user_id = ?", userId);
        const cooldown = 1 * 60 * 60 * 1000; // 1 hour
        const elapsed = Date.now() - data.last_work;

        if (elapsed < cooldown) {
          const remaining = cooldown - elapsed;
          const minutes = Math.floor(remaining / (60 * 1000));
          const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
          return interaction.reply(`⏳ You are tired! Please rest. You can work again in **${minutes}m ${seconds}s**.`);
        }

        const amount = Math.floor(Math.random() * 100) + 50; // 50 to 150
        const randJob = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
        const jobText = randJob.replace("{amount}", amount);

        client.db.run(
          "UPDATE economy SET coins = coins + ?, last_work = ? WHERE user_id = ?",
          amount,
          Date.now(),
          userId
        );

        return interaction.reply(jobText);
      }
    },

    // PAY (SEND) COINS
    {
      data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Send coins to another member")
        .addUserOption(opt => opt.setName("user").setDescription("User to pay").setRequired(true))
        .addIntegerOption(opt => opt.setName("amount").setDescription("Number of coins to transfer").setMinValue(1).setRequired(true)),
      execute: async (client, interaction) => {
        const receiver = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const senderId = interaction.user.id;

        if (receiver.id === senderId) {
          return interaction.reply("❌ You cannot transfer money to yourself!");
        }

        if (receiver.bot) {
          return interaction.reply("❌ You cannot send coins to a bot!");
        }

        module.exports.ensureUser(client, senderId);
        module.exports.ensureUser(client, receiver.id);

        const senderData = client.db.get("SELECT coins FROM economy WHERE user_id = ?", senderId);
        if (senderData.coins < amount) {
          return interaction.reply(`❌ You do not have enough coins in your wallet! (Wallet: \`${senderData.coins}\` coins)`);
        }

        // Deduct sender, credit receiver
        client.db.run("UPDATE economy SET coins = coins - ? WHERE user_id = ?", amount, senderId);
        client.db.run("UPDATE economy SET coins = coins + ? WHERE user_id = ?", amount, receiver.id);

        return interaction.reply(`✅ Sent **${amount}** coins to <@${receiver.id}> successfully! 💸`);
      }
    },

    // SHOP
    {
      data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("Browse items available in the coin shop"),
      execute: async (client, interaction) => {
        const embed = new EmbedBuilder()
          .setTitle("🌸 Celliii Boutique & Shop 🌸")
          .setDescription("Purchase cute items using your wallet coins!\nCommand: `/buy <item>` (e.g. `/buy plushie`)\n")
          .setColor(client.config.colors.primary)
          .setTimestamp();

        Object.keys(SHOP_ITEMS).forEach(key => {
          const item = SHOP_ITEMS[key];
          embed.addFields({
            name: `${item.name} | Price: 🪙 ${item.price}`,
            value: `*ID:* \`${key}\`\n*Description:* ${item.desc}`
          });
        });

        return interaction.reply({ embeds: [embed] });
      }
    },

    // BUY
    {
      data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Purchase an item from the coin shop")
        .addStringOption(opt =>
          opt.setName("item")
             .setDescription("The ID of the item to buy (e.g. plushie)")
             .setRequired(true)
             .addChoices(
               { name: "🌸 Cookie (Price: 15)", value: "cookie" },
               { name: "✨ Lucky Charm (Price: 150)", value: "charm" },
               { name: "🧸 Celliii Plushie (Price: 500)", value: "plushie" },
               { name: "🎟️ Golden Ticket (Price: 1200)", value: "ticket" },
               { name: "👑 Golden Crown (Price: 5000)", value: "crown" }
             )
        ),
      execute: async (client, interaction) => {
        const itemId = interaction.options.getString("item");
        const item = SHOP_ITEMS[itemId];
        const userId = interaction.user.id;

        module.exports.ensureUser(client, userId);

        const data = client.db.get("SELECT coins FROM economy WHERE user_id = ?", userId);
        if (data.coins < item.price) {
          return interaction.reply(`❌ You don't have enough coins in your wallet! (Price: \`${item.price}\`, Wallet: \`${data.coins}\`)`);
        }

        // Deduct money
        client.db.run("UPDATE economy SET coins = coins - ? WHERE user_id = ?", item.price, userId);

        // Add to inventory
        client.db.run(
          "INSERT INTO economy_inventory (user_id, item_id, amount) VALUES (?, ?, 1) ON CONFLICT(user_id, item_id) DO UPDATE SET amount = amount + 1",
          userId,
          itemId
        );

        return interaction.reply(`🛍️ You purchased **${item.name}** for **${item.price}** coins! 🌸`);
      }
    },

    // INVENTORY
    {
      data: new SlashCommandBuilder()
        .setName("inventory")
        .setDescription("View items you own in your inventory"),
      execute: async (client, interaction) => {
        const userId = interaction.user.id;
        const inv = client.db.all("SELECT item_id, amount FROM economy_inventory WHERE user_id = ? AND amount > 0", userId);

        if (inv.length === 0) {
          return interaction.reply("🎒 Your inventory is empty. Go buy some cute goods at the `/shop`!");
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎒 ${interaction.user.username}'s Backpack`)
          .setDescription("Here are the items you have bought! 🌸")
          .setColor(client.config.colors.secondary)
          .setTimestamp();

        inv.forEach(entry => {
          const item = SHOP_ITEMS[entry.item_id];
          if (item) {
            embed.addFields({
              name: `${item.name} (x${entry.amount})`,
              value: item.desc,
              inline: true
            });
          }
        });

        return interaction.reply({ embeds: [embed] });
      }
    }
  ]
};
