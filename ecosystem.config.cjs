const fs = require("node:fs");
const path = require("node:path");

/**
 * Secrets live outside the repository. Point RACELY_ENV_FILE at the env file on the
 * instance (default /etc/racely/racely.env, chmod 600, owned by the deploy user) and
 * Node loads it directly — nothing secret is ever read from or written to this repo.
 */
const envFile = process.env.RACELY_ENV_FILE ?? "/etc/racely/racely.env";
const nodeArgs = fs.existsSync(envFile) ? [`--env-file=${envFile}`] : [];
const logDir = process.env.RACELY_LOG_DIR ?? null;

module.exports = {
  apps: [
    {
      name: "racely",
      cwd: __dirname,
      script: path.join(".next", "standalone", "server.js"),
      node_args: nodeArgs,
      // The webhook dedupe fallback and the rate limiter are per-process, so Racely
      // runs as a single fork. Scale out only after moving both to Postgres/Redis.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEMORY ?? "512M",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 2_000,
      exp_backoff_restart_delay: 200,
      merge_logs: true,
      time: true,
      ...(logDir
        ? {
            out_file: path.join(logDir, "racely-out.log"),
            error_file: path.join(logDir, "racely-error.log"),
          }
        : {}),
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: process.env.PORT ?? "3000",
        RACELY_ENABLE_PREVIEW: "false",
      },
    },
  ],
};
