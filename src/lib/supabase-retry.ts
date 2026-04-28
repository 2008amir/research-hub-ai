const TRANSIENT_CODES = new Set(["PGRST001", "PGRST002"]);

function isTransientError(error: unknown) {
  const value = error as { code?: string; message?: string; details?: string; name?: string } | null;
  const message = `${value?.name ?? ""} ${value?.message ?? ""} ${value?.details ?? ""}`.toLowerCase();

  return Boolean(
    (value?.code && TRANSIENT_CODES.has(value.code)) ||
    message.includes("schema cache") ||
    message.includes("retrying") ||
    message.includes("no connection") ||
    message.includes("failed to fetch") ||
    message.includes("abort") ||
    message.includes("network") ||
    message.includes("timeout"),
  );
}

function asFailedResult<T extends { error: unknown }>(error: unknown): T {
  return { data: null, error } as T;
}

export async function withSupabaseRetry<T extends { error: unknown }>(
  request: () => PromiseLike<T>,
  attempts = 4,
): Promise<T> {
  let result: T;

  try {
    result = await request();
  } catch (error) {
    result = asFailedResult<T>(error);
  }

  for (let i = 1; result.error && isTransientError(result.error) && i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 450 * i));
    try {
      result = await request();
    } catch (error) {
      result = asFailedResult<T>(error);
    }
  }

  return result;
}
