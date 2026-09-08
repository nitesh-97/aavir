/** Small hand-rolled request validation — enough for this app's payloads. */

export class ValidationError extends Error {}

export function str(value: unknown, field: string, opts: { min?: number; max?: number } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${field} is required.`);
  const trimmed = value.trim();
  const { min = 1, max = 5000 } = opts;
  if (trimmed.length < min) throw new ValidationError(`${field} must be at least ${min} characters.`);
  if (trimmed.length > max) throw new ValidationError(`${field} must be under ${max} characters.`);
  return trimmed;
}

export function optionalStr(value: unknown, field: string, max = 5000) {
  if (value == null || value === "") return null;
  return str(value, field, { max });
}

export function num(value: unknown, field: string, opts: { min?: number; max?: number } = {}) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`${field} must be a number.`);
  const { min = -Infinity, max = Infinity } = opts;
  if (parsed < min) throw new ValidationError(`${field} must be at least ${min}.`);
  if (parsed > max) throw new ValidationError(`${field} must be at most ${max}.`);
  return parsed;
}

export function optionalNum(value: unknown, field: string, opts: { min?: number; max?: number } = {}) {
  if (value == null || value === "") return null;
  return num(value, field, opts);
}

export function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`);
  return value;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function hexColor(value: unknown, field: string) {
  const raw = str(value, field, { max: 7 });
  if (!HEX.test(raw)) throw new ValidationError(`${field} must be a hex colour like #4f7cff.`);
  return raw.toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(value: unknown) {
  const raw = str(value, "Email", { max: 200 }).toLowerCase();
  if (!EMAIL.test(raw)) throw new ValidationError("That doesn't look like an email address.");
  return raw;
}

/** Turns any thrown error into a JSON response, keeping messages user-facing. */
export function errorResponse(error: unknown, fallbackStatus = 500) {
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  const message =
    fallbackStatus === 500 ? "Something went wrong on our side." : String(error);
  return Response.json({ error: message }, { status: fallbackStatus });
}
