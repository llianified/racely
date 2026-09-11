const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicAppUrlValue = process.env.PUBLIC_APP_URL;

if (!token || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  console.error("TELEGRAM_BOT_TOKEN is missing or invalid.");
  process.exit(1);
}
if (!webhookSecret || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET must contain 32-256 safe characters.");
  process.exit(1);
}

let publicAppUrl;
try {
  publicAppUrl = new URL(publicAppUrlValue);
} catch {
  console.error("PUBLIC_APP_URL is missing or invalid.");
  process.exit(1);
}
if (publicAppUrl.protocol !== "https:") {
  console.error("PUBLIC_APP_URL must use HTTPS.");
  process.exit(1);
}
publicAppUrl.hash = "";
publicAppUrl.search = "";
const appUrl = publicAppUrl.toString().replace(/\/$/, "");
const apiBase = `https://api.telegram.org/bot${token}`;

async function call(method, body = {}) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(`Telegram setup failed at ${method}.`);
  }
  return result.result;
}

try {
  const expectedUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "RacelyBot")
    .replace(/^@/, "")
    .toLowerCase();
  const bot = await call("getMe");
  if (bot.username?.toLowerCase() !== expectedUsername) {
    throw new Error(
      `The configured token does not belong to @${expectedUsername}. Set TELEGRAM_BOT_USERNAME to override.`,
    );
  }

  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Buka Racely" },
      { command: "play", description: "Mulai balapan" },
    ],
    scope: { type: "all_private_chats" },
  });
  await call("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Main Racely",
      web_app: { url: appUrl },
    },
  });
  await call("setWebhook", {
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
    max_connections: 20,
  });

  console.log(`@${bot.username} commands, menu, and webhook are configured.`);
} catch (error) {
  // The API base embeds the bot token, so never let a raw message reach the log.
  const detail = (error instanceof Error ? error.message : "Telegram setup failed.")
    .split(token)
    .join("[redacted-token]");
  console.error(detail);
  process.exit(1);
}
