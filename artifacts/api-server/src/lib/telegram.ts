import { logger } from "./logger";
import { getAiSettings } from "./ai";
import { db, aiSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Sends a Telegram message to every configured admin chat ID when a chat is
// escalated to admin. Chat IDs are configured from the admin panel
// (AI settings → "Telegram chat IDs", comma-separated). Requires the
// TELEGRAM_BOT_TOKEN secret. Failures are logged, never thrown — a broken
// Telegram setup must not block the escalation itself.
// Bot username (e.g. "chatspace_admin_notifier_bot") fetched once from
// Telegram getMe and cached, so the admin panel can show a copyable bot link.
let cachedBotUsername: string | null | undefined;
export async function getTelegramBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return (cachedBotUsername = null);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
    cachedBotUsername = data.ok ? (data.result?.username ?? null) : null;
  } catch {
    cachedBotUsername = undefined; // retry next time
    return null;
  }
  return cachedBotUsername;
}

// Auto-registration: anyone who messages the bot (e.g. "hi") gets their chat
// ID appended to the admin panel's Telegram chat ID list and starts receiving
// escalation alerts. Runs as a lightweight getUpdates poll every 20s.
const POLL_INTERVAL_MS = 20_000;
let pollOffset = 0;

async function pollRegistrations(token: string): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?offset=${pollOffset}&allowed_updates=%5B%22message%22%5D`,
  );
  if (!res.ok) return;
  const data = (await res.json()) as {
    ok: boolean;
    result?: { update_id: number; message?: { chat?: { id: number; first_name?: string; title?: string; type?: string } } }[];
  };
  if (!data.ok || !data.result?.length) return;

  const settings = await getAiSettings();
  const ids = (settings.telegramChatIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let changed = false;

  for (const upd of data.result) {
    pollOffset = Math.max(pollOffset, upd.update_id + 1);
    const chat = upd.message?.chat;
    if (!chat?.id) continue;
    const chatId = String(chat.id);
    const already = ids.includes(chatId);
    if (!already) {
      ids.push(chatId);
      changed = true;
      logger.info({ chatId, name: chat.first_name ?? chat.title }, "Telegram chat auto-registered for escalation alerts");
    }
    // Confirm to the sender either way so "hi" always gets a reply.
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat.id,
        text: already
          ? "✅ You're already registered for SkyTalk admin escalation alerts."
          : "🎉 Registered! You'll now receive a Telegram alert whenever a chat is escalated to admin.",
      }),
    }).catch(() => {});
  }

  if (changed) {
    await db
      .update(aiSettingsTable)
      .set({ telegramChatIds: ids.join(","), updatedAt: new Date() })
      .where(eq(aiSettingsTable.id, settings.id));
  }
}

export function startTelegramRegistrationPoller(): void {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set; Telegram auto-registration disabled");
    return;
  }
  setInterval(() => {
    pollRegistrations(token).catch((err) =>
      logger.error({ err }, "Telegram registration poll failed"),
    );
  }, POLL_INTERVAL_MS);
  logger.info("Telegram auto-registration poller started");
}

export async function notifyAdminsOnTelegram(text: string): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set; skipping Telegram notification");
    return;
  }
  let ids: string[] = [];
  try {
    const settings = await getAiSettings();
    ids = (settings.telegramChatIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    logger.error({ err }, "Failed to load Telegram chat IDs");
    return;
  }
  if (ids.length === 0) return;

  await Promise.all(
    ids.map(async (chatId) => {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text }),
          },
        );
        if (!res.ok) {
          const body = await res.text();
          logger.error(
            { chatId, status: res.status, body },
            "Telegram sendMessage failed",
          );
        }
      } catch (err) {
        logger.error({ chatId, err }, "Telegram sendMessage error");
      }
    }),
  );
}
