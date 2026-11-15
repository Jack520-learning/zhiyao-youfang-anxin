import {
  ArrowRight,
  HeartHandshake,
  LockKeyhole,
  Pill,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import { FormEvent, useState } from "react";
import { subscribeToPush } from "../lib/cloud";
import { useAppStore } from "../store/useAppStore";
import type { UserRole } from "../types";

export function AuthGate() {
  const loginAccount = useAppStore((state) => state.loginAccount);
  const registerAccount = useAppStore((state) => state.registerAccount);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<UserRole>("elder");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [familyCodeInput, setFamilyCodeInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    const notificationPermission =
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(
            typeof Notification === "undefined"
              ? "denied"
              : Notification.permission
          );
    setBusy(true);
    const result =
      mode === "login"
        ? await loginAccount(username, password)
        : await registerAccount({
            username,
            password,
            displayName,
            role,
            familyCode: familyCodeInput
          });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "操作没有完成，请重试");
      return;
    }
    const permission = await notificationPermission;
    if (permission === "granted") {
      const state = useAppStore.getState();
      const enabled = await subscribeToPush(state.familyCode, state.role);
      state.updatePreferences({ notificationsEnabled: enabled });
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <span className="auth-brand-mark">
          <Pill size={38} aria-hidden="true" />
        </span>
        <p className="eyebrow">智药有方 · 安心药伴</p>
        <h1>智药有方，安心用药</h1>
        <p>
          帮老人看懂药、按时服药，遇到用药风险及时提醒家人。登录后继续使用上次保存的用药档案。
        </p>
        <div className="auth-trust-list">
          <span>
            <ShieldCheck size={20} aria-hidden="true" />
            安全核对与高风险求助边界
          </span>
          <span>
            <HeartHandshake size={20} aria-hidden="true" />
            只有授权家属能看到摘要
          </span>
          <span>
            <LockKeyhole size={20} aria-hidden="true" />
            本地保存，关闭网址后仍保留
          </span>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="登录或注册">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <>
              <fieldset className="auth-role-choice">
                <legend>选择身份</legend>
                <button
                  type="button"
                  className={role === "elder" ? "active" : ""}
                  aria-pressed={role === "elder"}
                  onClick={() => setRole("elder")}
                >
                  <UserRound size={24} aria-hidden="true" />
                  <span>
                    <strong>我是老人</strong>
                    <small>管理自己的用药档案</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={role === "family" ? "active" : ""}
                  aria-pressed={role === "family"}
                  onClick={() => setRole("family")}
                >
                  <UsersRound size={24} aria-hidden="true" />
                  <span>
                    <strong>我是家属</strong>
                    <small>凭家庭码查看摘要</small>
                  </span>
                </button>
              </fieldset>
              <label className="auth-field">
                <span>称呼</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={role === "elder" ? "例如：林阿姨" : "例如：林晓"}
                  autoComplete="name"
                />
              </label>
            </>
          ) : null}

          <label className="auth-field">
            <span>账号</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3 到 24 位中文、字母或数字"
              autoComplete="username"
              required
            />
          </label>
          <label className="auth-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>
          {mode === "register" ? (
            <>
              <label className="auth-field">
                <span>确认密码</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              {role === "family" ? (
                <label className="auth-field">
                  <span>老人端的家庭连接码</span>
                  <input
                    value={familyCodeInput}
                    onChange={(event) =>
                      setFamilyCodeInput(event.target.value.toUpperCase())
                    }
                    placeholder="由老人账号提供"
                    required
                  />
                </label>
              ) : (
                <label className="auth-field">
                  <span>设置家庭连接码</span>
                  <input
                    value={familyCodeInput}
                    onChange={(event) =>
                      setFamilyCodeInput(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 8)
                      )
                    }
                    placeholder="自己设置 6 到 8 位字母或数字"
                    minLength={6}
                    maxLength={8}
                    required
                  />
                </label>
              )}
            </>
          ) : null}

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "正在处理…" : mode === "login" ? "进入我的档案" : "创建账号并进入"}
            <ArrowRight size={21} aria-hidden="true" />
          </button>
        </form>
        <p className="auth-footnote">
          本地演示账号采用加盐密码摘要。家庭连接码用于连接老人与家属，请只告诉可信任的家人。
        </p>
      </section>
    </main>
  );
}
