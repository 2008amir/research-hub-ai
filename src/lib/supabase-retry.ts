const TRANSIENT_CODES = new Set(["PGRST001", "PGRST002"]);

function isTransientError(error: unknown) {
  const value = error as { code?: string; message?: string; details?: string } | null;
  const message = `${value?.message ?? ""} ${value?.details ?? ""}`.toLowerCase();

  return Boolean(
    (value?.code && TRANSIENT_CODES.has(value.code)) ||
    message.includes("schema cache") ||
    message.includes("retrying") ||
    message.includes("no connection") ||
    message.includes("network") ||
    message.includes("timeout"),
  );
}

export async function withSupabaseRetry<T extends { error: unknown }>(
  request: () => PromiseLike<T>,
  attempts = 4,
): Promise<T> {
  let result = await request();

  for (let i = 1; result.error && isTransientError(result.error) && i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 350 * i));
    result = await request();
  }

  return result;
}
