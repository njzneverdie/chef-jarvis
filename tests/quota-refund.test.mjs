import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { refundQuotaSafely } from "../supabase/functions/_shared/quota-refund.js";

test("a resolved primary RPC error schedules the existing background retry", async () => {
  const calls = [];
  let backgroundWork;

  await refundQuotaSafely({
    primaryRefund: async () => {
      calls.push("primary");
      return { data: null, error: { message: "resolved primary error" } };
    },
    retryRefund: async () => {
      calls.push("retry");
      return { data: null, error: null };
    },
    waitUntil(work) {
      backgroundWork = work;
    },
  });

  assert.ok(backgroundWork, "resolved RPC errors must use the background retry path");
  await backgroundWork;
  assert.deepEqual(calls, ["primary", "retry"]);
});

test("thrown primary failures still retry and resolved retry errors are inspected without leaking data", async () => {
  const logs = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  let backgroundWork;
  let retryErrorInspections = 0;
  console.error = (...values) => logs.push(values);
  console.warn = (...values) => logs.push(values);
  try {
    await refundQuotaSafely({
      primaryRefund: async () => {
        throw new Error("user-sensitive-primary");
      },
      retryRefund: async () => ({
        data: null,
        get error() {
          retryErrorInspections += 1;
          return { message: "user-sensitive-retry" };
        },
      }),
      waitUntil(work) {
        backgroundWork = work;
      },
    });

    assert.ok(backgroundWork);
    await backgroundWork;
    assert.equal(retryErrorInspections, 1, "the resolved retry error must be read");
    assert.deepEqual(logs, []);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});

test("a successful primary refund does not retry", async () => {
  let retries = 0;
  let scheduled = false;
  await refundQuotaSafely({
    primaryRefund: async () => ({ data: null, error: null }),
    retryRefund: async () => {
      retries += 1;
      return { data: null, error: null };
    },
    waitUntil() {
      scheduled = true;
    },
  });

  assert.equal(retries, 0);
  assert.equal(scheduled, false);
});

test("the Edge refund wiring reuses the same idempotency identifiers for both attempts", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    edge,
    /runQuotaRefundSafely\(\{[\s\S]*primaryRefund:[\s\S]*refund_chef_meal_plan_quota[\s\S]*p_user_id: userId[\s\S]*p_request_id: requestId[\s\S]*retryRefund:[\s\S]*refund_chef_meal_plan_quota[\s\S]*p_user_id: userId[\s\S]*p_request_id: requestId[\s\S]*waitUntil/,
  );
});
