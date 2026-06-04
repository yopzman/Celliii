const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m"
};

const getTimestamp = () => {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
};

const logger = {
  info: (message, source = "SYSTEM") => {
    console.log(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.fgCyan}${colors.bright}[${source}]${colors.reset} ${message}`
    );
  },
  success: (message, source = "SYSTEM") => {
    console.log(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.fgGreen}${colors.bright}[${source}]${colors.reset} ${message}`
    );
  },
  warn: (message, source = "SYSTEM") => {
    console.warn(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.fgYellow}${colors.bright}[${source}]${colors.reset} ${message}`
    );
  },
  error: (message, error, source = "SYSTEM") => {
    console.error(
      `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.fgRed}${colors.bright}[${source}]${colors.reset} ${message}`
    );
    if (error) {
      console.error(colors.fgRed, error, colors.reset);
    }
  },
  debug: (message, source = "SYSTEM") => {
    if (process.env.DEBUG === "true" || process.env.NODE_ENV === "development") {
      console.log(
        `${colors.dim}[${getTimestamp()}] [DEBUG] [${source}] ${message}${colors.reset}`
      );
    }
  }
};

module.exports = logger;
