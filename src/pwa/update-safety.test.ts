import { describe, expect, it } from "vitest";
import { canApplyServiceWorkerUpdate } from "./update-safety";

const idle = {
  taskEditorOpen: false,
  projectEditorOpen: false,
  pendingWrites: 0,
  loading: false
};

describe("service worker update safety", () => {
  it("allows an update only when the workspace is idle", () => {
    expect(canApplyServiceWorkerUpdate(idle)).toBe(true);
  });

  it("defers updates while either editor is open", () => {
    expect(canApplyServiceWorkerUpdate({ ...idle, taskEditorOpen: true })).toBe(false);
    expect(canApplyServiceWorkerUpdate({ ...idle, projectEditorOpen: true })).toBe(false);
  });

  it("defers updates during database writes and initial loading", () => {
    expect(canApplyServiceWorkerUpdate({ ...idle, pendingWrites: 1 })).toBe(false);
    expect(canApplyServiceWorkerUpdate({ ...idle, pendingWrites: 2 })).toBe(false);
    expect(canApplyServiceWorkerUpdate({ ...idle, loading: true })).toBe(false);
  });
});
