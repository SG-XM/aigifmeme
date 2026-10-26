// Generating an image spends credits, so the chat page fires this when a turn
// settles — same shape as the sidebar's chats-changed event.
// Kept out of the plan card so marketing pages can listen without loading
// the upgrade dialog.
export const CREDITS_CHANGED_EVENT = 'uptown:credits-changed';

export function notifyCreditsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CREDITS_CHANGED_EVENT));
}
