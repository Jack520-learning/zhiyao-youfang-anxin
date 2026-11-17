import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  LogIn,
  LoaderCircle,
  KeyRound,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteCloudFamily,
  unsubscribeFromPush
} from "../lib/cloud";
import {
  decryptPassword,
  encryptPassword,
  verifyPassword
} from "../lib/auth";
import { updateServerAccount, verifyServerAccountPassword } from "../lib/accountApi";
import { getLinkedFamilyCodes } from "../lib/workspaces";
import { useAppStore } from "../store/useAppStore";
import { toChineseErrorMessage } from "../lib/userMessage";
import type { LocalAccount, UserRole } from "../types";

export function AccountSwitcher({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const accounts = useAppStore((state) => state.accounts);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const switchAccount = useAppStore((state) => state.switchAccount);
  const verifyAccountPassword = useAppStore(
    (state) => state.verifyAccountPassword
  );
  const deleteLinkedAccount = useAppStore(
    (state) => state.deleteLinkedAccount
  );
  const logoutAccount = useAppStore((state) => state.logoutAccount);
  const [deleteTarget, setDeleteTarget] = useState<LocalAccount>();
  const [deletePassword, setDeletePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [revealAccountId, setRevealAccountId] = useState<string>();
  const [revealedPassword, setRevealedPassword] = useState("");
  const [revealError, setRevealError] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [setupPasswordAccountId, setSetupPasswordAccountId] = useState<string>();
  const [setupPasswordValue, setSetupPasswordValue] = useState("");
  const [setupPasswordError, setSetupPasswordError] = useState("");
  const [settingUpPassword, setSettingUpPassword] = useState(false);
  // 编辑账号
  const [editTarget, setEditTarget] = useState<LocalAccount>();
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editCurrentPassword, setEditCurrentPassword] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [adminSwitchTarget, setAdminSwitchTarget] = useState<LocalAccount>();
  const [adminSwitchPassword, setAdminSwitchPassword] = useState("");
  const [adminSwitchError, setAdminSwitchError] = useState("");
  const [adminSwitchBusy, setAdminSwitchBusy] = useState(false);
  const [showAdminSwitchPassword, setShowAdminSwitchPassword] =
    useState(false);

  useEffect(() => {
    if (open) return;
    setDeleteTarget(undefined);
    setDeletePassword("");
    setShowPassword(false);
    setDeleteError("");
    setDeleteNotice("");
    setDeleting(false);
    setRevealAccountId(undefined);
    setRevealedPassword("");
    setRevealError("");
    setSetupPasswordAccountId(undefined);
    setSetupPasswordValue("");
    setSetupPasswordError("");
    setEditTarget(undefined);
    setEditUsername("");
    setEditDisplayName("");
    setEditCurrentPassword("");
    setEditNewPassword("");
    setEditConfirmPassword("");
    setEditError("");
    setEditNotice("");
    setAdminSwitchTarget(undefined);
    setAdminSwitchPassword("");
    setAdminSwitchError("");
    setAdminSwitchBusy(false);
    setShowAdminSwitchPassword(false);
  }, [open]);

  if (!open) return null;

  const groupedAccounts: Array<{
    role: UserRole;
    title: string;
    accounts: LocalAccount[];
  }> = [
    {
      role: "elder",
      title: "老人端",
      accounts: accounts.filter((account) => account.role === "elder")
    },
    {
      role: "family",
      title: "家属端",
      accounts: accounts.filter((account) => account.role === "family")
    },
    {
      role: "admin",
      title: "后台管理端",
      accounts: accounts.filter((account) => account.role === "admin")
    }
  ];

  async function completeSwitch(account: LocalAccount) {
    onClose();
    navigate(
      account.role === "admin"
        ? "/admin"
        : account.role === "family"
          ? "/family"
          : "/"
    );
  }

  async function switchTo(account: LocalAccount) {
    if (account.id !== sessionAccountId) {
      if (account.role === "admin") {
        setAdminSwitchTarget(account);
        setAdminSwitchPassword("");
        setAdminSwitchError("");
        setShowAdminSwitchPassword(false);
        setDeleteNotice("");
        return;
      }
      const result = await switchAccount(account.id);
      if (!result.ok) {
        setDeleteNotice(result.error || "账号切换失败");
        return;
      }
    }
    await completeSwitch(account);
  }

  async function confirmAdminSwitch() {
    if (!adminSwitchTarget) return;
    if (!adminSwitchPassword) {
      setAdminSwitchError("请输入后台管理员密码");
      return;
    }
    setAdminSwitchBusy(true);
    setAdminSwitchError("");
    try {
      const result = await switchAccount(adminSwitchTarget.id, {
        adminPassword: adminSwitchPassword
      });
      if (!result.ok) {
        setAdminSwitchError(result.error || "管理员密码验证失败");
        return;
      }
      const target = adminSwitchTarget;
      setAdminSwitchTarget(undefined);
      setAdminSwitchPassword("");
      await completeSwitch(target);
    } finally {
      setAdminSwitchBusy(false);
    }
  }

  function closeSwitcher() {
    setDeleteTarget(undefined);
    setDeletePassword("");
    setShowPassword(false);
    setDeleteError("");
    setDeleteNotice("");
    setRevealAccountId(undefined);
    setRevealedPassword("");
    setRevealError("");
    setSetupPasswordAccountId(undefined);
    setSetupPasswordValue("");
    setSetupPasswordError("");
    setEditTarget(undefined);
    setEditDisplayName("");
    setEditCurrentPassword("");
    setEditNewPassword("");
    setEditConfirmPassword("");
    setEditError("");
    setEditNotice("");
    setAdminSwitchTarget(undefined);
    setAdminSwitchPassword("");
    setAdminSwitchError("");
    setAdminSwitchBusy(false);
    setShowAdminSwitchPassword(false);
    onClose();
  }

  function startEdit(account: LocalAccount) {
    setEditTarget(account);
    setEditUsername(account.username);
    setEditDisplayName(account.displayName);
    setEditCurrentPassword("");
    setEditNewPassword("");
    setEditConfirmPassword("");
    setEditError("");
    setEditNotice("");
  }

  async function confirmEdit() {
    if (!editTarget) return;
    setEditing(true);
    setEditError("");
    setEditNotice("");
    try {
      // 必须有当前密码
      if (!editCurrentPassword) {
        setEditError("请输入该账号的当前密码");
        return;
      }
      // 至少修改一项
      const changedUser = editUsername.trim() && editUsername.trim() !== editTarget.username;
      const changedName = editDisplayName.trim() && editDisplayName.trim() !== editTarget.displayName;
      const changedPwd = editNewPassword.trim();
      if (!changedUser && !changedName && !changedPwd) {
        setEditError("至少修改用户名、显示名或密码一项");
        return;
      }
      // 新用户名校验
      if (changedUser) {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(editUsername.trim())) {
          setEditError("用户名 3-20 位，仅字母、数字、下划线");
          return;
        }
      }
      // 新密码校验
      if (changedPwd) {
        if (editNewPassword.trim().length < 4) {
          setEditError("新密码至少 4 位");
          return;
        }
        if (editNewPassword.trim() !== editConfirmPassword.trim()) {
          setEditError("两次输入的新密码不一致");
          return;
        }
        if (editNewPassword.trim() === editCurrentPassword) {
          setEditError("新密码不能和当前密码相同");
          return;
        }
      }
      // 先本地验证当前密码（有 hash 就本地，没有走服务端）
      let currentValid = Boolean(editTarget.passwordHash) && await verifyPassword(editCurrentPassword, editTarget.passwordHash, editTarget.passwordSalt);
      if (!currentValid) {
        currentValid = await verifyServerAccountPassword({
          token: "",
          accountId: editTarget.id,
          password: editCurrentPassword
        });
      }
      if (!currentValid) {
        setEditError("当前密码不正确");
        return;
      }
      // 调后端更新
      const result = await updateServerAccount({
        accountId: editTarget.id,
        currentPassword: editCurrentPassword,
        ...(changedUser ? { newUsername: editUsername.trim() } : {}),
        ...(changedPwd ? { newPassword: editNewPassword.trim() } : {}),
        ...(changedName ? { displayName: editDisplayName.trim() } : {})
      });
      // 更新本地 store
      const finalUsername = changedUser ? editUsername.trim() : editTarget.username;
      const newEncryptedPwd = changedPwd
        ? await encryptPassword(editNewPassword.trim(), finalUsername)
        : undefined;
      useAppStore.setState((state) => {
        const updates: Partial<typeof state> = {
          accounts: state.accounts.map((item) => {
            if (item.id !== editTarget.id) return item;
            return {
              ...item,
              username: changedUser ? finalUsername : item.username,
              displayName: changedName ? editDisplayName.trim() : item.displayName,
              ...(newEncryptedPwd ? { encryptedPassword: newEncryptedPwd } : {})
            };
          })
        };
        if (sessionAccountId === editTarget.id && changedName && state.profile) {
          updates.profile = { ...state.profile, name: editDisplayName.trim() };
        }
        return updates;
      });
      setEditTarget(undefined);
      setEditNotice("账号信息已更新");
    } catch (error) {
      setEditError(
        toChineseErrorMessage(error, "账号信息更新失败，请稍后重试。")
      );
    } finally {
      setEditing(false);
    }
  }

  async function toggleRevealPassword(account: LocalAccount) {
    // 只能查看当前登录账号的密码
    if (account.id !== sessionAccountId) {
      setRevealError("只能查看当前登录账号的密码");
      return;
    }
    // 再次点击同一账号 → 隐藏
    if (revealAccountId === account.id) {
      setRevealAccountId(undefined);
      setRevealedPassword("");
      setRevealError("");
      return;
    }
    setRevealing(true);
    setRevealError("");
    try {
      if (account.encryptedPassword) {
        const password = await decryptPassword(
          account.encryptedPassword,
          account.username
        );
        setRevealAccountId(account.id);
        setRevealedPassword(password);
      } else {
        // 旧账号没有加密密码，需要让用户输入一次来补存
        setSetupPasswordAccountId(account.id);
        setSetupPasswordValue("");
        setSetupPasswordError("");
      }
    } catch (error) {
      setRevealError(
        toChineseErrorMessage(error, "暂时无法查看密码，请重试。")
      );
      setRevealAccountId(undefined);
      setRevealedPassword("");
    } finally {
      setRevealing(false);
    }
  }

  async function confirmSetupPassword(account: LocalAccount) {
    if (!setupPasswordValue) {
      setSetupPasswordError("请输入该账号的密码");
      return;
    }
    setSettingUpPassword(true);
    setSetupPasswordError("");
    try {
      // 先用本地 hash 验证
      const localValid =
        Boolean(account.passwordHash) &&
        (await verifyPassword(
          setupPasswordValue,
          account.passwordHash,
          account.passwordSalt
        ));
      let valid = localValid;
      // 本地失败时 fallback 到服务端验证
      if (!valid && account.serverAccountId) {
        valid = await verifyAccountPassword(account.id, setupPasswordValue);
      }
      if (!valid) {
        setSetupPasswordError("密码不正确");
        return;
      }
      // 加密保存
      const encrypted = await encryptPassword(
        setupPasswordValue,
        account.username
      );
      // 更新 store 中该账号
      useAppStore.setState((state) => ({
        accounts: state.accounts.map((item) =>
          item.id === account.id
            ? { ...item, encryptedPassword: encrypted }
            : item
        )
      }));
      // 直接显示
      setSetupPasswordAccountId(undefined);
      setSetupPasswordValue("");
      setRevealAccountId(account.id);
      setRevealedPassword(setupPasswordValue);
    } catch (error) {
      setSetupPasswordError(
        toChineseErrorMessage(error, "密码保存失败，请稍后重试。")
      );
    } finally {
      setSettingUpPassword(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (!deletePassword) {
      setDeleteError("请输入这个账号的密码");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    const wasCurrent = deleteTarget.id === sessionAccountId;
    try {
      const passwordValid = await verifyAccountPassword(
        deleteTarget.id,
        deletePassword
      );
      if (!passwordValid) {
        setDeleteError("密码不正确，账号尚未删除");
        return;
      }
      if (deleteTarget.role === "elder") {
        await deleteCloudFamily(deleteTarget.familyCode);
      } else if (wasCurrent) {
        await unsubscribeFromPush().catch(() => undefined);
      }
      const result = await deleteLinkedAccount(
        deleteTarget.id,
        deletePassword
      );
      if (!result.ok) {
        setDeleteError(result.error || "账号删除失败");
        return;
      }
      setDeleteTarget(undefined);
      setDeletePassword("");
      setShowPassword(false);
      if (wasCurrent) {
        closeSwitcher();
        navigate("/");
        return;
      }
      setDeleteNotice("账号已删除，其他账号和老人档案不受影响。");
    } catch {
      setDeleteError("云端数据删除失败，请检查连接后重试");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={closeSwitcher}
    >
      <section
        className="modal account-switcher"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-switcher-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="关闭账号切换"
          style={{ float: "right" }}
          onClick={closeSwitcher}
        >
          <X size={22} />
        </button>
        <h2 id="account-switcher-title">切换账号</h2>
        <p>老人端和家属端账号分栏显示，点选即可切换。</p>
        <div className="account-switch-columns">
          {groupedAccounts.map((group) => (
            <section className="account-switch-column" key={group.role}>
              <h3>
                {group.title}
                <span>{group.accounts.length}</span>
              </h3>
              <div className="account-switch-list">
                {group.accounts.length ? (
                  group.accounts.map((account) => {
                    const active = account.id === sessionAccountId;
                    const linkedCount = getLinkedFamilyCodes(account).length;
                    const isRevealed = revealAccountId === account.id;
                    const isSetup = setupPasswordAccountId === account.id;
                    const isEdit = editTarget?.id === account.id;
                    const canReveal = active; // 只有当前登录账号才能查看密码
                    return (
                      <div key={account.id}>
                        <div
                          className={`account-switch-row ${
                            active ? "active" : ""
                          }`}
                          style={{ gridTemplateColumns: "minmax(0, 1fr) 36px 36px 36px" }}
                        >
                          <button
                            type="button"
                            className="account-switch-main"
                            onClick={() => void switchTo(account)}
                          >
                            <span>
                              <strong>{account.displayName}</strong>
                              <small>
                                {account.username}
                                {account.role === "admin"
                                  ? " · 后台管理员"
                                  : account.role === "family"
                                  ? ` · 关联 ${linkedCount} 位老人`
                                  : ` · ${account.familyCode}`}
                              </small>
                            </span>
                            <ArrowLeftRight size={19} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="account-delete-button"
                            aria-label={`编辑账号：${account.displayName}`}
                            title="编辑账号信息"
                            onClick={() => {
                              startEdit(account);
                              setRevealAccountId(undefined);
                              setSetupPasswordAccountId(undefined);
                              setDeleteTarget(undefined);
                            }}
                            disabled={editing}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="account-delete-button"
                            aria-label={
                              !canReveal
                                ? "仅当前登录账号可查看密码"
                                : isRevealed
                                ? "隐藏密码"
                                : "查看密码"
                            }
                            title={
                              !canReveal
                                ? "仅当前登录账号可查看密码"
                                : isRevealed
                                ? "隐藏密码"
                                : "查看密码"
                            }
                            onClick={() => void toggleRevealPassword(account)}
                            disabled={!canReveal || revealing || settingUpPassword}
                            style={
                              !canReveal
                                ? { opacity: 0.35, cursor: "not-allowed" }
                                : undefined
                            }
                          >
                            {revealing ? (
                              <LoaderCircle size={15} aria-hidden="true" />
                            ) : isRevealed ? (
                              <EyeOff size={15} aria-hidden="true" />
                            ) : (
                              <Eye size={15} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="account-delete-button"
                            aria-label={`删除账号：${account.displayName}`}
                            title="删除账号"
                            onClick={() => {
                              setDeleteTarget(account);
                              setDeletePassword("");
                              setShowPassword(false);
                              setDeleteError("");
                              setDeleteNotice("");
                              setEditTarget(undefined);
                            }}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                        {isRevealed && revealedPassword ? (
                          <div
                            style={{
                              marginTop: 4,
                              padding: "4px 10px",
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              background: "var(--bg)",
                              borderRadius: 6
                            }}
                          >
                            <KeyRound size={12} aria-hidden="true" />
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: 13,
                                letterSpacing: 0.5
                              }}
                            >
                              {revealedPassword}
                            </span>
                          </div>
                        ) : null}
                        {isSetup ? (
                          <div
                            style={{
                              marginTop: 4,
                              padding: 8,
                              background: "var(--bg)",
                              borderRadius: 6,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6
                            }}
                          >
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>
                              首次查看需输入密码验证并保存
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                className="input"
                                type="password"
                                value={setupPasswordValue}
                                onChange={(e) =>
                                  setSetupPasswordValue(e.target.value)
                                }
                                placeholder="输入该账号密码"
                                autoComplete="current-password"
                                style={{ flex: 1, padding: "6px 10px", fontSize: 13 }}
                              />
                              <button
                                className="btn"
                                type="button"
                                disabled={settingUpPassword}
                                onClick={() => void confirmSetupPassword(account)}
                                style={{ padding: "6px 12px", fontSize: 13 }}
                              >
                                {settingUpPassword ? "保存中" : "确认"}
                              </button>
                              <button
                                className="btn"
                                type="button"
                                onClick={() => {
                                  setSetupPasswordAccountId(undefined);
                                  setSetupPasswordValue("");
                                  setSetupPasswordError("");
                                }}
                                style={{ padding: "6px 10px", fontSize: 13 }}
                              >
                                取消
                              </button>
                            </div>
                            {setupPasswordError ? (
                              <p
                                className="error"
                                style={{ margin: 0, fontSize: 12 }}
                              >
                                {setupPasswordError}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {isEdit ? (
                          <div
                            style={{
                              marginTop: 6,
                              padding: 12,
                              background: "var(--bg)",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 10
                            }}
                          >
                            <h4 style={{ margin: 0, fontSize: 14 }}>
                              编辑账号：{editTarget?.displayName}
                            </h4>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ fontSize: 12, color: "var(--muted)" }}>用户名（不可与他人重复）</label>
                              <input
                                className="input"
                                type="text"
                                value={editUsername}
                                onChange={(e) => setEditUsername(e.target.value)}
                                maxLength={20}
                                placeholder="用户名"
                                style={{ padding: "6px 10px", fontSize: 13 }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ fontSize: 12, color: "var(--muted)" }}>显示名</label>
                              <input
                                className="input"
                                type="text"
                                value={editDisplayName}
                                onChange={(e) => setEditDisplayName(e.target.value)}
                                maxLength={30}
                                placeholder="修改显示名"
                                style={{ padding: "6px 10px", fontSize: 13 }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ fontSize: 12, color: "var(--muted)" }}>当前密码 *</label>
                              <input
                                className="input"
                                type="password"
                                value={editCurrentPassword}
                                onChange={(e) => setEditCurrentPassword(e.target.value)}
                                placeholder="必须输入当前密码才能修改"
                                autoComplete="current-password"
                                style={{ padding: "6px 10px", fontSize: 13 }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ fontSize: 12, color: "var(--muted)" }}>新密码（留空则不修改）</label>
                              <input
                                className="input"
                                type="password"
                                value={editNewPassword}
                                onChange={(e) => setEditNewPassword(e.target.value)}
                                placeholder="至少 4 位"
                                autoComplete="new-password"
                                style={{ padding: "6px 10px", fontSize: 13 }}
                              />
                            </div>
                            {editNewPassword ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <label style={{ fontSize: 12, color: "var(--muted)" }}>确认新密码</label>
                                <input
                                  className="input"
                                  type="password"
                                  value={editConfirmPassword}
                                  onChange={(e) => setEditConfirmPassword(e.target.value)}
                                  placeholder="再次输入新密码"
                                  autoComplete="new-password"
                                  style={{ padding: "6px 10px", fontSize: 13 }}
                                />
                              </div>
                            ) : null}
                            {editError ? (
                              <p className="error" style={{ margin: 0, fontSize: 12 }}>
                                {editError}
                              </p>
                            ) : null}
                            {editNotice ? (
                              <p className="notice" style={{ margin: 0, fontSize: 12 }}>
                                {editNotice}
                              </p>
                            ) : null}
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                              <button
                                className="btn"
                                type="button"
                                onClick={() => {
                                  setEditTarget(undefined);
                                  setEditError("");
                                  setEditNotice("");
                                }}
                                disabled={editing}
                                style={{ padding: "6px 14px" }}
                              >
                                取消
                              </button>
                              <button
                                className="btn primary"
                                type="button"
                                onClick={() => void confirmEdit()}
                                disabled={editing}
                                style={{ padding: "6px 14px" }}
                              >
                                {editing ? "保存中..." : "保存"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="account-switch-empty">
                    暂无{group.title}账号
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
        {deleteNotice ? (
          <div className="notice account-delete-notice" role="status">
            {deleteNotice}
          </div>
        ) : null}
        {adminSwitchTarget ? (
          <section className="account-switch-auth-panel">
            <div>
              <h3>
                切换到后台管理端：{adminSwitchTarget.displayName}
              </h3>
              <p>
                请输入管理员账号 {adminSwitchTarget.username} 的密码。验证通过后才会进入后台。
              </p>
            </div>
            <label className="field">
              <span className="field-label">后台管理员密码</span>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showAdminSwitchPassword ? "text" : "password"}
                  value={adminSwitchPassword}
                  onChange={(event) =>
                    setAdminSwitchPassword(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void confirmAdminSwitch();
                    }
                  }}
                  autoComplete="current-password"
                  placeholder={`账号：${adminSwitchTarget.username}`}
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none"
                  }}
                  aria-label={
                    showAdminSwitchPassword ? "隐藏管理员密码" : "显示管理员密码"
                  }
                  onClick={() =>
                    setShowAdminSwitchPassword((value) => !value)
                  }
                >
                  {showAdminSwitchPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </label>
            {adminSwitchError ? (
              <p className="auth-error" role="alert">
                {adminSwitchError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={adminSwitchBusy}
                onClick={() => void confirmAdminSwitch()}
              >
                {adminSwitchBusy ? (
                  <LoaderCircle size={19} className="spin" />
                ) : (
                  <LogIn size={19} aria-hidden="true" />
                )}
                {adminSwitchBusy ? "正在验证" : "验证并进入后台"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={adminSwitchBusy}
                onClick={() => {
                  setAdminSwitchTarget(undefined);
                  setAdminSwitchPassword("");
                  setAdminSwitchError("");
                  setShowAdminSwitchPassword(false);
                }}
              >
                取消
              </button>
            </div>
          </section>
        ) : null}
        {deleteTarget ? (
          <section className="account-delete-panel">
            <div>
              <h3>删除账号：{deleteTarget.displayName}</h3>
              <p>
                {deleteTarget.role === "elder"
                  ? "该老人的健康资料、用药清单、对话记录和云端摘要会一起删除，其他账号不会受影响。"
                  : "只删除这个家属账号及其访问关系，不会删除老人档案和其他家属账号。"}
              </p>
            </div>
            <label className="field">
              <span className="field-label">输入该账号密码确认</span>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder={`账号：${deleteTarget.username}`}
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none"
                  }}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </label>
            {deleteError ? (
              <p className="auth-error" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? (
                  <LoaderCircle size={19} className="spin" />
                ) : (
                  <Trash2 size={19} />
                )}
                {deleting ? "正在删除" : "确认删除账号"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(undefined);
                  setDeletePassword("");
                  setShowPassword(false);
                  setDeleteError("");
                }}
              >
                取消
              </button>
            </div>
          </section>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => {
            logoutAccount();
            closeSwitcher();
            navigate("/");
          }}
        >
          <LogIn size={19} aria-hidden="true" />
          登录其他账号
        </button>
      </section>
    </div>
  );
}
