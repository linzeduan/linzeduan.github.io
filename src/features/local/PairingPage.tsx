import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { useApp } from "../../app/context";
import { ConnectedJournal } from "../../data/http/connected-journal";
export function PairingPage() {
  const { repo, run } = useApp();
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  if (!(repo instanceof ConnectedJournal)) return null;
  const space = repo.state.space;
  const action = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    await run(fn);
    setBusy(false);
  };
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">TWO WORLDS, ONE SMALL BEGINNING</span>
          <h1>让两个宇宙相遇</h1>
          <p>用一个邀请码，把彼此的空间轻轻连接起来。</p>
        </div>
      </header>
      <section className="paper-card local-form">
        <KeyRound size={25} />
        <h2>
          {space?.status === "active"
            ? "我们已经在同一片交集里"
            : space
              ? "给对方留一个位置"
              : "创建或加入双人空间"}
        </h2>
        <p>
          {space?.status === "active"
            ? "双方的私人记录各自保留，只有共同提交的答案才会解锁。"
            : "每个空间最多两人。等待的时候，也可以先去我的宇宙或题库写点东西。"}
        </p>
        {space?.status === "active" ? (
          <>
            <p>{space.members.map((m) => m.name).join(" · ")}</p>
            <a className="button" href="#/today">
              去今日问题 <ArrowRight size={15} />
            </a>
          </>
        ) : space ? (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const result = await repo.invite();
                  setInvite(result.code);
                })
              }
            >
              {invite ? "换一个邀请码" : "生成一次性邀请码"}
            </button>
            {invite && (
              <>
                <label htmlFor="invite-code">邀请码 · 24 小时有效</label>
                <input
                  id="invite-code"
                  readOnly
                  value={invite}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p className="settings-hint">
                  将这段邀请码私下交给对方。刷新后可重新生成，旧码会失效。
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <button
              className="button"
              disabled={busy}
              onClick={() => void action(() => repo.createSpace())}
            >
              创建我们的空间
            </button>
            <div className="section-caption">或者，加入对方的空间</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(() => repo.join(code.trim()));
              }}
            >
              <label htmlFor="join-code">对方的邀请码</label>
              <input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={100}
                autoComplete="off"
              />
              <button
                className="button secondary"
                disabled={busy || !code.trim()}
                type="submit"
              >
                加入空间
              </button>
            </form>
          </>
        )}
      </section>
    </>
  );
}
