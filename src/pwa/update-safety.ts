export interface UpdateSafetyState {
  taskEditorOpen: boolean;
  projectEditorOpen: boolean;
  pendingWrites: number;
  loading: boolean;
}

/** Prevent an app-shell reload while the user is editing or the database is busy. */
export function canApplyServiceWorkerUpdate(state: UpdateSafetyState): boolean {
  return !state.taskEditorOpen &&
    !state.projectEditorOpen &&
    state.pendingWrites === 0 &&
    !state.loading;
}
