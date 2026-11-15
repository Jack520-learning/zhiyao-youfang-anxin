import {
  ArrowLeftRight,
  Check,
  KeyRound,
  Plus,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { createFamilyCode } from "../lib/ids";
import {
  getLinkedFamilyCodes,
  normalizeFamilyCode,
  workspaceKey
} from "../lib/workspaces";
import { useAppStore } from "../store/useAppStore";
import type { UserRole } from "../types";

type AddMode = Extract<UserRole, "elder" | "family">;

export function LinkedAccountManager() {
  const accounts = useAppStore((state) => state.accounts);
  const workspaces = useAppStore((state) => state.workspaces);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const familyCode = useAppStore((state) => state.familyCode);
  const profile = useAppStore((state) => state.profile);
  const createLinkedAccount = useAppStore(
    (state) => state.createLinkedAccount
  );
  const activateFamilyCode = useAppStore(
    (state) => state.activateFamilyCode
  );
  const currentAccount = accounts.find(
    (account) => account.id === sessionAccountId
  );
  const currentCodes = currentAccount
    ? getLinkedFamilyCodes(currentAccount)
    : [];
  const linkedAccounts = accounts.filter((account) =>
    getLinkedFamilyCodes(account).some((code) => currentCodes.includes(code))
  );
  const linkedFamilyAccounts = linkedAccounts.filter(
    (account) => account.role === "family"
  );
  const elderProfiles = useMemo(() => {
    if (currentAccount?.role !== "family") return [];
    return currentCodes.map((code) => {
      const elderAccount = accounts.find(
        (account) =>
          account.role === "elder" && account.familyCode === code
      );
      const cached = workspaces[workspaceKey(currentAccount.id, code)];
      const name =
        (code === familyCode ? profile.name : cached?.profile.name) ||
        elderAccount?.displayName ||
        "未命名老人";
      return {
        code,
        name,
        username: elderAccount?.username
      };
    });
  }, [
    accounts,
    currentAccount,
    currentCodes,
    familyCode,
    profile.name,
    workspaces
  ]);
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newFamilyCode, setNewFamilyCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  function openForm(mode: AddMode) {
    setAddMode(mode);
    setDisplayName("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setNewFamilyCode(mode === "elder" ? createFamilyCode() : familyCode);
    setError("");
    setSuccess("");
  }

  function closeForm() {
    setAddMode(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!addMode) return;
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    const result = await createLinkedAccount({
      username,
      password,
      displayName,
      role: addMode,
      familyCode: newFamilyCode
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "账号添加失败，请重试");
      return;
    }
    setSuccess(
      addMode === "family"
        ? `家属账号 ${displayName.trim() || username} 已添加，可以继续添加多个。`
        : `老人档案 ${displayName.trim() || username} 已添加，可在下方切换查看。`
    );
    setAddMode(null);
    setPassword("");
    setConfirmPassword("");
  }

  if (!currentAccount) return null;

  return (
    <details className="card card-pad linked-account-manager">
      <summary>
        <UsersRound size={24} aria-hidden="true" />
        家庭账号
        <span>
          家属 {linkedFamilyAccounts.length}
          {currentAccount.role === "family"
            ? ` · 老人 ${elderProfiles.length}`
            : ""}
        </span>
      </summary>
      <p className="field-hint">
        添加的账号会保留家庭关联。不同老人使用各自独立的用药档案，不会混合药物和过敏信息。
      </p>

      {currentAccount.role === "family" ? (
        <section className="linked-account-section">
          <div className="linked-account-section-head">
            <div>
              <h3>照顾的老人</h3>
              <p>切换后，家属端只显示所选老人的档案。</p>
            </div>
            <span>{elderProfiles.length} 个档案</span>
          </div>
          <div className="linked-elder-list">
            {elderProfiles.map((elder) => {
              const active = elder.code === familyCode;
              return (
                <button
                  type="button"
                  className={active ? "active" : ""}
                  key={elder.code}
                  onClick={() => {
                    if (active) return;
                    const result = activateFamilyCode(elder.code);
                    setSuccess(
                      result.ok
                        ? `已切换到 ${elder.name} 的档案`
                        : result.error || "切换失败"
                    );
                  }}
                >
                  <span>
                    <strong>{elder.name}</strong>
                    <small>
                      连接码 {elder.code}
                      {elder.username ? ` · ${elder.username}` : ""}
                    </small>
                  </span>
                  {active ? (
                    <Check size={19} aria-hidden="true" />
                  ) : (
                    <ArrowLeftRight size={18} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="linked-account-section">
        <div className="linked-account-section-head">
          <div>
            <h3>家属账号</h3>
            <p>同一个老人可以绑定多个家属账号。</p>
          </div>
          <span>{linkedFamilyAccounts.length} 个账号</span>
        </div>
        <div className="linked-family-list">
          {linkedFamilyAccounts.length ? (
            linkedFamilyAccounts.map((account) => (
              <div key={account.id}>
                <span>
                  <strong>{account.displayName}</strong>
                  <small>{account.username}</small>
                </span>
                {account.id === sessionAccountId ? <b>当前</b> : null}
              </div>
            ))
          ) : (
            <p className="linked-account-empty">还没有关联家属账号。</p>
          )}
        </div>
      </section>

      {success ? (
        <div className="notice linked-account-success" role="status">
          <Check size={20} aria-hidden="true" />
          {success}
        </div>
      ) : null}

      <div className="linked-account-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openForm("family")}
        >
          <Plus size={19} aria-hidden="true" />
          添加家属账号
        </button>
        {currentAccount.role === "family" ? (
          <button
            type="button"
            className="btn"
            onClick={() => openForm("elder")}
          >
            <Plus size={19} aria-hidden="true" />
            添加老人档案
          </button>
        ) : null}
      </div>

      {addMode ? (
        <form className="linked-account-form" onSubmit={submit}>
          <div className="linked-account-form-head">
            <div>
              <h3>
                {addMode === "family" ? "添加家属账号" : "添加老人档案"}
              </h3>
              <p>
                {addMode === "family"
                  ? `新账号将关联当前老人连接码 ${familyCode}。`
                  : "为另一位老人建立独立连接码和用药档案。"}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="关闭添加账号表单"
              onClick={closeForm}
            >
              <X size={20} />
            </button>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">称呼</span>
              <input
                className="input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={
                  addMode === "family" ? "例如：李女士" : "例如：王阿姨"
                }
                required
              />
            </label>
            <label className="field">
              <span className="field-label">登录账号</span>
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="3 到 24 位"
                autoComplete="off"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">初始密码</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">确认密码</span>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <label className="field full">
              <span className="field-label">
                {addMode === "family" ? "家庭连接码" : "新老人连接码"}
              </span>
              <input
                className="input"
                value={newFamilyCode}
                readOnly={addMode === "family"}
                minLength={6}
                maxLength={8}
                onChange={(event) =>
                  setNewFamilyCode(
                    normalizeFamilyCode(event.target.value)
                  )
                }
                required
              />
              <span className="field-hint">
                {addMode === "family"
                  ? "家属使用这个连接码查看当前老人的授权摘要。"
                  : "每位老人必须使用不同连接码，避免健康档案混在一起。"}
              </span>
            </label>
          </div>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
            >
              <KeyRound size={19} aria-hidden="true" />
              {busy ? "正在添加" : "确认添加"}
            </button>
            <button className="btn" type="button" onClick={closeForm}>
              取消
            </button>
          </div>
        </form>
      ) : null}
    </details>
  );
}
