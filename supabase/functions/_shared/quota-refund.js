/**
 * Runs a bounded refund and schedules one idempotent background retry when the
 * primary attempt throws, times out, or resolves with a Supabase RPC error.
 */
export async function refundQuotaSafely({
  primaryRefund,
  retryRefund,
  waitUntil,
}) {
  try {
    const { error } = await primaryRefund();
    if (error) throw new Error("Quota refund RPC failed.");
  } catch {
    const retry = Promise.resolve().then(async () => {
      try {
        const { error } = await retryRefund();
        if (error) throw new Error("Quota refund retry RPC failed.");
      } catch {
        // The RPC is idempotent; intentionally omit request and error data.
      }
    });
    waitUntil?.(retry);
  }
}
