import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  LogIn,
  LoaderCircle,
  KeyRound,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteCloudFamily,
  unsubscribeFromPush
} from "../lib/cloud";
import { decryptPassword } from "../lib/auth";
import { getLinkedFamilyCodes } from "../lib/workspaces";
import { useAppStore } from "../store/useAppStore";
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
    }
  ];

  async function switchTo(account: LocalAccount) {
    if (account.id !== sessionAccountId) {
      const result = await switchAccount(account.id);
      if (!result.ok) {
        setDeleteNotice(result.error || "账号切换失败");
        return;
      }
    }
    onClose();
    navigate(account.role === "family" ? "/family" : "/");
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
    onClose();
  }

  async function toggleRevealPassword(account: LocalAccount) {
    if (revealAccountId === account.id) {
      setRevealAccountId(undefined);
      setRevealedPassword("");
      setRevealError("");
      return;
    }
    setRevealing(true);
    setRevealError("");
    try {
      if (!account.encryptedPassword) {
        throw new Error("该账号未保存可查看的密码，请重新登录后再试");
      }
      const password = await decryptPassword(
        account.encryptedPassword,
        account.username
      );
      setRevealAccountId(account.id);
      setRevealedPassword(password);
    } catch (error) {
      setRevealError(
        error instanceof Error ? error.message : "无法解密密码，请重新登录后再试"
      );
      setRevealAccountId(undefined);
      setRevealedPassword("");
    } finally {
      setRevealing(false);
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
                    return (
                      <div key={account.id}>
                        <div
                          className={`account-switch-row ${
                            active ? "active" : ""
                          }`}
                          style={{ gridTemplateColumns: "minmax(0, 1fr) 40px 40px" }}
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
                                {account.role === "family"
                                  ? ` · 关联 ${linkedCount} 位老人`
                                  : ` · ${account.familyCode}`}
                              </small>
                            </span>
                            <ArrowLeftRight size={19} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="account-delete-button"
                            aria-label={
                              isRevealed ? "隐藏密码" : "查看密码"
                            }
                            title={isRevealed ? "隐藏密码" : "查看密码"}
                            onClick={() => void toggleRevealPassword(account)}
                            disabled={revealing}
                          >
                            {revealing ? (
                              <LoaderCircle size={16} aria-hidden="true" />
                            ) : isRevealed ? (
                              <EyeOff size={16} aria-hidden="true" />
                            ) : (
                              <Eye size={16} aria-hidden="true" />
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
                            }}
                          >
                            <Trash2 size={16} aria-hidden="true" />
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
                        {isRevealed && revealError ? (
                          <p
                            className="error"
                            style={{ marginTop: 4, fontSize: 12 }}
                          >
                            {revealError}
                          </p>
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
