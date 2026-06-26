import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../env.js";
import { AppError } from "../lib/errors.js";

// Ensure the upload directory exists at boot.
mkdirSync(env.uploadDir, { recursive: true });

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${randomUUID()}${ext}`);
  },
});

/** Single-image upload under the form field `photo`. Max 2 MB, raster images only. */
export const uploadImage = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new AppError("VALIDATION_ERROR", "Only PNG, JPEG, WEBP or GIF images are allowed", 400));
      return;
    }
    cb(null, true);
  },
}).single("photo");

/** Public URL path stored in the DB / served statically by Express. */
export function publicUrlFor(filename: string): string {
  return `/uploads/${filename}`;
}
