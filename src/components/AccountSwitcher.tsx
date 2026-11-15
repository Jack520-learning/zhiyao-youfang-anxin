import { ArrowLeftRight, LogIn, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const logoutAccount = useAppStore((state) => state.logoutAccount);

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

  function switchTo(account: LocalAccount) {
    if (account.id !== sessionAccountId) switchAccount(account.id);
    onClose();
    navigate(account.role === "family" ? "/family" : "/");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
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
          onClick={onClose}
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
                    return (
                      <button
                        type="button"
                        className={active ? "active" : ""}
                        key={account.id}
                        onClick={() => switchTo(account)}
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
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => {
            logoutAccount();
            onClose();
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
