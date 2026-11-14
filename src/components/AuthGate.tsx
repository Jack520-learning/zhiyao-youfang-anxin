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
import { useAppStore } from "../store/useAppStore";
import type { UserRole } from "../types";

export function AuthGate() {
  const familyCode = useAppStore((state) => state.familyCode);
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
    if (!result.ok) setError(result.error || "操作没有完成，请重试");
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <span className="auth-brand-mark">
          <Pill size={38} aria-hidden="true" />
        </span>
        <p className="eyebrow">智药有方 · 安心药伴</p>
        <h1>每次回来，都记得您的用药档案</h1>
        <p>
          账号用于区分老人和家属身份。登录后继续查看上次对话、用药提醒和家庭摘要。
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
                <p className="auth-hint">
                  注册老人账号后，家庭连接码会自动生成，可在“我的”中查看。
                </p>
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
          本地演示账号采用加盐密码摘要；正式医疗部署需接入服务端身份认证。
          {familyCode ? ` 当前设备家庭码：${familyCode}` : ""}
        </p>
      </section>
    </main>
  );
}
