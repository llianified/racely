const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "racely",
      cwd: __dirname,
      script: path.join(".next", "standalone", "server.js"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEMORY ?? "512M",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      min_uptime: "10s",
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: process.env.PORT ?? "3000",
        RACELY_ENABLE_PREVIEW: "false",
      },
    },
  ],
};
