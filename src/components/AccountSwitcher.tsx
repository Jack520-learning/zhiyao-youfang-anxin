import { ArrowLeftRight, LogIn, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";

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
        <p>选择这台设备上已经注册的老人或家属账号。</p>
        <div className="account-switch-list">
          {accounts.map((account) => {
            const active = account.id === sessionAccountId;
            return (
              <button
                type="button"
                className={active ? "active" : ""}
                key={account.id}
                onClick={() => {
                  if (!active) switchAccount(account.id);
                  onClose();
                  navigate(account.role === "family" ? "/family" : "/");
                }}
              >
                <span>
                  <strong>{account.displayName}</strong>
                  <small>
                    {account.role === "elder" ? "老人端" : "家属端"} ·{" "}
                    {account.username}
                  </small>
                </span>
                <ArrowLeftRight size={19} aria-hidden="true" />
              </button>
            );
          })}
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
