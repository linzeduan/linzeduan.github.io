import type { Profile, Round, SharedView } from "./types";
export function sharedView(
  round: Round,
  profile: Profile,
  dissolved: boolean,
): SharedView {
  const own = round.submissions[profile];
  const other = round.submissions[profile === "a" ? "b" : "a"];
  const state = dissolved
    ? "dissolved"
    : round.closed || own?.withdrawn || other?.withdrawn
      ? "withdrawn"
      : own && other
        ? "unlocked"
        : own
          ? "waiting"
          : other
            ? "partner-ready"
            : "draft";
  return {
    roundId: round.id,
    questionId: round.questionId,
    state,
    own,
    ...(state === "unlocked" ? { partner: other } : {}),
    comments:
      state === "unlocked"
        ? round.comments
        : round.comments.filter((c) => c.owner === profile),
  };
}
export function requireText(text: string, limit = 12000): string {
  if (!text.trim()) throw new Error("先写下你的想法，再正式提交。");
  if (text.length > limit) throw new Error(`内容请控制在 ${limit} 字以内。`);
  return text;
}
