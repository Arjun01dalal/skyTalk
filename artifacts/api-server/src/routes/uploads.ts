import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import express from "express";
import multer from "multer";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Dev runs with cwd=artifacts/api-server, production runs with cwd=workspace root
const UPLOAD_DIR = process.cwd().endsWith("api-server")
  ? path.resolve(process.cwd(), "uploads")
  : path.resolve(process.cwd(), "artifacts/api-server/uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  // Encrypted attachments (E2EE direct/group chats): opaque ciphertext blobs.
  "application/octet-stream",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Browsers append codec parameters to recorded audio/video
    // (e.g. "audio/webm;codecs=opus") — compare the base type only.
    const baseType = file.mimetype.split(";")[0]!.trim().toLowerCase();
    cb(null, ALLOWED_MIME.has(baseType));
  },
});

router.post("/uploads", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded or file type not allowed" });
    return;
  }
  res.status(201).json({
    url: `/api/uploads/${req.file.filename}`,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
  });
});

// Serve uploaded files
router.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'");
    },
  }),
);

export default router;
