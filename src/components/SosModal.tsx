import { useEffect, useState } from "react";
import { PhoneCall, ShieldAlert, UserRoundCheck, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export function SosModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const profile = useAppStore((state) => state.profile);
  const medications = useAppStore((state) => state.medications);
  const contacts = useAppStore((state) => state.emergencyContacts);
  const consent = useAppStore((state) => state.consent);
  const familyCode = useAppStore((state) => state.familyCode);
  const addAuditEvent = useAppStore((state) => state.addAuditEvent);
  const [notified, setNotified] = useState(false);
  const [notifyError, setNotifyError] = useState("");

  useEffect(() => {
    if (!open) {
      setNotified(false);
      setNotifyError("");
      return;
    }
    addAuditEvent("sos-opened", "打开 SOS 求助页面");
  }, [open, addAuditEvent]);

  if (!open) return null;

  async function notifyFamily() {
    setNotifyError("");
    try {
      const response = await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyCode,
          elderName: profile.name,
          age: profile.age,
          allergies: profile.allergies,
          medications: medications
            .filter((medication) => medication.status === "active")
            .map((medication) => medication.name)
        })
      });
      if (!response.ok) throw new Error("发送失败");
      setNotified(true);
    } catch {
      setNotifyError("通知发送失败，请直接拨打电话。");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sos-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="关闭求助页面"
          style={{ float: "right" }}
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <div className="notice danger" style={{ marginBottom: 18 }}>
          <ShieldAlert size={24} aria-hidden="true" />
          如果正在胸痛、呼吸困难、意识不清或严重过敏，请立即拨打 120。
        </div>
        <h2 id="sos-title">现在需要帮助</h2>
        <p>
          {profile.name}，{profile.age} 岁。当前药物：
          {medications
            .filter((medication) => medication.status === "active")
            .map((medication) => medication.name)
            .join("、") || "尚未建立清单"}
          。过敏史：{profile.allergies.join("、") || "未记录"}。
        </p>
        <div className="modal-actions">
          <a className="btn btn-danger btn-large" href="tel:120">
            <PhoneCall size={21} aria-hidden="true" />
            一键拨打 120
          </a>
          <a className="btn btn-large" href="tel:110">
            <PhoneCall size={21} aria-hidden="true" />
            一键拨打 110
          </a>
        </div>
        <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid var(--line)" }} />
        {consent.allowSosContact ? (
          <>
            <div className="section-heading">
              <div>
                <h2 style={{ fontSize: 20 }}>紧急联系人</h2>
                <p>系统会先发送摘要，不会自动静默拨打 120/110。</p>
              </div>
            </div>
            <div className="medication-list">
              {contacts.map((contact) => (
                <a
                  className="card medication-card"
                  href={`tel:${contact.phone}`}
                  key={contact.id}
                >
                  <span className="medication-icon">
                    <UserRoundCheck size={25} aria-hidden="true" />
                  </span>
                  <span className="medication-info">
                    <strong>{contact.name}</strong>
                    <span>{contact.relation}</span>
                  </span>
                  <span className="text-link">拨打电话</span>
                </a>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-large"
              style={{ width: "100%", marginTop: 16 }}
              onClick={notifyFamily}
            >
              {notified ? "已发送求助摘要" : "通知已授权家属"}
            </button>
          </>
        ) : (
          <div className="notice warm">
            <ShieldAlert size={21} aria-hidden="true" />
            您已经关闭 SOS 联系家人。120/110 一键拨号仍可使用，也可以在“我的”里重新开启。
          </div>
        )}
        {notifyError ? (
          <p role="alert" className="text-link" style={{ color: "var(--red)" }}>
            {notifyError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
