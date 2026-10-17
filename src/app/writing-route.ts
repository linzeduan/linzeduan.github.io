import type { Entry, SharedView } from "../domain/types";

export type WritingTarget = {
  questionId: string;
  roundId?: string;
  entryId?: string;
};
export function writingTarget(
  params: URLSearchParams,
  entries: Entry[],
  rounds: SharedView[],
  defaults: { questionId?: string; roundId?: string },
): WritingTarget | undefined {
  const requestedEntry = params.get("entry");
  const requestedRound = params.get("round");
  const entry =
    requestedEntry === null
      ? undefined
      : entries.find((e) => e.id === requestedEntry);
  if (requestedEntry !== null && !entry) return;
  const roundId =
    requestedRound ??
    entry?.roundId ??
    (!params.has("q") && !params.has("entry") ? defaults.roundId : undefined);
  const round =
    roundId === undefined
      ? undefined
      : rounds.find((r) => r.roundId === roundId);
  if (roundId !== undefined && !round) return;
  const questionId =
    params.get("q") ??
    entry?.questionId ??
    round?.questionId ??
    defaults.questionId ??
    "q057";
  if (
    (entry && (entry.questionId !== questionId || entry.roundId !== roundId)) ||
    (round && round.questionId !== questionId)
  )
    return;
  return {
    questionId,
    ...(roundId ? { roundId } : {}),
    ...(entry ? { entryId: entry.id } : {}),
  };
}
