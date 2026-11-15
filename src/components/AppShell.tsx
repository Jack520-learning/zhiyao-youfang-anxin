import {
  ArrowLeftRight,
  BellRing,
  Camera,
  CircleUserRound,
  Cloud,
  CloudOff,
  FileHeart,
  House,
  MessageCircleHeart,
  Pill,
  RefreshCw,
  ShieldAlert,
  UserRound,
  UsersRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCloudSync, type SyncStatus } from "../hooks/useCloudSync";
import { localTimeZone } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import { AccountSwitcher } from "./AccountSwitcher";
import { AuthGate } from "./AuthGate";
import { FloatingSos } from "./FloatingSos";
import { HealthProfilePrompt } from "./HealthProfilePrompt";
import { SosModal } from "./SosModal";
import { ReminderOverlay } from "./ReminderOverlay";
import { SpeechPlaybackDock } from "./SpeechPlaybackDock";

interface NavItem {
  to: string;
  label: string;
  icon: typeof House;
  end?: boolean;
}

const elderNav: NavItem[] = [
  { to: "/chat", label: "问药识药", icon: MessageCircleHeart },
  { to: "/today", label: "今日", icon: House },
  { to: "/medications", label: "用药", icon: Pill },
  { to: "/profile", label: "我的", icon: UserRound }
];

const familyNav: NavItem[] = [
  { to: "/family", label: "概览", icon: UsersRound },
  { to: "/safety", label: "风险", icon: ShieldAlert },
  { to: "/medications", label: "用药", icon: FileHeart },
  { to: "/profile", label: "授权", icon: CircleUserRound }
];

function syncLabel(status: SyncStatus): string {
  const labels: Record<SyncStatus, string> = {
    idle: "等待同步",
    syncing: "正在同步",
    synced: "已同步",
    offline: "尚未同步",
    error: "同步异常"
  };
  return labels[status];
}

function belongsToDiscovery(pathname: string): boolean {
  return (
    pathname === "/chat" ||
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/herbs") ||
    pathname.startsWith("/multi-drug")
  );
}

export function AppShell() {
  const role = useAppStore((state) => state.role);
  const hydrated = useAppStore((state) => state.hydrated);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const accounts = useAppStore((state) => state.accounts);
  const preferences = useAppStore((state) => state.preferences);
  const syncStatus = useCloudSync();
  const navigate = useNavigate();
  const location = useLocation();
  const [sosOpen, setSosOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);

  document.body.dataset.theme = preferences.highContrast
    ? "high-contrast"
    : "standard";
  document.body.dataset.fontSize = preferences.fontScale;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.body.dataset.fixedView =
      location.pathname === "/chat" ? "chat" : "";
  }, [location.pathname]);

  useEffect(() => {
    if (!sessionAccountId) return;
    if (role === "family" && location.pathname === "/chat") {
      navigate("/family", { replace: true });
    } else if (role === "elder" && location.pathname === "/family") {
      navigate("/", { replace: true });
    }
  }, [location.pathname, navigate, role, sessionAccountId]);

  useEffect(() => {
    if (!sessionAccountId || role !== "elder") return;
    const state = useAppStore.getState();
    const timeZone = localTimeZone();
    if (state.profile.timeZone !== timeZone) {
      state.updateProfile({ timeZone });
    }
  }, [sessionAccountId, role]);

  if (!hydrated) {
    return (
      <div className="loading-screen" aria-live="polite">
        <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
          <span className="loading-mark">
            <Pill size={38} aria-hidden="true" />
          </span>
          <strong>正在打开您的安全用药档案</strong>
        </div>
      </div>
    );
  }

  if (!sessionAccountId) return <AuthGate />;

  const nav = role === "elder" ? elderNav : familyNav;
  const roleName = role === "elder" ? "老人端" : "家属端";
  const account = accounts.find((item) => item.id === sessionAccountId);

  function navClass({ isActive }: { isActive: boolean }) {
    return isActive ? "active" : "";
  }

  return (
    <div className="app-frame">
      <div className="app-layout">
        <aside className="side-panel" aria-label={`${roleName}侧边导航`}>
          <div className="brand">
            <span className="brand-mark">
              <Pill size={26} aria-hidden="true" />
            </span>
            <div>
              <div className="brand-title">智药有方</div>
              <div className="brand-subtitle">{roleName} · 识药问药与安全用药</div>
            </div>
          </div>
          <nav className="side-nav">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  (to === "/chat" && belongsToDiscovery(location.pathname)) ||
                  isActive ||
                  (to === "/" && location.pathname === "/")
                    ? "active"
                    : ""
                }
              >
                <Icon size={21} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="side-bottom">
            <div className="sync-pill" aria-live="polite">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {syncStatus === "offline" || syncStatus === "error" ? (
                  <CloudOff size={17} aria-hidden="true" />
                ) : syncStatus === "syncing" ? (
                  <RefreshCw size={17} aria-hidden="true" />
                ) : (
                  <Cloud size={17} aria-hidden="true" />
                )}
                {syncLabel(syncStatus)}
              </span>
              <span
                className={`sync-dot ${syncStatus}`}
                aria-hidden="true"
              />
            </div>
            <button
              className="role-switch"
              type="button"
              onClick={() => setAccountSwitcherOpen(true)}
              aria-label="切换登录账号"
            >
              <span>
                <strong>{roleName}</strong>
                <br />
                {account?.displayName || "本地账号"} · 点击切换
              </span>
              <ArrowLeftRight size={20} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <header className="mobile-topbar">
          <NavLink to={role === "elder" ? "/" : "/family"} className="brand">
            <span className="brand-mark">
              <Pill size={23} aria-hidden="true" />
            </span>
            <span>
              <span className="brand-title">智药有方</span>
              <span className="brand-subtitle">{roleName}</span>
            </span>
          </NavLink>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="切换登录账号"
              onClick={() => setAccountSwitcherOpen(true)}
            >
              {role === "elder" ? <UserRound size={21} /> : <UsersRound size={21} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="打开 SOS 求助"
              onClick={() => setSosOpen(true)}
            >
              <BellRing size={20} />
            </button>
          </div>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <FloatingSos onOpen={() => setSosOpen(true)} />
      <HealthProfilePrompt />
      <SpeechPlaybackDock />

      <nav className="mobile-nav" aria-label={`${roleName}底部导航`}>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              (to === "/chat" && belongsToDiscovery(location.pathname)) ||
              isActive
                ? "active"
                : ""
            }
          >
            <Icon size={23} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <SosModal open={sosOpen} onClose={() => setSosOpen(false)} />
      <AccountSwitcher
        open={accountSwitcherOpen}
        onClose={() => setAccountSwitcherOpen(false)}
      />
      <ReminderOverlay />
    </div>
  );
}
