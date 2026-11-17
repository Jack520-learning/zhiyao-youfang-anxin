import {
  Activity,
  ClipboardCheck,
  Database,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TrendingUp,
  UserRound,
  UsersRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { herbs } from "../catalog/herbs";
import { medicines } from "../catalog/medicines";
import { safetyScenarios } from "../evaluation/safetyScenarios";
import {
  fetchAdminOverview,
  setAdminAccountDisabled,
  type AdminAccountSummary,
  type AdminOverview
} from "../lib/accountApi";
import { useAppStore } from "../store/useAppStore";

const roleLabels = {
  elder: "老人账号",
  family: "家属账号",
  admin: "后台管理员"
} as const;

export function AdminPage() {
  const navigate = useNavigate();
  const role = useAppStore((state) => state.role);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const accounts = useAppStore((state) => state.accounts);
  const currentAccount = accounts.find(
    (account) => account.id === sessionAccountId
  );
  const sessionToken = currentAccount?.sessionToken || "";
  const [overview, setOverview] = useState<AdminOverview>();
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  async function loadOverview(showLoading = true) {
    if (!sessionToken) {
      setError("当前管理员缺少有效会话，请重新登录。");
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError("");
    try {
      const result = await fetchAdminOverview(sessionToken);
      setOverview(result.overview);
      setAdminAccounts(result.accounts);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "后台数据加载失败"
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    let cancelled = false;
    let refreshTimer = 0;

    const refresh = () => {
      if (cancelled) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!cancelled) void loadOverview(false);
      }, 150);
    };

    void loadOverview();
    if (!sessionToken) return;

    const source = new EventSource(
      `/api/admin/events?token=${encodeURIComponent(sessionToken)}`
    );
    source.onmessage = refresh;
    const interval = window.setInterval(refresh, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      source.close();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [role, sessionToken]);

  if (role !== "admin") return <Navigate to="/chat" replace />;

  async function toggleAccount(account: AdminAccountSummary) {
    if (!currentAccount?.sessionToken) return;
    setUpdatingId(account.id);
    try {
      await setAdminAccountDisabled(
        currentAccount.sessionToken,
        account.id,
        !account.disabled
      );
      await loadOverview();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "账号状态更新失败"
      );
    } finally {
      setUpdatingId("");
    }
  }

  const adminMetrics: Array<{
    label: string;
    value: number;
    note: string;
    icon: typeof UsersRound;
  }> = [
    {
      label: "账号总数",
      value: overview?.totalAccounts ?? 0,
      note: "个网站账号",
      icon: UsersRound
    },
    {
      label: "老人账号",
      value: overview?.elderAccounts ?? 0,
      note: "个用药档案",
      icon: UserRound
    },
    {
      label: "家属账号",
      value: overview?.familyAccounts ?? 0,
      note: "个协同账号",
      icon: Activity
    },
    {
      label: "已同步家庭",
      value: overview?.syncedFamilies ?? 0,
      note: "个家庭摘要",
      icon: Database
    }
  ];

  return (
    <div className="page admin-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">后台管理 · 系统治理</p>
          <h1 className="page-title">网站后台管理端</h1>
          <p className="page-description">
            管理网站账号，查看运行数据、内容规模、质量评估和使用效果。
          </p>
        </div>
        <button
          className="btn"
          type="button"
          disabled={loading}
          onClick={() => void loadOverview()}
        >
          {loading ? (
            <LoaderCircle size={19} className="spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={19} aria-hidden="true" />
          )}
          刷新后台数据
        </button>
      </header>

      {error ? (
        <div className="notice warm" role="alert">
          {error}
        </div>
      ) : null}

      <section className="admin-stat-grid" aria-label="账号与家庭数据">
        {adminMetrics.map(({ label, value, note, icon: Icon }) => (
          <article className="card admin-stat" key={label}>
            <Icon size={24} aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <div className="admin-content-grid">
        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>网站内容概况</h2>
              <p>当前真实加载的药品、中药材和安全场景。</p>
            </div>
            <Database size={24} color="var(--primary)" aria-hidden="true" />
          </div>
          <div className="admin-content-list">
            <div>
              <strong>{medicines.length}</strong>
              <span>药品资料</span>
            </div>
            <div>
              <strong>{herbs.length}</strong>
              <span>中药材资料</span>
            </div>
            <div>
              <strong>{safetyScenarios.length}</strong>
              <span>安全评估场景</span>
            </div>
            <div>
              <strong>{overview?.medicationRecords ?? 0}</strong>
              <span>已同步用药记录</span>
            </div>
          </div>
          <div className="header-actions" style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => navigate("/evaluation")}
            >
              <ClipboardCheck size={19} aria-hidden="true" />
              打开质量评估
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => navigate("/impact")}
            >
              <TrendingUp size={19} aria-hidden="true" />
              打开效果评估
            </button>
          </div>
        </section>

        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>安全与运行状态</h2>
              <p>后台专用摘要，不进入家属端页面。</p>
            </div>
            <ShieldCheck size={24} color="var(--primary)" aria-hidden="true" />
          </div>
          <ul className="knowledge-list">
            <li>已停用账号：{overview?.disabledAccounts ?? 0} 个</li>
            <li>后台管理员：{overview?.adminAccounts ?? 0} 个</li>
            <li>家庭连接码：{overview?.linkedFamilies ?? 0} 个</li>
            <li>风险核查记录：{overview?.riskRecords ?? 0} 条</li>
            <li>
              最近刷新：
              {overview?.generatedAt
                ? new Date(overview.generatedAt).toLocaleString("zh-CN")
                : "尚未加载"}
            </li>
          </ul>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-heading">
          <div>
            <h2>后台账号管理</h2>
            <p>可停用或恢复老人、家属账号；当前管理员账号不能停用。</p>
          </div>
          <Settings2 size={23} color="var(--primary)" aria-hidden="true" />
        </div>
        <div className="admin-account-list">
          {adminAccounts.map((account) => (
            <article className="admin-account-row" key={account.id}>
              <span className="admin-account-icon">
                {account.role === "family" ? (
                  <UsersRound size={21} />
                ) : (
                  <UserRound size={21} />
                )}
              </span>
              <span>
                <strong>{account.displayName}</strong>
                <small>
                  {roleLabels[account.role]} · {account.username} · 家庭码{" "}
                  {account.familyCode || "无"}
                </small>
              </span>
              <span className={`chip ${account.disabled ? "risk-medium" : ""}`}>
                {account.disabled
                  ? "已停用"
                  : account.hasSession
                    ? "在线"
                    : "未登录"}
              </span>
              {account.role !== "admin" ? (
                <button
                  className="btn"
                  type="button"
                  disabled={updatingId === account.id}
                  onClick={() => void toggleAccount(account)}
                >
                  {updatingId === account.id ? "处理中…" : account.disabled ? "恢复" : "停用"}
                </button>
              ) : (
                <span className="field-hint">当前管理员</span>
              )}
            </article>
          ))}
          {!adminAccounts.length && !loading ? (
            <p className="field-hint">暂无可管理账号。</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
