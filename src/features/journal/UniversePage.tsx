import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  LockKeyhole,
  Search,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useApp } from "../../app/context";
import { categoryNames } from "../../domain/types";
import { getQuestion } from "../../data/catalog";
import { dateLabel, dayKey } from "../../domain/date";
import { EmptyState } from "../../components/EmptyState";

export function UniversePage() {
  const { snapshot, profile, repo, confirm } = useApp();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const entries = snapshot.entries
    .filter((e) => {
      const q = getQuestion(e.questionId);
      return (
        (!category || q.category === category) &&
        (!date || dayKey(new Date(e.createdAt)) === date) &&
        (!search || `${q.content}${e.text}${e.note}`.includes(search))
      );
    })
    .toReversed();
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">A PLACE TO COME BACK TO</span>
          <h1>我的宇宙</h1>
          <p>那些认真写下的片刻，都在这里慢慢生长。</p>
        </div>
        <a className="text-link" href="#/archive">
          历史档案 <ArrowUpRight size={16} />
        </a>
      </header>
      <div className="stats-row">
        <div>
          <strong>
            {snapshot.entries
              .filter((e) => e.text.trim())
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <span>份自己的回答</span>
        </div>
        <div>
          <strong>
            {snapshot.entries
              .filter((e) => e.note.trim())
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <span>段私密心事</span>
        </div>
        <p>
          不记录连续天数
          <br />
          只珍惜每一次表达
        </p>
      </div>
      <div className="filter-row">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索我的回答"
            placeholder="找一段文字，或一个问题"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="按主题筛选"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">所有主题</option>
          {Object.entries(categoryNames).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="按日期筛选"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="section-caption">
        <span>写给自己的记录</span>
        <span>{entries.length} 条</span>
      </div>
      <div className="entry-list">
        {entries.length ? (
          entries.map((e) => {
            const q = getQuestion(e.questionId);
            return (
              <article className="paper-card entry-card" key={e.id}>
                <div className="entry-meta">
                  <span>
                    {dateLabel(e.createdAt)} · {categoryNames[q.category]}
                  </span>
                  <span>
                    {e.status === "submitted" ? "已有共享版本" : "仅自己可见"}
                  </span>
                </div>
                <h2>
                  <a
                    href={`#/today?q=${q.questionId}&entry=${encodeURIComponent(e.id)}${e.roundId ? `&round=${encodeURIComponent(e.roundId)}` : ""}`}
                  >
                    {q.content}？
                  </a>
                </h2>
                <p className="entry-text">
                  {e.text || "还没有写下答案，留一页空白也很好。"}
                </p>
                {e.note && (
                  <div className="entry-note">
                    <LockKeyhole size={14} />
                    <p>{e.note}</p>
                  </div>
                )}
                <div className="entry-actions">
                  <span>
                    第 {e.revision} 次保存 · 修改于{" "}
                    {new Intl.DateTimeFormat("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(e.updatedAt))}
                  </span>
                  <div>
                    {repo.mode === "local" && (
                      <a
                        className="quiet-button"
                        href={`#/history?entry=${encodeURIComponent(e.id)}`}
                      >
                        历史版本
                      </a>
                    )}
                    <button
                      className="quiet-button"
                      onClick={() =>
                        confirm({
                          title: "再回答一次这个问题？",
                          description:
                            "原来的记录会保留，新答案是一份独立的私人记录。",
                          label: "写一份新答案",
                          action: async () => {
                            const entry = await repo.reanswer(
                              profile,
                              q.questionId,
                              e.id,
                            );
                            location.hash = `/today?q=${q.questionId}${entry ? `&entry=${encodeURIComponent(entry.id)}` : ""}`;
                          },
                        })
                      }
                    >
                      <RotateCcw size={14} />
                      重答
                    </button>
                    <button
                      className="icon-button muted"
                      aria-label={`删除原题${q.originalNumber}的记录`}
                      onClick={() =>
                        confirm({
                          title: "删除这份记录？",
                          description:
                            "相关共享将先撤回。删除不能恢复，建议先导出自己的记录。",
                          label: "确认删除",
                          danger: true,
                          action: () => repo.deleteEntry(profile, e.id),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState title="这里暂时安静着">
            换个关键词试试，或去今日问题写下第一段话。
          </EmptyState>
        )}
      </div>
      <a className="browse-card" href="#/archive">
        <BookOpen size={22} />
        <div>
          <strong>还有很多话，可以慢慢说</strong>
          <p>去 400 道问题里，找一题此刻想回答的。</p>
        </div>
        <ArrowUpRight size={20} />
      </a>
    </>
  );
}
