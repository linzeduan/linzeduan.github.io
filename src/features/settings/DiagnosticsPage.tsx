import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import { validateApiUrl } from "../../data/http/probe";
import { runNetworkProbe } from "../../data/http/run-probe";
import { networkOutcomeLabels } from "../../domain/network-report";
import type {
  NetworkReport,
  NetworkResult,
  NetworkRunContext,
} from "../../domain/network-report";
import type { Profile } from "../../domain/types";
import { downloadJson } from "./SettingsPage";

export function DiagnosticsPage() {
  const [base, setBase] = useState(import.meta.env.VITE_API_BASE_URL ?? "");
  const [token, setToken] = useState("");
  const [network, setNetwork] = useState<NetworkRunContext["network"]>("Wi-Fi");
  const [tester, setTester] = useState<Profile>("a");
  const [direct, setDirect] = useState(false);
  const [results, setResults] = useState<NetworkResult[]>([]);
  const [report, setReport] = useState<NetworkReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  const start = async () => {
    if (active.current) return;
    setError("");
    try {
      validateApiUrl(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "地址无效");
      return;
    }
    if (!/^\S{32,256}$/.test(token.trim())) {
      setError(
        "请输入完整的临时探针密钥（32–256 个非空白字符），不是你的账号密码。",
      );
      return;
    }
    setResults([]);
    setReport(undefined);
    setBusy(true);
    const controller = new AbortController();
    active.current = controller;
    try {
      const browser = /Edg\//.test(navigator.userAgent)
        ? "Edge"
        : /Firefox\//.test(navigator.userAgent)
          ? "Firefox"
          : /Chrome\//.test(navigator.userAgent)
            ? "Chrome"
            : /Safari\//.test(navigator.userAgent)
              ? "Safari"
              : "other";
      const completed = await runNetworkProbe(
        {
          serviceOrigin: base,
          token: token.trim(),
          tester,
          network,
          directConnection: direct,
          browser,
          standalone: matchMedia("(display-mode: standalone)").matches,
        },
        controller.signal,
        (result) => {
          if (active.current === controller)
            setResults((items) => [...items, result]);
        },
      );
      if (active.current === controller) setReport(completed);
    } catch {
      if (active.current === controller) setError("检查未能完成，请重试。");
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        setToken("");
      }
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
          onChange={(e) =>
            setNetwork(e.target.value as NetworkRunContext["network"])
          }
          disabled={busy}
        >
          <option>Wi-Fi</option>
          <option>移动网络</option>
        </select>
        <label htmlFor="tester">测试者</label>
        <select
          id="tester"
          value={tester}
          onChange={(e) => setTester(e.target.value as Profile)}
          disabled={busy}
        >
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <label className="direct-check" htmlFor="direct-connection">
          <input
            type="checkbox"
            id="direct-connection"
            checked={direct}
            onChange={(e) => setDirect(e.target.checked)}
            disabled={busy}
          />
          <span>本次测试已关闭 VPN / 代理，使用普通网络直连</span>
        </label>
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
                active.current?.abort();
              }}
            >
              停止检查
            </button>
          )}
          {report && !busy && (
            <button
              className="button secondary"
              onClick={() =>
                downloadJson(report, "between-answers-network-check.json")
              }
            >
              下载结果
            </button>
          )}
        </div>
        <p className="settings-hint">
          每轮：连通性、授权数据库读写、无效密钥拒绝。超时为 10
          秒；停止检查或离开页面会终止当前请求。报告固定本次的网络和测试者，不含密钥；浏览器只记录名称，不记录
          IP 或完整设备标识。请分别测试双方手机的 Wi-Fi
          和移动网络；通过探针不等于生产登录和权限已验收。
        </p>
      </section>
      {(results.length > 0 || report) && (
        <section className="paper-card diagnostic-card">
          <h2>
            {busy
              ? "检查进行中"
              : report
                ? networkOutcomeLabels[report.assessment.outcome]
                : "检查结果"}{" "}
            <span className="muted">
              {passed} / {results.length}
            </span>
          </h2>
          {report && (
            <p className="settings-hint" role="status">
              本次记录：{report.context.tester.toUpperCase()} ·{" "}
              {report.context.network} · {report.context.browser} ·{" "}
              {report.context.directConnection
                ? "本人已确认直连"
                : "未确认直连"}
              。
              {report.assessment.coreLatencyP95Ms !== null &&
                `核心请求 95% 耗时不超过 ${report.assessment.coreLatencyP95Ms} ms。`}
            </p>
          )}
          <ol className="probe-results">
            {results.map((r, i) => (
              <li key={i}>
                {r.ok ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <CircleAlert size={16} className="error-text" />
                )}
                <span>
                  {r.round}. {r.operation}
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
