export type OnboardingItemId = "install" | "save" | "clipboard" | "remote" | "editor";

export interface OnboardingState {
  dismissed: boolean;
  completed: OnboardingItemId[];
}

export interface OnboardingCompletionContext {
  hasConversations: boolean;
  clipboardActive: boolean;
  remoteConfigured: boolean;
  editorConfigured: boolean;
}

export const ONBOARDING_ITEM_IDS: readonly OnboardingItemId[] = [
  "install",
  "save",
  "clipboard",
  "remote",
  "editor",
];

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  dismissed: false,
  completed: ["install"],
};

export function hasOnboardingItemCompleted(state: OnboardingState, id: OnboardingItemId) {
  return state.completed.includes(id);
}

export function hasOnboardingRemoteConfigured(gitRemote: string | null | undefined) {
  return Boolean(gitRemote);
}

export function shouldCompleteInstallStep() {
  return true;
}

export function shouldCompleteSaveStep(ctx: OnboardingCompletionContext) {
  return ctx.hasConversations;
}

export function shouldCompleteClipboardStep(ctx: OnboardingCompletionContext) {
  return ctx.clipboardActive;
}

export function shouldCompleteRemoteStep(ctx: OnboardingCompletionContext) {
  return ctx.remoteConfigured;
}

export function shouldCompleteEditorStep(ctx: OnboardingCompletionContext) {
  return ctx.editorConfigured;
}

export function getAutoCompletedOnboardingItems(ctx: OnboardingCompletionContext): OnboardingItemId[] {
  return ONBOARDING_ITEM_IDS.filter((id) => {
    if (id === "install") return shouldCompleteInstallStep();
    if (id === "save") return shouldCompleteSaveStep(ctx);
    if (id === "clipboard") return shouldCompleteClipboardStep(ctx);
    if (id === "remote") return shouldCompleteRemoteStep(ctx);
    return shouldCompleteEditorStep(ctx);
  });
}

export function completeOnboardingItem(state: OnboardingState, id: OnboardingItemId): OnboardingState {
  if (hasOnboardingItemCompleted(state, id)) return state;
  return { ...state, completed: [...state.completed, id] };
}

export function mergeOnboardingCompletion(state: OnboardingState, ids: readonly OnboardingItemId[]) {
  const completed = new Set<OnboardingItemId>(state.completed);
  ids.forEach((id) => completed.add(id));
  const nextCompleted = Array.from(completed);
  const changed = nextCompleted.length !== state.completed.length;
  return {
    changed,
    state: changed ? { ...state, completed: nextCompleted } : state,
  };
}

export function dismissOnboarding(state: OnboardingState): OnboardingState {
  if (state.dismissed) return state;
  return { ...state, dismissed: true };
}

export function getOnboardingCompletedCount(state: OnboardingState) {
  return ONBOARDING_ITEM_IDS.filter((id) => hasOnboardingItemCompleted(state, id)).length;
}

export function isOnboardingDone(state: OnboardingState) {
  return getOnboardingCompletedCount(state) === ONBOARDING_ITEM_IDS.length;
}

export function shouldRenderOnboardingChecklist(state: OnboardingState) {
  return !state.dismissed;
}

export function shouldRunOnboardingAutoDismissCountdown(state: OnboardingState) {
  return isOnboardingDone(state) && !state.dismissed;
}

export function getOnboardingProgressValue(state: OnboardingState) {
  return (getOnboardingCompletedCount(state) / ONBOARDING_ITEM_IDS.length) * 100;
}

export function getOnboardingCountLabel(state: OnboardingState) {
  return `${getOnboardingCompletedCount(state)}/${ONBOARDING_ITEM_IDS.length}`;
}

export function getOnboardingTitleKey(state: OnboardingState) {
  return isOnboardingDone(state) ? "onboarding.allDone" : "onboarding.title";
}

export function getFirstSaveDescriptionKey(editorConfigured: boolean) {
  return editorConfigured ? "onboarding.firstSaveDesc" : "onboarding.firstSaveNeedEditorDesc";
}

export function getFirstSaveActionLabelKey(editorConfigured: boolean) {
  return editorConfigured ? undefined : "onboarding.goToSettings";
}

export function shouldShowOnboardingItemAction(done: boolean, hasAction: boolean) {
  return !done && hasAction;
}
