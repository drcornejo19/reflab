import { CoachValidationError } from "@/lib/coach/errors";

export function asRecord(value: unknown, field = "body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoachValidationError(`El campo ${field} debe ser un objeto valido.`);
  }

  return value as Record<string, unknown>;
}

export function asArray(
  value: unknown,
  field: string,
  options: { maxItems?: number } = {}
) {
  if (!Array.isArray(value)) {
    throw new CoachValidationError(`El campo ${field} debe ser una lista valida.`);
  }

  const maxItems = options.maxItems ?? 20;
  if (value.length > maxItems) {
    throw new CoachValidationError(
      `El campo ${field} admite como maximo ${maxItems} elementos.`
    );
  }

  return value;
}

export function asString(
  value: unknown,
  field: string,
  options: { required?: boolean; maxLength?: number } = {}
) {
  const required = options.required ?? false;
  const maxLength = options.maxLength ?? 2_000;

  if (value === null || value === undefined) {
    if (required) throw new CoachValidationError(`Falta el campo ${field}.`);
    return null;
  }

  if (typeof value !== "string") {
    throw new CoachValidationError(`El campo ${field} debe ser texto.`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    throw new CoachValidationError(`Falta el campo ${field}.`);
  }
  if (normalized.length > maxLength) {
    throw new CoachValidationError(
      `El campo ${field} supera el maximo de ${maxLength} caracteres.`
    );
  }

  return normalized || null;
}

export function asNumber(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; required?: boolean } = {}
) {
  if (value === null || value === undefined || value === "") {
    if (options.required) throw new CoachValidationError(`Falta el campo ${field}.`);
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CoachValidationError(`El campo ${field} debe ser numerico.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new CoachValidationError(
      `El campo ${field} no puede ser menor que ${options.min}.`
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new CoachValidationError(
      `El campo ${field} no puede ser mayor que ${options.max}.`
    );
  }

  return value;
}

export function asBoolean(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") {
    throw new CoachValidationError(`El campo ${field} debe ser verdadero o falso.`);
  }
  return value;
}

export function asOptionalStringArray(
  value: unknown,
  field: string,
  maxItems = 10
) {
  if (value === null || value === undefined) return [];

  return asArray(value, field, { maxItems }).map((item, index) => {
    const parsed = asString(item, `${field}[${index}]`, {
      required: true,
      maxLength: 500,
    });
    return parsed as string;
  });
}
