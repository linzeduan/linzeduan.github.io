import { useState } from "react";
import {
  ArrowRight,
  LockKeyhole,
  MessageCircle,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { useApp } from "../../app/context";
import { getQuestion } from "../../data/catalog";
import { dateLabel } from "../../domain/date";

export function SharedPage({ roundId }: { roundId?: string }) {
  const { snapshot, profile, repo, run, confirm } = useApp();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<string>();
  const selected =
    snapshot.roundViews.find((r) => r.roundId === roundId) ??
    snapshot.roundViews.find((r) => r.state === "unlocked") ??
    snapshot.roundViews[0]!;
  const q = getQuestion(selected.questionId);
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">WHERE OUR WORDS MEET</span>
          <h1>我们的交集</h1>
          <p>同一个问题，两种看世界的方式。</p>
        </div>
        <span className="space-tag">
          <span className="tiny-dot" />
          {snapshot.dissolved ? "空间已解散" : "两个人的空间"}
        </span>
      </header>
      <div className="round-tabs" aria-label="选择问答轮次">
        {snapshot.roundViews.map((r) => (
          <a
            className={r.roundId === selected.roundId ? "selected" : ""}
            href={`#/shared?round=${r.roundId}`}
            key={r.roundId}
          >
            {r.roundId === "today" ? "今日问题" : "一段已留下的对话"}
            <span>
              {r.state === "unlocked"
                ? "已解锁"
                : r.state === "withdrawn"
                  ? "已撤回"
                  : r.state === "dissolved"
                    ? "已关闭"
                    : "等待相遇"}
            </span>
          </a>
        ))}
      </div>
      <section className="shared-question">
        <span className="eyebrow">原题 {q.originalNumber} · 共同问答</span>
        <h2>{q.content}？</h2>
      </section>
      {selected.state === "unlocked" ? (
        <>
          <div className="answers-pair">
            <article className="paper-card shared-answer">
              <div className="card-heading">
                <h3>
                  <span className="avatar">{profile.toUpperCase()}</span>{" "}
                  我的答案
                </h3>
                <span>{dateLabel(selected.own!.submittedAt)}</span>
              </div>
              <p>{selected.own!.text}</p>
            </article>
            <article className="paper-card shared-answer partner-answer">
              <div className="card-heading">
                <h3>
                  <span className="avatar partner">
                    {profile === "a" ? "B" : "A"}
                  </span>{" "}
                  对方的答案
                </h3>
                <span>{dateLabel(selected.partner!.submittedAt)}</span>
              </div>
              <p>{selected.partner!.text}</p>
            </article>
          </div>
          <section className="paper-card conversation">
            <div className="card-heading">
              <h2>
                <MessageCircle size={18} /> 让对话再走远一点
              </h2>
              <span>{selected.comments.length} 条留言</span>
            </div>
            {selected.comments.map((c) => (
              <div className="comment" key={c.id}>
                <span
                  className={`avatar ${c.owner === profile ? "" : "partner"}`}
                >
                  {c.owner.toUpperCase()}
                </span>
                <div>
                  <div className="comment-meta">
                    <strong>{c.owner === profile ? "我" : "对方"}</strong>
                    <span>
                      {dateLabel(c.createdAt)}
                      {c.replyTo ? " · 追问" : ""}
                    </span>
                  </div>
                  <p>{c.text}</p>
                  <button
                    className="quiet-button"
                    onClick={() => setReplyTo(c.id)}
                  >
                    追问
                  </button>
                </div>
                {c.owner === profile && (
                  <button
                    className="icon-button muted"
                    aria-label="删除我的留言"
                    onClick={() =>
                      confirm({
                        title: "删除这条留言？",
                        description: "只删除你写下的这一条，不影响对方的内容。",
                        label: "删除留言",
                        danger: true,
                        action: () =>
                          repo.removeComment(profile, selected.roundId, c.id),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {replyTo && (
              <div className="reply-banner">
                正在追问这条留言
                <button
                  className="quiet-button"
                  onClick={() => setReplyTo(undefined)}
                >
                  取消
                </button>
              </div>
            )}
            <form
              className="comment-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  run(
                    () =>
                      repo.comment(profile, selected.roundId, message, replyTo),
                    "留言已留在这段对话里。",
                  )
                ) {
                  setMessage("");
                  setReplyTo(undefined);
                }
              }}
            >
              <label htmlFor="comment" className="sr-only">
                写一条留言
              </label>
              <textarea
                id="comment"
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="读完这份答案，你想说些什么？"
              />
              <button
                className="button"
                disabled={!message.trim()}
                type="submit"
              >
                留下这句话 <Send size={14} />
              </button>
            </form>
          </section>
        </>
      ) : (
        <section className="paper-card locked-card">
          <LockKeyhole size={32} strokeWidth={1.2} />
          <h2>
            {selected.state === "withdrawn"
              ? "这轮共享已经撤回"
              : selected.state === "dissolved"
                ? "共同空间已经关闭"
                : "答案还在各自的信封里"}
          </h2>
          <p>
            {selected.state === "waiting"
              ? "你已经提交，给对方一点自由书写的时间。"
              : selected.state === "partner-ready"
                ? "对方已经提交。等你也准备好，两份答案才会同时打开。"
                : selected.state === "draft"
                  ? "双方都正式提交以后，才能看见彼此的答案。"
                  : "自己的记录仍在我的宇宙，对方的内容不再可读。"}
          </p>
          {selected.own && (
            <div className="own-locked-answer">
              <span className="eyebrow">你提交时的版本</span>
              <p>{selected.own.text}</p>
            </div>
          )}
          {!snapshot.dissolved && selected.state !== "withdrawn" && (
            <a href={`#/today?q=${q.questionId}`} className="text-link">
              回到我的回答 <ArrowRight size={15} />
            </a>
          )}
        </section>
      )}
      {selected.own && !selected.own.withdrawn && !snapshot.dissolved && (
        <button
          className="quiet-button withdraw-button"
          onClick={() =>
            confirm({
              title: "撤回这轮共享？",
              description:
                "撤回后，双方都无法再从应用读取对方的答案或继续留言。你的私人记录保留。已读、截图或导出的副本无法追回。",
              label: "撤回共享",
              danger: true,
              action: () => repo.withdraw(profile, selected.roundId),
            })
          }
        >
          <Undo2 size={15} />
          撤回我的共享
        </button>
      )}
      <p className="center-note">理解不需要相同的答案，只需要愿意听见。</p>
    </>
  );
}
