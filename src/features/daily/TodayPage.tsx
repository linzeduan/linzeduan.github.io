import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  LockKeyhole,
  Send,
  Feather,
  SkipForward,
} from "lucide-react";
import { useApp } from "../../app/context";
import { getQuestion } from "../../data/catalog";
import { categoryNames } from "../../domain/types";
import { dayKey, dateLabel } from "../../domain/date";
import { ConnectedJournal } from "../../data/http/connected-journal";
import { downloadJson } from "../settings/SettingsPage";

export function TodayPage({
  questionId = "q057",
  entryId,
  roundId,
}: {
  questionId?: string;
  entryId?: string;
  roundId?: string;
}) {
  const { profile, snapshot, repo, run, confirm } = useApp();
  const q = getQuestion(questionId);
  const entry = snapshot.entries.findLast((item) =>
    entryId
      ? item.id === entryId
      : item.questionId === questionId &&
        (repo.mode === "demo" ||
          (roundId ? item.roundId === roundId : !item.roundId)),
  );
  const round = snapshot.roundViews.find((item) =>
    roundId
      ? item.roundId === roundId
      : repo.mode === "demo" && item.questionId === questionId,
  );
  const text = entry?.text ?? "",
    note = entry?.note ?? "";
  const submitted = Boolean(round?.own);
  const skipped = snapshot.skipped.includes(questionId);
  const save = (nextText: string, nextNote: string) =>
    run(() => {
      repo.save(
        profile,
        questionId,
        nextText,
        nextNote,
        entry?.revision ?? 0,
        entry?.id,
        roundId,
      );
    });
  const local = repo instanceof ConnectedJournal ? repo : undefined;
  const status = repo.saveStatus(entry?.id);
  const canShare =
    Boolean(round) &&
    !snapshot.dissolved &&
    !submitted &&
    !round?.awaitingAcceptance &&
    !["withdrawn", "dissolved", "unavailable"].includes(round?.state ?? "");
  const submit = () =>
    confirm({
      title: "把这份答案放进交集？",
      description:
        "提交后，这一版答案会固定下来。双方都提交，才能看见彼此。你仍可以撤回后续访问。",
      label: "确认正式提交",
      action: () => repo.submit(profile, round!.roundId, text),
    });
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE CLOSER, AT YOUR OWN PACE</span>
          <h1>
            {(
              local
                ? roundId === local.state.todayRoundId
                : questionId === "q057"
            )
              ? "今天，聊一点自己"
              : "给自己一个回答"}
          </h1>
          <p>不必想得周全，写下此刻最真实的想法就好。</p>
        </div>
        <a className="text-link desktop-only" href="#/archive">
          翻一翻题库 <ArrowUpRight size={16} />
        </a>
      </header>
      <section className="question-card" aria-labelledby="question-title">
        <div className="question-meta">
          <span>
            <span className="tiny-dot" />
            {categoryNames[q.category]}
          </span>
          <span>原题 {String(q.originalNumber).padStart(3, "0")} / 400</span>
        </div>
        <div className="question-main">
          <span className="question-mark" aria-hidden="true">
            “
          </span>
          <h2 id="question-title">
            {q.content}
            <span className="question-punctuation">？</span>
          </h2>
          <div className="question-orbits" aria-hidden="true">
            <i />
            <i />
            <span>
              在答案里
              <br />
              遇见你自己
            </span>
          </div>
        </div>
        <div className="question-bottom">
          <span>
            <BookOpen size={15} />
            {q.sensitivity === "high"
              ? "这道题涉及较私人的内容，随时可以跳过"
              : q.difficulty === 3
                ? "慢一点，给思考留些时间"
                : "一个小问题，一次新的认识"}
          </span>
          <button
            className="quiet-button"
            onClick={() =>
              run(
                () => repo.skip(profile, questionId),
                "已暂时放下，随时可以回来。",
              )
            }
          >
            <SkipForward size={14} />
            {skipped ? "已暂时跳过" : "今天想先跳过"}
          </button>
        </div>
      </section>
      <div className="writing-layout">
        <section className="paper-card writing-card">
          <div className="card-heading">
            <h2>
              <Feather size={19} /> 我的回答
            </h2>
            <span className="save-state">
              <Check size={13} />
              {local
                ? {
                    idle: "慢慢写，不着急",
                    pending: "尚未保存",
                    saving: "正在保存…",
                    saved: "已保存在本机",
                    error: "保存失败，请重试",
                    conflict: "存在版本冲突",
                  }[status]
                : entry
                  ? "已留在本次演示"
                  : "慢慢写，不着急"}
            </span>
          </div>
          <label className="sr-only" htmlFor="answer">
            我的回答
          </label>
          <textarea
            id="answer"
            className="answer-input"
            maxLength={12000}
            placeholder="如果现在的你有话想说，就从这里开始……"
            value={text}
            onChange={(e) => save(e.target.value, note)}
          />
          <div className="editor-footer">
            <span>{text.length.toLocaleString()} / 12,000</span>
            <span>
              <LockKeyhole size={13} />
              草稿只属于你
            </span>
          </div>
          {local && entry && (status === "conflict" || status === "error") && (
            <div className="draft-warning" role="status">
              <p>
                {status === "conflict"
                  ? "另一处修改了这份记录。当前输入已保留，请先下载未同步草稿，再决定是否读取最新版本。"
                  : "当前输入尚未保存到本机服务，连接恢复后可以重试。"}
              </p>
              <div className="button-row">
                <button
                  className="quiet-button"
                  onClick={() =>
                    downloadJson(
                      local.pendingCopy(entry.id),
                      "between-answers-unsynced-draft.json",
                    )
                  }
                >
                  下载未同步草稿
                </button>
                {status === "conflict" ? (
                  <button
                    className="quiet-button"
                    onClick={() =>
                      confirm({
                        title: "读取最新版本？",
                        description:
                          "这会替换当前未同步的输入。请先下载草稿副本，确认保留后再继续。",
                        label: "读取最新版本",
                        action: () => local.reloadEntry(entry.id),
                      })
                    }
                  >
                    读取最新版本
                  </button>
                ) : (
                  <button
                    className="quiet-button"
                    onClick={() => void run(() => repo.flush())}
                  >
                    重试保存
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="submit-area">
            <p>
              {submitted
                ? "共享的是提交时的版本，后续编辑只留在你的宇宙。"
                : round
                  ? "准备好后，再让这份答案走向彼此。"
                  : local
                    ? "自由选题先留给自己，也可以邀请对方一起回答。"
                    : "自由选题先记录在你的宇宙，双人邀请将在正式版接入。"}
            </p>
            {canShare ? (
              <button
                className="button"
                disabled={!text.trim()}
                onClick={submit}
              >
                正式提交 <Send size={15} />
              </button>
            ) : submitted ? (
              <a
                className="button secondary"
                href={`#/shared?round=${round?.roundId}`}
              >
                查看这轮问答 <ArrowRight size={15} />
              </a>
            ) : (
              <a className="button secondary" href="#/universe">
                回到我的宇宙 <ArrowRight size={15} />
              </a>
            )}
          </div>
        </section>
        <aside className="writing-aside">
          <section className="paper-card private-note">
            <span className="eyebrow">
              <LockKeyhole size={12} /> ONLY FOR YOU
            </span>
            <h2>留一点，只给自己</h2>
            <p>还没准备好说出口的，就写在这里。</p>
            <label className="sr-only" htmlFor="private-note">
              个人私密笔记
            </label>
            <textarea
              id="private-note"
              value={note}
              maxLength={12000}
              onChange={(e) => save(text, e.target.value)}
              placeholder="此刻的心情、一个小小的念头……"
            />
            <span className="note-privacy">这页笔记不会出现在共享答案中</span>
          </section>
          <section className="waiting-note">
            <div className="two-seeds" aria-hidden="true">
              <i />
              <i />
            </div>
            <h3>
              {round?.state === "unlocked"
                ? "两份答案，已经相遇"
                : snapshot.dissolved
                  ? "交集暂告一段落"
                  : "我们各自书写，也彼此等待"}
            </h3>
            <p>
              {round?.state === "unlocked"
                ? "去交集看看，对方眼中的世界。"
                : round?.state === "waiting"
                  ? "你的答案已经准备好。给对方一点时间，也给生活一点留白。"
                  : round?.state === "partner-ready"
                    ? "对方已经提交。你可以按自己的节奏，完成这一份回答。"
                    : "双方都提交以后，答案才会向彼此打开。"}
            </p>
          </section>
        </aside>
      </div>
      {local?.state.space?.status === "active" && !round && (
        <button
          className="button secondary"
          onClick={() =>
            confirm({
              title: "邀请对方回答这道题？",
              description: `${q.content}。${q.sensitivity === "high" ? "这道题涉及较私人内容，双方都明确同意后才能提交。" : "对方可以接受或拒绝，不会替换今日问题。"}`,
              label: "发起共同问答",
              action: async () => {
                const id = await local.free(questionId, true);
                location.hash = `/today?q=${questionId}&round=${encodeURIComponent(id)}`;
              },
            })
          }
        >
          发起共同问答
        </button>
      )}
      <footer className="page-footnote">
        <span>{dateLabel(dayKey())} · Asia/Shanghai</span>
        <span>不是每天都要回答，每一次都值得被留下。</span>
      </footer>
    </>
  );
}
