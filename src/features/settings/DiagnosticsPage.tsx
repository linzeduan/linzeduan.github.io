import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import { probeRequest, validateApiUrl } from "../../data/http/probe";
import type { ProbeResult } from "../../data/http/probe";
import { downloadJson } from "./SettingsPage";

export function DiagnosticsPage() {
  const [base, setBase] = useState(import.meta.env.VITE_API_BASE_URL ?? "");
  const [token, setToken] = useState("");
  const [network, setNetwork] = useState("Wi-Fi");
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancel = useRef(false);
  const start = async () => {
    setError("");
    try {
      validateApiUrl(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "地址无效");
      return;
    }
    if (!token.trim()) {
      setError("请输入临时探针密钥，不是你的账号密码。");
      return;
    }
    setResults([]);
    setBusy(true);
    cancel.current = false;
    try {
      for (let i = 0; i < 10 && !cancel.current; i++) {
        for (const [path, key] of [
          ["/health", undefined],
          ["/probe", token],
          ["/probe/reject", "invalid-probe-token"],
        ] as const) {
          if (cancel.current) break;
          const result = await probeRequest(base, path, key);
          setResults((items) => [...items, result]);
        }
      }
    } finally {
      setBusy(false);
      setToken("");
    }
  };
  const passed = results.filter((r) => r.ok).length;
  return (
    <>
      <a href="#/settings" className="text-link back-link">
        <ArrowLeft size={15} />
        返回设置
      </a>
      <header className="page-heading">
        <div>
          <span className="eyebrow">BEFORE WE TRUST THE CONNECTION</span>
          <h1>网络连接检查</h1>
          <p>在你日常使用的网络里，确认这条路是否通畅。</p>
        </div>
      </header>
      <section className="paper-card diagnostic-card">
        <p className="gentle-banner">
          只发送固定测试标记。不会读取、上传你的答案，也不会保存密钥。
        </p>
        <label htmlFor="api-base">测试服务地址</label>
        <input
          id="api-base"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          disabled={busy}
          placeholder="https://你的服务.账号.workers.dev"
          inputMode="url"
        />
        <label htmlFor="probe-token">临时探针密钥</label>
        <input
          id="probe-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          placeholder="部署探针时设置的随机密钥"
          type="password"
          autoComplete="off"
        />
        <label htmlFor="network">当前网络</label>
        <select
          id="network"
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          disabled={busy}
        >
          <option>Wi-Fi</option>
          <option>移动网络</option>
        </select>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            className="button"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? (
              <>
                <LoaderCircle size={16} className="spin" />
                正在验证 {results.length} / 30
              </>
            ) : (
              "开始 10 轮验证"
            )}
          </button>
          {busy && (
            <button
              className="button secondary"
              onClick={() => {
                cancel.current = true;
              }}
            >
              停止后续请求
            </button>
          )}
          {results.length > 0 && !busy && (
            <button
              className="button secondary"
              onClick={() =>
                downloadJson(
                  {
                    schemaVersion: 1,
                    network,
                    completedAt: new Date().toISOString(),
                    results,
                  },
                  "between-answers-network-check.json",
                )
              }
            >
              下载结果
            </button>
          )}
        </div>
        <p className="settings-hint">
          每轮：连通性、授权数据库读写、无效密钥拒绝。超时为 10
          秒。完成后清除输入的密钥。请分别测试双方手机的 Wi-Fi
          和移动网络；通过探针不等于生产登录和权限已验收。
        </p>
      </section>
      {results.length > 0 && (
        <section className="paper-card diagnostic-card">
          <h2>
            {busy
              ? "检查进行中"
              : passed === 30
                ? "这次连接检查通过"
                : "检查结果"}{" "}
            <span className="muted">
              {passed} / {results.length}
            </span>
          </h2>
          <ol className="probe-results">
            {results.map((r, i) => (
              <li key={i}>
                {r.ok ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <CircleAlert size={16} className="error-text" />
                )}
                <span>
                  {Math.floor(i / 3) + 1}. {r.operation}
                  {r.error && <small>{r.error}</small>}
                </span>
                <span>
                  {r.status || "网络错误"} · {r.elapsedMs} ms
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
