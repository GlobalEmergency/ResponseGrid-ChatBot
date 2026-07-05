/**
 * PM2 Ecosystem — ResponseGrid ChatBot
 *
 * Un solo proceso: el bot multicanal (N bots de Telegram por long polling +
 * 1 servidor de webhook de WhatsApp si hay cuentas whatsapp en accounts.json).
 *
 * Despliegue en srv07 (Plesk): el interpreter apunta al Node gestionado por
 * Plesk (/opt/plesk/node/24). Se puede sobreescribir con PM2_NODE_BIN.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs --update-env   # reinicio graceful
 *   pm2 logs responsegrid-bot
 */
const path = require("path");

const APP_DIR = process.env.PM2_APP_DIR || process.cwd();
const NODE_BIN = process.env.PM2_NODE_BIN || "/opt/plesk/node/24/bin/node";
const LOG_DIR = path.join(APP_DIR, "logs");

module.exports = {
  apps: [
    {
      name: "responsegrid-bot",
      script: "dist/index.js",
      cwd: APP_DIR,
      interpreter: NODE_BIN,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
      error_file: path.join(LOG_DIR, "bot-error.log"),
      out_file: path.join(LOG_DIR, "bot-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      kill_timeout: 10000,
      watch: false,
    },
  ],
};
