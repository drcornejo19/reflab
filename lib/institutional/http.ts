import "server-only";

import { NextResponse } from "next/server";
import { InstitutionalContentStorageError } from "@/lib/institutional/contentStorage";
import { InstitutionAccessError } from "@/lib/institutional/server";

export function institutionalJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export function institutionalErrorResponse(
  error: unknown,
  fallback: string
) {
  if (error instanceof InstitutionAccessError) {
    return institutionalJson({ error: error.message }, error.status);
  }
  if (error instanceof InstitutionalContentStorageError) {
    return institutionalJson({ error: error.message }, error.status);
  }
  console.error(fallback, error);
  return institutionalJson({ error: fallback }, 500);
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function nullableText(value: unknown) {
  return cleanText(value) || null;
}

export function nullableDate(value: unknown) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function nullableDateTime(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

export function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function positiveInteger(value: unknown, fallback = 1) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
