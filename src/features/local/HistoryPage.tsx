import { useEffect, useState } from "react";
import { useApp } from "../../app/context";
import { ConnectedJournal } from "../../data/http/connected-journal";
import type { EntryRevision } from "../../domain/local";
import { getQuestion } from "../../data/catalog";
export function HistoryPage({ entryId }: { entryId: string }) {
  const { repo, snapshot } = useApp();
  const [versions, setVersions] = useState<EntryRevision[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const entry = snapshot.entries.find((e) => e.id === entryId);
  useEffect(() => {
    let active = true;
    setVersions(undefined);
    setError("");
    if (repo instanceof ConnectedJournal)
      void repo
        .revisions(entryId)
        .then((items) => {
          if (active) setVersions(items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [repo, entryId, retry]);
  return (
    <>
      <a className="text-link" href="#/universe">
        返回我的宇宙
      </a>
      <header className="page-heading">
        <div>
          <span className="eyebrow">THE WORDS WE ONCE LEFT</span>
          <h1>回答的版本</h1>
          <p>
            {entry
              ? getQuestion(entry.questionId).content
              : "只展示属于你的历史记录。"}
          </p>
        </div>
      </header>
      {error ? (
        <div>
          <p role="alert" className="error-text">
            {error}
          </p>
          <button
            className="button secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            重试读取历史
          </button>
        </div>
      ) : !versions ? (
        <p role="status">正在读取版本…</p>
      ) : (
        <div className="entry-list">
          {versions.map((version) => (
            <article className="paper-card entry-card" key={version.revision}>
              <div className="entry-meta">
                <span>第 {version.revision} 版</span>
                <span>
                  {new Date(version.savedAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </span>
              </div>
              <p className="entry-text">
                {version.text || "这一版没有填写答案。"}
              </p>
              {version.note && (
                <p className="entry-note">私人笔记：{version.note}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
