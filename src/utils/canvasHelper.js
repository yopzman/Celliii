const { createCanvas, loadImage } = require("@napi-rs/canvas");
const logger = require("./logger");

// Helper to draw rounded rectangle
function drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

const canvasHelper = {
  /**
   * Generates a welcome card image buffer
   */
  createWelcomeCard: async (username, avatarUrl, memberCount, guildName) => {
    try {
      const width = 800;
      const height = 350;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // 1. Draw Background Gradient (Cute Pastel Pink to Purple)
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#FFB7C5"); // Cherry blossom pink
      grad.addColorStop(0.5, "#B39EB5"); // Pastel purple
      grad.addColorStop(1, "#AEC6CF"); // Pastel blue
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Decorative Clouds / Sparkles
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(100, 80, 120, 0, Math.PI * 2);
      ctx.arc(720, 280, 160, 0, Math.PI * 2);
      ctx.fill();

      // Sparkles
      ctx.fillStyle = "#FFF";
      const drawStar = (x, y, r) => {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * r + x, -Math.sin((18 + i * 72) * Math.PI / 180) * r + y);
          ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * (r/2) + x, -Math.sin((54 + i * 72) * Math.PI / 180) * (r/2) + y);
        }
        ctx.closePath();
        ctx.fill();
      };
      drawStar(150, 240, 12);
      drawStar(650, 80, 15);
      drawStar(700, 130, 8);

      // 3. Draw a Card Container (Glassmorphism effect)
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 25, true, false);

      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      drawRoundedRect(ctx, 45, 45, width - 90, height - 90, 22, true, false);

      // 4. Draw Avatar with circular border
      let avatarImg;
      try {
        const res = await fetch(avatarUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        avatarImg = await loadImage(buffer);
      } catch (err) {
        logger.error("Failed to load user avatar in canvas, using default placeholder", err);
        // Fallback placeholder (a nice solid pink circle)
      }

      const avatarSize = 130;
      const avatarX = 80;
      const avatarY = height / 2 - avatarSize / 2;

      ctx.save();
      // Outer border circle
      ctx.strokeStyle = "#FFB7C5";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Clip for Avatar
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
      ctx.clip();

      if (avatarImg) {
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
      } else {
        ctx.fillStyle = "#FFB7C5";
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
      }
      ctx.restore();

      // 5. Draw Welcome Texts
      ctx.fillStyle = "#4A4A4A";
      ctx.textAlign = "left";

      // Welcome title
      ctx.font = "bold 26px sans-serif";
      ctx.fillText("Welcome to the family! ✨", 240, 125);

      // Username
      ctx.fillStyle = "#D15B70"; // Cute dark pink
      ctx.font = "bold 42px sans-serif";
      // Truncate username if too long
      const displayUsername = username.length > 15 ? username.slice(0, 15) + "..." : username;
      ctx.fillText(displayUsername, 240, 180);

      // Subtitle (guild and count)
      ctx.fillStyle = "#6E6E6E";
      ctx.font = "italic 20px sans-serif";
      ctx.fillText(`You are our ${memberCount}th member!`, 240, 225);

      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#8D6E63";
      ctx.fillText(`Enjoy your stay in ${guildName} 🌸`, 240, 255);

      return canvas.toBuffer("image/png");
    } catch (err) {
      logger.error("Error drawing welcome card", err);
      return null;
    }
  },

  /**
   * Generates a Level Rank Card image buffer
   */
  createRankCard: async (username, avatarUrl, currentXp, requiredXp, level, rank) => {
    try {
      const width = 900;
      const height = 250;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // 1. Background (Dark premium glassmorphism theme)
      ctx.fillStyle = "#1e1f22"; // Discord dark gray
      ctx.fillRect(0, 0, width, height);

      // Colorful background glow
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "#FFB7C5");
      grad.addColorStop(1, "#AEC6CF");
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1.0;

      // 2. Card body container
      ctx.fillStyle = "#2b2d31";
      drawRoundedRect(ctx, 25, 25, width - 50, height - 50, 20, true, false);

      // 3. Avatar
      let avatarImg;
      try {
        const res = await fetch(avatarUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        avatarImg = await loadImage(buffer);
      } catch (err) {
        logger.error("Failed to load user avatar in rank canvas", err);
      }

      const avatarSize = 120;
      const avatarX = 60;
      const avatarY = height / 2 - avatarSize / 2;

      ctx.save();
      // Outer ring glow
      const avatarGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      avatarGrad.addColorStop(0, "#FFB7C5");
      avatarGrad.addColorStop(1, "#B39EB5");
      ctx.strokeStyle = avatarGrad;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 3, 0, Math.PI * 2);
      ctx.stroke();

      // Clip avatar
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
      ctx.clip();

      if (avatarImg) {
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
      } else {
        ctx.fillStyle = "#FFB7C5";
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
      }
      ctx.restore();

      // 4. Texts (Level, Rank, Username)
      ctx.textAlign = "left";

      // Username
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      const displayUser = username.length > 18 ? username.slice(0, 18) + "..." : username;
      ctx.fillText(displayUser, 210, 95);

      // Rank & Level (Aligned to right)
      ctx.textAlign = "right";
      
      // LEVEL
      ctx.fillStyle = "#FFB7C5";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`LVL `, 720, 95);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 38px sans-serif";
      ctx.fillText(`${level}`, 765, 95);

      // RANK
      ctx.fillStyle = "#AEC6CF";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(`RANK `, 825, 95);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(`#${rank}`, 860, 95);

      // XP string info
      ctx.textAlign = "right";
      ctx.fillStyle = "#b5bac1";
      ctx.font = "18px sans-serif";
      ctx.fillText(`${currentXp} / ${requiredXp} XP`, 850, 140);

      // 5. XP Progress Bar
      const barX = 210;
      const barY = 150;
      const barWidth = 640;
      const barHeight = 22;
      const barRadius = 11;

      // Track
      ctx.fillStyle = "#3b3e45";
      drawRoundedRect(ctx, barX, barY, barWidth, barHeight, barRadius, true, false);

      // Progress fill
      const progressPercent = Math.min(Math.max(currentXp / requiredXp, 0), 1);
      const fillWidth = barWidth * progressPercent;

      if (fillWidth > barHeight) {
        const fillGrad = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
        fillGrad.addColorStop(0, "#FFB7C5");
        fillGrad.addColorStop(0.5, "#B39EB5");
        fillGrad.addColorStop(1, "#AEC6CF");
        ctx.fillStyle = fillGrad;
        drawRoundedRect(ctx, barX, barY, fillWidth, barHeight, barRadius, true, false);
      } else if (fillWidth > 0) {
        ctx.fillStyle = "#FFB7C5";
        ctx.beginPath();
        ctx.arc(barX + barRadius, barY + barRadius, barRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      return canvas.toBuffer("image/png");
    } catch (err) {
      logger.error("Error drawing rank card", err);
      return null;
    }
  }
};

module.exports = canvasHelper;
