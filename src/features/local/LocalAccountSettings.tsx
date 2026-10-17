import { useState } from "react";
import { useApp } from "../../app/context";
import { ConnectedJournal } from "../../data/http/connected-journal";
import { localRequest } from "../../data/http/local-api";
export function LocalAccountSettings() {
  const { repo, run, confirm } = useApp();
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  if (!(repo instanceof ConnectedJournal)) return null;
  return (
    <section className="paper-card settings-section local-form">
      <div className="section-heading">
        <h2>我的本地账号</h2>
        <p>
          {repo.user.name} · {repo.user.id.toUpperCase()}
          。退出前会先保存草稿；所有数据保留在本机服务中。
        </p>
      </div>
      <div className="button-row">
        <a className="button secondary" href="#/pairing">
          管理双人空间
        </a>
        <button
          className="button secondary"
          onClick={() => void run(() => repo.logout())}
        >
          退出登录
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm({
            title: "修改登录密码？",
            description: "修改后，所有设备上的旧会话都会退出，需要重新登录。",
            label: "修改密码",
            action: async () => {
              await repo.flush();
              await localRequest("/password", "POST", {
                currentPassword: password,
                newPassword: next,
              });
              setPassword("");
              setNext("");
              repo.dispose();
              repo.onSignedOut();
            },
          });
        }}
      >
        <label htmlFor="current-password">当前密码</label>
        <input
          id="current-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <label htmlFor="new-password">新密码（至少 12 个字符）</label>
        <input
          id="new-password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
        />
        <div className="button-row">
          <button
            className="button secondary"
            type="submit"
            disabled={!password || next.length < 12}
          >
            修改密码
          </button>
        </div>
      </form>
      <p className="settings-hint">
        注销会删除本人的答案、笔记、版本和留言，并关闭共同空间；对方自己的记录保留。请先导出需要保留的内容。
      </p>
      <button
        className="quiet-button error-text"
        disabled={!password}
        onClick={() =>
          confirm({
            title: "永久删除我的本地账号？",
            description:
              "需要上方填写的当前密码。此操作无法恢复，仅删除本人数据，且会解散当前双人空间。",
            label: "永久删除本人账号",
            danger: true,
            action: async () => {
              await repo.flush();
              await localRequest("/account", "DELETE", {
                password,
                confirmation: "DELETE_MY_ACCOUNT",
              });
              repo.dispose();
              repo.onSignedOut();
            },
          })
        }
      >
        注销本人账号
      </button>
    </section>
  );
}
