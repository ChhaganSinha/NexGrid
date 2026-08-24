// Locale resolution and message formatting.

import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LOCALE, resolveLocale, formatMessage } from "../dist/index.js";

test("resolveLocale returns the defaults when given nothing", () => {
  assert.equal(resolveLocale(), DEFAULT_LOCALE);
  assert.equal(resolveLocale(undefined).emptyText, DEFAULT_LOCALE.emptyText);
});

test("a partial locale overrides only what it names", () => {
  const locale = resolveLocale({ emptyText: "Aucun résultat" });

  assert.equal(locale.emptyText, "Aucun résultat");
  assert.equal(locale.retryButton, DEFAULT_LOCALE.retryButton, "unnamed keys keep their default");
});

test("every default locale value is a non-empty string", () => {
  for (const [key, value] of Object.entries(DEFAULT_LOCALE)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
    assert.ok(value.length > 0, `${key} must not be empty`);
  }
});

test("placeholders are substituted", () => {
  assert.equal(
    formatMessage(DEFAULT_LOCALE.showingRange, { start: 21, end: 40, total: "1,284" }),
    "Showing 21 to 40 of 1,284 entries",
  );
  assert.equal(formatMessage(DEFAULT_LOCALE.selectedBadge, { count: 3 }), "3 selected");
});

test("an unknown placeholder is left intact rather than blanked", () => {
  assert.equal(formatMessage("Hello {name}, page {page}", { name: "Ada" }), "Hello Ada, page {page}");
});

test("a message with no placeholders is returned unchanged", () => {
  assert.equal(formatMessage("No records found.", {}), "No records found.");
});
