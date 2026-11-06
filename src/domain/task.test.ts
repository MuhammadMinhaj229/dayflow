import { describe, expect, it } from "vitest";
import { completionRate, formatDateLabel, localDateISO } from "./task";
import type { Task } from "./task";

function item(status: Task["status"]): Pick<Task, "status"> {
  return { status };
}

describe("completionRate", () => {
  it("returns zero for an empty list", () => {
    expect(completionRate([])).toBe(0);
  });

  it("excludes cancelled tasks from the denominator", () => {
    expect(completionRate([item("done"), item("next"), item("cancelled")])).toBe(50);
  });

  it("returns one hundred when every active task is complete", () => {
    expect(completionRate([item("done"), item("done"), item("cancelled")])).toBe(100);
  });
});

describe("localDateISO", () => {
  it("returns a valid local calendar date", () => {
    expect(localDateISO(new Date("2026-11-07T12:00:00.000Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDateLabel", () => {
  it("formats a date without moving to the previous day", () => {
    expect(formatDateLabel("2026-11-07")).toContain("7");
  });
});
