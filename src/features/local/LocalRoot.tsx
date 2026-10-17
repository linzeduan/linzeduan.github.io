import { useEffect, useState, useRef } from "react";
import { App } from "../../app/App";
import { Brand } from "../../components/Brand";
import { ConnectedJournal } from "../../data/http/connected-journal";
import { localRequest } from "../../data/http/local-api";
import type { LocalUser } from "../../domain/local";
import type { Profile } from "../../domain/types";

function CredentialsForm({
  setup = false,
  profile: lockedProfile,
  onDone,
}: {
  setup?: boolean;
  profile?: Profile;
  onDone: () => void;
}) {
  const [profile, setProfile] = useState<Profile>(lockedProfile ?? "a");
  const [password, setPassword] = useState("");
  const [passwordB, setPasswordB] = useState("");
  const [nameA, setNameA] = useState("A");
  const [nameB, setNameB] = useState("B");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="paper-card local-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          if (setup)
            await localRequest("/setup", "POST", {
              a: { name: nameA, password },
              b: { name: nameB, password: passwordB },
            });
          else
            await localRequest("/login", "POST", {
              profile: lockedProfile ?? profile,
              password,
            });
          setPassword("");
          setPasswordB("");
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : "操作未完成。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Brand />
      <h1>
        {setup
          ? "先为两个人，留一个位置"
          : lockedProfile
            ? "重新确认你的身份"
            : "欢迎回到自己的宇宙"}
      </h1>
      <p>
        {setup
          ? "本地数据保存在这台电脑。分别设置两个账号，密码至少 12 个字符。"
          : "使用各自账号登录，私人草稿与笔记仅本人可读。"}
      </p>
      {setup ? (
        <>
          <label htmlFor="name-a">A 的称呼</label>
          <input
            id="name-a"
            maxLength={40}
            required
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
          />
          <label htmlFor="password-a">A 的密码</label>
          <input
            id="password-a"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="name-b">B 的称呼</label>
          <input
            id="name-b"
            maxLength={40}
            required
            value={nameB}
            onChange={(e) => setNameB(e.target.value)}
          />
          <label htmlFor="password-b">B 的密码</label>
          <input
            id="password-b"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={passwordB}
            onChange={(e) => setPasswordB(e.target.value)}
          />
        </>
      ) : (
        <>
          <label htmlFor="local-profile">我的账号</label>
          <select
            id="local-profile"
            value={lockedProfile ?? profile}
            onChange={(e) => setProfile(e.target.value as Profile)}
            disabled={Boolean(lockedProfile)}
          >
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
          <label htmlFor="local-password">密码</label>
          <input
            id="local-password"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy} type="submit">
        {busy ? "正在确认…" : setup ? "创建本地账号" : "登录"}
      </button>
      {lockedProfile && (
        <p className="settings-hint">
          未同步草稿仍留在本次页面会话中，登录后可以继续保存。
        </p>
      )}
    </form>
  );
}
function ConnectedApp({
  user,
  onSignedOut,
}: {
  user: LocalUser;
  onSignedOut: () => void;
}) {
  const [reauth, setReauth] = useState(false);
  const [repo] = useState(
    () => new ConnectedJournal(user, () => setReauth(true), onSignedOut),
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void repo
      .refresh()
      .then(() => {
        if (live) setReady(true);
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "未能连接本地服务。");
      });
    return () => {
      live = false;
    };
  }, [repo]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (reauth) dialog.current?.showModal();
    else dialog.current?.close();
  }, [reauth]);
  return (
    <>
      {ready ? (
        <App controller={repo} />
      ) : (
        <main className="local-entry">
          <p role="status">{error || "正在打开你的记录…"}</p>
          {error && (
            <button
              className="button"
              onClick={() =>
                void repo
                  .refresh()
                  .then(() => {
                    setError("");
                    setReady(true);
                  })
                  .catch((e) => setError(e.message))
              }
            >
              重新连接
            </button>
          )}
        </main>
      )}
      <dialog
        ref={dialog}
        className="reauth-dialog"
        aria-label="重新登录"
        onCancel={(e) => e.preventDefault()}
      >
        {reauth && (
          <CredentialsForm
            profile={user.id}
            onDone={() => {
              setReauth(false);
              void repo
                .flush()
                .then(() => repo.refresh())
                .then(() => setReady(true))
                .catch((e) => setError(e.message));
            }}
          />
        )}
      </dialog>
    </>
  );
}
export function LocalRoot() {
  const [session, setSession] = useState<{
    initialized: boolean;
    user?: LocalUser;
  }>();
  const [error, setError] = useState("");
  const reload = () =>
    void localRequest<{ initialized: boolean; user?: LocalUser }>("/session")
      .then((value) => {
        setSession(value);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(reload, []);
  if (!session)
    return (
      <main className="local-entry">
        <p role="status">{error || "正在连接本地服务…"}</p>
        {error && (
          <button className="button" onClick={reload}>
            重新连接
          </button>
        )}
      </main>
    );
  if (session.user)
    return (
      <ConnectedApp
        key={session.user.id}
        user={session.user}
        onSignedOut={() => setSession({ initialized: true })}
      />
    );
  return (
    <main className="local-entry">
      <CredentialsForm setup={!session.initialized} onDone={reload} />
      <p className="center-note">本地版本 · 仅连接这台电脑上的服务</p>
    </main>
  );
}
