import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  Compass,
  Layers2,
  Settings2,
  Sparkles,
  ArrowUpRight,
  X,
} from "lucide-react";
import { AppContext } from "./context";
import type { ConfirmAction } from "./context";
import type { Profile } from "../domain/types";
import { demoJournal } from "../data/mock/journal";
import { Brand } from "../components/Brand";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TodayPage } from "../features/daily/TodayPage";
import { UniversePage } from "../features/journal/UniversePage";
import { SharedPage } from "../features/shared/SharedPage";
import { ArchivePage } from "../features/archive/ArchivePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import type { Theme } from "../features/settings/SettingsPage";
import { DiagnosticsPage } from "../features/settings/DiagnosticsPage";
import { questionMap } from "../data/catalog";

const navigation = [
  { id: "today", label: "今日问题", Icon: CalendarDays },
  { id: "universe", label: "我的宇宙", Icon: Compass },
  { id: "shared", label: "我们的交集", Icon: Layers2 },
] as const;
function getRoute() {
  const hash = location.hash.slice(1) || "/today";
  const [path, query] = hash.split("?");
  return {
    page: path?.replace(/^\//, "") || "today",
    params: new URLSearchParams(query),
  };
}
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("between-answers-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}
export function App() {
  const [route, setRoute] = useState(getRoute);
  const [profile, setProfile] = useState<Profile>("a");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<ConfirmAction | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [update, setUpdate] = useState(false);
  useSyncExternalStore(demoJournal.subscribe, demoJournal.getVersion);
  const snapshot = demoJournal.snapshot(profile);
  useEffect(() => {
    const change = () => {
      setRoute(getRoute());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (system.matches ? "dark" : "light") : theme;
    };
    apply();
    system.addEventListener("change", apply);
    try {
      localStorage.setItem("between-answers-theme", theme);
    } catch {
      /* theme remains usable in this tab */
    }
    return () => system.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const yes = () => setOnline(true),
      no = () => setOnline(false);
    window.addEventListener("online", yes);
    window.addEventListener("offline", no);
    return () => {
      window.removeEventListener("online", yes);
      window.removeEventListener("offline", no);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let mounted = true;
    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (
              mounted &&
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setUpdate(true);
          });
        });
      })
      .catch(() => {
        if (mounted) setToast("安装功能暂不可用，仍可在浏览器使用。");
      });
    return () => {
      mounted = false;
    };
  }, []);
  const run = (action: () => void, message?: string) => {
    try {
      action();
      if (message) setToast(message);
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "操作未完成，请重试。");
      return false;
    }
  };
  const questionId = route.params.get("q") ?? "q057";
  const content =
    route.page === "today" && questionMap.has(questionId) ? (
      <TodayPage key={`${profile}-${questionId}`} questionId={questionId} />
    ) : route.page === "universe" ? (
      <UniversePage />
    ) : route.page === "shared" ? (
      <SharedPage
        key={`${profile}-${route.params.get("round")}`}
        roundId={route.params.get("round") ?? undefined}
      />
    ) : route.page === "archive" ? (
      <ArchivePage />
    ) : route.page === "settings" ? (
      <SettingsPage theme={theme} setTheme={setTheme} />
    ) : route.page === "diagnostics" ? (
      <DiagnosticsPage />
    ) : (
      <div className="empty-state">
        <h1>这页还没有写下</h1>
        <a className="text-link" href="#/today">
          回到今日问题
        </a>
      </div>
    );
  return (
    <AppContext
      value={{
        profile,
        setProfile,
        snapshot,
        repo: demoJournal,
        notify: setToast,
        run,
        confirm: setDialog,
      }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <a href="#/today" aria-label="答案之间首页">
            <Brand />
          </a>
          <div className="sidebar-rule" />
          <span className="nav-caption">属于我们的日常</span>
          <nav aria-label="主要导航">
            {navigation.map(({ id, label, Icon }) => (
              <a
                href={`#/${id}`}
                className={route.page === id ? "active" : ""}
                aria-current={route.page === id ? "page" : undefined}
                key={id}
              >
                <Icon size={19} strokeWidth={1.6} />
                {label}
                {route.page === id && <span className="nav-dot" />}
              </a>
            ))}
          </nav>
          <a
            className={`archive-nav ${route.page === "archive" ? "active" : ""}`}
            href="#/archive"
          >
            <BookOpen size={18} strokeWidth={1.6} /> 历史与题库{" "}
            <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-bottom">
            <div className="sidebar-quote">
              <span className="quote-asterisk">✳</span>
              <p>
                我们各自回答人生
                <br />
                也在答案之间
                <br />
                慢慢认识彼此
              </p>
            </div>
            <a href="#/settings" className="profile-link">
              <span className="avatar">{profile.toUpperCase()}</span>
              <div>
                <strong>演示体验者 {profile.toUpperCase()}</strong>
                <span>每一份表达，都有自己的节奏</span>
              </div>
              <Settings2 size={17} />
            </a>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <span className="topbar-path">
              我们的手记 <span>/</span>{" "}
              {route.page === "today"
                ? "今日问题"
                : route.page === "universe"
                  ? "我的宇宙"
                  : route.page === "shared"
                    ? "我们的交集"
                    : route.page === "archive"
                      ? "历史档案"
                      : "个人设置"}
            </span>
            <a className="mobile-brand" href="#/today">
              <Brand small />
            </a>
            <div className="topbar-actions">
              <span className="quiet-status">
                <span className="tiny-dot" />
                不赶路，慢慢来
              </span>
              <a
                className="icon-button"
                aria-label="个人设置"
                href="#/settings"
              >
                <Settings2 size={18} />
              </a>
            </div>
          </header>
          <div className="demo-banner">
            <Sparkles size={14} />
            <span>
              演示预览 · 使用合成内容，刷新会还原。请勿输入真实私密信息。
            </span>
            <a href="#/settings">
              切换视角 <ArrowUpRight size={13} />
            </a>
          </div>
          {!online && (
            <div className="network-banner" role="status">
              网络已断开。当前为演示，输入仅留在当前页面会话中。
            </div>
          )}
          {update && (
            <div className="network-banner" role="status">
              有新版本可用。
              <button
                className="quiet-button"
                onClick={() =>
                  setDialog({
                    title: "刷新到新版本？",
                    description:
                      "本次演示的编辑将还原。需要保留的内容可以先去设置导出。",
                    label: "刷新页面",
                    action: () => location.reload(),
                  })
                }
              >
                查看更新
              </button>
            </div>
          )}
          <main id="main-content" className="page-content">
            {content}
          </main>
          <footer className="site-footer">
            <span>BETWEEN ANSWERS</span>
            <span>留白，也是答案的一部分。</span>
            <a href="#/settings" aria-label="关于演示与隐私">
              <CircleHelp size={14} />
            </a>
          </footer>
        </div>
        <nav className="mobile-nav" aria-label="手机主要导航">
          {navigation.map(({ id, label, Icon }) => (
            <a
              href={`#/${id}`}
              className={route.page === id ? "active" : ""}
              key={id}
            >
              <Icon size={21} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setToast("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <ConfirmDialog
          value={dialog}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            if (dialog && run(dialog.action, "操作已完成。")) setDialog(null);
          }}
        />
      </div>
    </AppContext>
  );
}
