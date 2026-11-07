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

describe("timezone-aware localDateISO", () => {
  it("uses the selected timezone when a UTC instant crosses midnight", () => {
    expect(localDateISO(new Date("2026-11-07T20:00:00.000Z"), "Asia/Kolkata")).toBe("2026-11-08");
    expect(localDateISO(new Date("2026-11-07T20:00:00.000Z"), "UTC")).toBe("2026-11-07");
  });
});

describe("formatDateLabel", () => {
  it("formats a date without moving to the previous day", () => {
    expect(formatDateLabel("2026-11-07", "Asia/Kolkata")).toContain("7");
    expect(formatDateLabel("2026-11-07", "UTC")).toContain("7");
  });

  it("uses the supplied timezone when formatting dates near midnight", () => {
    const date = "2026-11-08";
    expect(formatDateLabel(date, "Asia/Kolkata")).toContain("8");
    expect(formatDateLabel(date, "Pacific/Honolulu")).toContain("8");
  });
});
