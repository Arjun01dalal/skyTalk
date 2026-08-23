import { Router, type IRouter } from "express";
import {
  db,
  supportCategoriesTable,
  aiSettingsTable,
  messageTemplatesTable,
  type SupportCategory,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  CreateSupportCategoryBody,
  UpdateAiSettingsBody,
  CreateMessageTemplateBody,
  UpdateMessageTemplateBody,
} from "@workspace/api-zod";
import {
  type AuthenticatedRequest,
  requireAuth,
  requireAdmin,
} from "../lib/auth";
import { getAiSettings } from "../lib/ai";
import { getTelegramBotUsername } from "../lib/telegram";
import { translateLabelsCached, SUPPORTED_LANGUAGES } from "../lib/translate";

const router: IRouter = Router();

function serializeCategory(c: SupportCategory) {
  return {
    id: c.id,
    title: c.title,
    titleEn: c.title,
    description: c.description,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    aiPrompt: c.aiPrompt,
    requiresInput: c.requiresInput,
    inputPrompt: c.inputPrompt,
    language: c.language,
    parentId: c.parentId,
  };
}

function serializeSettings(s: Awaited<ReturnType<typeof getAiSettings>>) {
  return {
    aiEnabled: s.aiEnabled,
    systemPrompt: s.systemPrompt,
    greetingMessage: s.greetingMessage,
    confidenceThreshold: s.confidenceThreshold,
    maxAiResponses: s.maxAiResponses,
    autoEscalation: s.autoEscalation,
    supportPhone: s.supportPhone,
    telegramChatIds: s.telegramChatIds,
  };
}

// ---- Quick-reply message templates ----

// Staff (agent/admin) list templates to insert into the composer.
router.get(
  "/message-templates",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    if (req.auth!.role === "user") {
      res.status(403).json({ error: "Staff only" });
      return;
    }
    let rows = await db
      .select()
      .from(messageTemplatesTable)
      .orderBy(asc(messageTemplatesTable.id));
    // Self-heal the greeting invariant: exactly one opening and one closing
    // row must exist (a partial unique index prevents duplicates; this
    // recreates them with defaults if they are ever missing).
    const missing: { title: string; content: string; kind: "opening" | "closing" }[] = [];
    if (!rows.some((t) => t.kind === "opening")) {
      missing.push({ title: "Opening greeting", content: "Hi {{customer_name}},", kind: "opening" });
    }
    if (!rows.some((t) => t.kind === "closing")) {
      missing.push({ title: "Closing greeting", content: "Thank You\n{{agent_name}}", kind: "closing" });
    }
    if (missing.length > 0) {
      await db
        .insert(messageTemplatesTable)
        .values(missing)
        .onConflictDoNothing();
      rows = await db
        .select()
        .from(messageTemplatesTable)
        .orderBy(asc(messageTemplatesTable.id));
    }
    res.json(rows.map((t) => ({ id: t.id, title: t.title, content: t.content, categoryId: t.categoryId, kind: t.kind })));
  },
);

router.post(
  "/admin/message-templates",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const parsed = CreateMessageTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid template" });
      return;
    }
    const [row] = await db
      .insert(messageTemplatesTable)
      .values({
        title: parsed.data.title.trim(),
        content: parsed.data.content.trim(),
        categoryId: parsed.data.categoryId ?? null,
      })
      .returning();
    res.status(201).json({ id: row!.id, title: row!.title, content: row!.content, categoryId: row!.categoryId, kind: row!.kind });
  },
);

router.put(
  "/admin/message-templates/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = UpdateMessageTemplateBody.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid template" });
      return;
    }
    const [row] = await db
      .update(messageTemplatesTable)
      .set({
        title: parsed.data.title.trim(),
        content: parsed.data.content.trim(),
        categoryId: parsed.data.categoryId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(messageTemplatesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ id: row.id, title: row.title, content: row.content, categoryId: row.categoryId, kind: row.kind });
  },
);

router.delete(
  "/admin/message-templates/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(messageTemplatesTable)
      .where(eq(messageTemplatesTable.id, id));
    if (existing && existing.kind !== "normal") {
      res.status(400).json({ error: "Opening/closing greetings cannot be deleted — edit them instead" });
      return;
    }
    await db.delete(messageTemplatesTable).where(eq(messageTemplatesTable.id, id));
    res.json({ ok: true });
  },
);

// Active categories for end users. Optional `?lang=` localizes the
// customer-facing text fields (title/description/inputPrompt); results are
// cached in memory so only the first request per language pays for the LLM.
router.get(
  "/support-categories",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const rows = await db
      .select()
      .from(supportCategoriesTable)
      .where(eq(supportCategoriesTable.isActive, true))
      .orderBy(
        asc(supportCategoriesTable.sortOrder),
        asc(supportCategoriesTable.id),
      );
    const lang = String(req.query.lang ?? "en");
    let out = rows.map(serializeCategory);
    if (lang !== "en" && SUPPORTED_LANGUAGES[lang]) {
      const texts: string[] = [];
      for (const c of out) {
        texts.push(c.title);
        if (c.description) texts.push(c.description);
        if (c.inputPrompt) texts.push(c.inputPrompt);
      }
      const translated = await translateLabelsCached(texts, lang);
      const map = new Map(texts.map((t, i) => [t, translated[i]]));
      out = out.map((c) => ({
        ...c,
        // titleEn stays English so flow logic can match on it.
        title: map.get(c.title) ?? c.title,
        description: c.description ? (map.get(c.description) ?? c.description) : c.description,
        inputPrompt: c.inputPrompt ? (map.get(c.inputPrompt) ?? c.inputPrompt) : c.inputPrompt,
      }));
    }
    res.json(out);
  },
);

// Admin: full list
router.get(
  "/admin/support-categories",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    const rows = await db
      .select()
      .from(supportCategoriesTable)
      .orderBy(
        asc(supportCategoriesTable.sortOrder),
        asc(supportCategoriesTable.id),
      );
    res.json(rows.map(serializeCategory));
  },
);

router.post(
  "/admin/support-categories",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const parsed = CreateSupportCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    const d = parsed.data;
    if (d.parentId != null) {
      const [parent] = await db
        .select()
        .from(supportCategoriesTable)
        .where(eq(supportCategoriesTable.id, d.parentId));
      if (!parent) {
        res.status(400).json({ error: "Parent category not found" });
        return;
      }
    }
    const [row] = await db
      .insert(supportCategoriesTable)
      .values({
        title: d.title,
        description: d.description ?? null,
        icon: d.icon ?? null,
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive ?? true,
        aiPrompt: d.aiPrompt ?? null,
        requiresInput: d.requiresInput ?? false,
        inputPrompt: d.inputPrompt ?? null,
        language: d.language ?? "en",
        parentId: d.parentId ?? null,
      })
      .returning();
    res.status(201).json(serializeCategory(row!));
  },
);

router.put(
  "/admin/support-categories/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = CreateSupportCategoryBody.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const d = parsed.data;
    if (d.parentId === id) {
      res.status(400).json({ error: "Category cannot be its own parent" });
      return;
    }
    const [row] = await db
      .update(supportCategoriesTable)
      .set({
        title: d.title,
        description: d.description ?? null,
        icon: d.icon ?? null,
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive ?? true,
        aiPrompt: d.aiPrompt ?? null,
        requiresInput: d.requiresInput ?? false,
        inputPrompt: d.inputPrompt ?? null,
        language: d.language ?? "en",
        parentId: d.parentId ?? null,
      })
      .where(eq(supportCategoriesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(serializeCategory(row));
  },
);

router.delete(
  "/admin/support-categories/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .delete(supportCategoriesTable)
      .where(eq(supportCategoriesTable.id, id));
    res.json({ ok: true });
  },
);

// Any authenticated user (customers included) can fetch the configured
// support phone number so the call button can dial it.
router.get(
  "/support-phone",
  requireAuth,
  async (_req: AuthenticatedRequest, res) => {
    const s = await getAiSettings();
    res.json({ phone: s.supportPhone ?? null });
  },
);

router.get(
  "/admin/ai-settings",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    res.json({
      ...serializeSettings(await getAiSettings()),
      telegramBotUsername: await getTelegramBotUsername(),
    });
  },
);

router.put(
  "/admin/ai-settings",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const parsed = UpdateAiSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid settings" });
      return;
    }
    const current = await getAiSettings();
    const [row] = await db
      .update(aiSettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(aiSettingsTable.id, current.id))
      .returning();
    res.json({
      ...serializeSettings(row!),
      telegramBotUsername: await getTelegramBotUsername(),
    });
  },
);

export default router;
