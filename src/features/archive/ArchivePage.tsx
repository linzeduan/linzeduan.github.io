import { useState } from "react";
import { ArrowUpRight, Search, ShieldCheck } from "lucide-react";
import { questions } from "../../data/catalog";
import { categoryNames } from "../../domain/types";
import { useApp } from "../../app/context";
import { ConnectedJournal } from "../../data/http/connected-journal";

export function ArchivePage() {
  const { snapshot, repo, run } = useApp();
  const local = repo instanceof ConnectedJournal ? repo : undefined;
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const size = 24;
  const filtered = questions.filter(
    (q) =>
      (!category || q.category === category) &&
      (!search || `${q.content}${q.originalNumber}`.includes(search)),
  );
  const shown = filtered.slice(0, page * size);
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">FOUR HUNDRED WAYS TO BEGIN</span>
          <h1>历史与题库</h1>
          <p>不用按顺序，也不用着急。跟着此刻的好奇走。</p>
        </div>
        <span className="number-stamp">
          400<span>个话题</span>
        </span>
      </header>
      <div className="gentle-banner">
        <ShieldCheck size={18} />
        <span>全部保留原题与编号。涉及私人内容的题目可以随时跳过。</span>
      </div>
      {local?.state.space?.status === "active" && (
        <form
          className="paper-card backfill-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const id = await local.daily(date);
              const round = local.state.roundViews.find(
                (r) => r.roundId === id,
              );
              location.hash = `/today?q=${round!.questionId}&round=${encodeURIComponent(id)}`;
            });
          }}
        >
          <label htmlFor="backfill-date">想补答哪一天？</label>
          <input
            id="backfill-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            min={local.state.space.startDay ?? undefined}
            max={local.state.serverDay}
          />
          <button className="button secondary" type="submit">
            打开那天的问题
          </button>
        </form>
      )}
      <div className="filter-row">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索题库"
            placeholder="搜索题目或原始编号"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="筛选题库主题"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">所有主题</option>
          {Object.entries(categoryNames).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="section-caption">
        <span>随时可以开始的一页</span>
        <span>{filtered.length} 道题</span>
      </div>
      <div className="question-grid">
        {shown.map((q) => (
          <a
            className="paper-card question-tile"
            href={`#/today?q=${q.questionId}`}
            key={q.questionId}
          >
            <div>
              <span className="tile-number">
                {String(q.originalNumber).padStart(3, "0")}
              </span>
              <span>{categoryNames[q.category]}</span>
            </div>
            <h2>{q.content}？</h2>
            <footer>
              <span>
                {snapshot.entries.some((e) => e.questionId === q.questionId)
                  ? "留下过回答"
                  : q.sensitivity === "high"
                    ? "涉及较私人的内容"
                    : "按自己的节奏"}
              </span>
              <ArrowUpRight size={17} />
            </footer>
          </a>
        ))}
      </div>
      {shown.length < filtered.length && (
        <button
          className="button secondary load-more"
          onClick={() => setPage((v) => v + 1)}
        >
          再翻一页
        </button>
      )}
      {!shown.length && (
        <p className="empty-state">暂时没有找到，试试别的词。</p>
      )}
    </>
  );
}
