import {
  Download,
  Moon,
  Sun,
  Monitor,
  ArrowUpRight,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../../app/context";

export type Theme = "light" | "dark" | "system";
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SettingsPage({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const { profile, setProfile, snapshot, repo, confirm, notify } = useApp();
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">YOUR SPACE, YOUR CHOICES</span>
          <h1>个人设置</h1>
          <p>照顾好这片小小的空间，也照顾好自己的边界。</p>
        </div>
      </header>
      <section className="paper-card settings-section">
        <div className="section-heading">
          <h2>阅读的光线</h2>
          <p>选择你觉得舒服的样子。</p>
        </div>
        <div className="theme-choices">
          {(
            [
              { value: "light", label: "浅色", Icon: Sun },
              { value: "dark", label: "深色", Icon: Moon },
              { value: "system", label: "跟随系统", Icon: Monitor },
            ] as const
          ).map(({ value, label, Icon }) => (
            <button
              className={theme === value ? "selected" : ""}
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="paper-card settings-section">
        <div className="section-heading">
          <h2>演示身份</h2>
          <p>
            切换两个人的视角，体验独立回答和相互解锁。所有内容仅在本次打开中模拟。
          </p>
        </div>
        <div className="profile-choices">
          {(["a", "b"] as const).map((p) => (
            <button
              className={profile === p ? "selected" : ""}
              onClick={() => setProfile(p)}
              key={p}
              aria-pressed={profile === p}
            >
              <span className={`avatar ${p === "b" ? "partner" : ""}`}>
                {p.toUpperCase()}
              </span>
              体验 {p === "a" ? "A" : "B"} 的视角
            </button>
          ))}
        </div>
        <p className="settings-hint">
          演示内容不是安全存储。请勿输入真实私密信息，刷新页面会还原示例。
        </p>
      </section>
      <section className="paper-card settings-section">
        <div className="section-heading">
          <h2>把记录握在自己手里</h2>
          <p>每个人都拥有自己的答案，即使以后不再一起答题。</p>
        </div>
        <button
          className="settings-row"
          onClick={() => {
            downloadJson(
              repo.exportOwn(profile),
              `between-answers-demo-${profile}.json`,
            );
            notify("已导出当前身份的演示记录。");
          }}
        >
          <span>
            <Download size={20} />
            <span>
              <strong>导出我的数据</strong>
              <small>JSON 格式，仅包含本人内容与相关题目</small>
            </span>
          </span>
          <ArrowUpRight size={18} />
        </button>
        <button
          className="settings-row"
          onClick={() =>
            confirm({
              title: "解散这个演示空间？",
              description:
                "对方的答案将不再可读，双方自己的记录都会保留。此操作不能恢复；可以通过“还原演示”重新体验。",
              label: "确认解散",
              danger: true,
              action: () => repo.dissolve(),
            })
          }
          disabled={snapshot.dissolved}
        >
          <span>
            <ShieldCheck size={20} />
            <span>
              <strong>
                {snapshot.dissolved ? "空间已解散" : "解散双人空间"}
              </strong>
              <small>停止共享，保留各自的记录</small>
            </span>
          </span>
          <ArrowUpRight size={18} />
        </button>
      </section>
      <section className="paper-card settings-section">
        <div className="section-heading">
          <h2>连接与体验</h2>
        </div>
        <a href="#/diagnostics" className="settings-row">
          <span>
            <Monitor size={20} />
            <span>
              <strong>检查网络连接</strong>
              <small>验证未来的云同步服务能否直连</small>
            </span>
          </span>
          <ArrowUpRight size={18} />
        </a>
        <button
          className="settings-row"
          onClick={() =>
            confirm({
              title: "还原全部演示内容？",
              description:
                "将丢弃本次演示中的编辑，恢复合成示例；这不会操作任何云端私人数据。",
              label: "还原演示",
              action: () => repo.reset(),
            })
          }
        >
          <span>
            <RotateCcw size={20} />
            <span>
              <strong>还原演示</strong>
              <small>清空本次体验中的更改</small>
            </span>
          </span>
          <ArrowUpRight size={18} />
        </button>
      </section>
      <p className="center-note">
        答案之间 · 0.1.0 演示预览
        <br />
        慢慢认识彼此，也慢慢认识自己。
      </p>
    </>
  );
}
