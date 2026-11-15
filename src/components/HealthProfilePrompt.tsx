import { HeartPulse, UserRound } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/useAppStore";

export function HealthProfilePrompt() {
  const role = useAppStore((state) => state.role);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const profile = useAppStore((state) => state.profile);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const storageKey = sessionAccountId
    ? `health-profile-later:${sessionAccountId}`
    : "health-profile-later";
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(storageKey) === "1"
  );
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(
    profile.healthProfileCompleted ? profile.age || "" : ""
  );
  const [conditions, setConditions] = useState(
    profile.healthProfileCompleted ? profile.conditions.join("、") : ""
  );
  const [allergies, setAllergies] = useState(
    profile.healthProfileCompleted ? profile.allergies.join("、") : ""
  );
  const [error, setError] = useState("");

  if (
    role !== "elder" ||
    profile.healthProfileCompleted ||
    dismissed
  ) {
    return null;
  }

  function save() {
    const parsedAge = Number(age);
    if (!name.trim()) {
      setError("请填写您的称呼");
      return;
    }
    if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      setError("请填写 1 到 120 岁之间的年龄");
      return;
    }
    updateProfile({
      name: name.trim(),
      age: parsedAge,
      healthProfileCompleted: true,
      conditions: conditions
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      allergies: allergies
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    });
  }

  return (
    <div className="modal-backdrop health-profile-backdrop">
      <section
        className="modal health-profile-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-profile-title"
      >
        <span className="auth-brand-mark" style={{ width: 58, height: 58 }}>
          <HeartPulse size={30} aria-hidden="true" />
        </span>
        <p className="eyebrow" style={{ marginTop: 14 }}>
          建立个人档案
        </p>
        <h2 id="health-profile-title">先了解您的身体情况</h2>
        <p>
          这些信息只用于判断用药风险。可以不填疾病和过敏史，后续仍可在“我的”中修改。
        </p>
        <div className="form-grid" style={{ marginTop: 18 }}>
          <label className="field">
            <span className="field-label">称呼 *</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="您希望我们怎么称呼您"
            />
          </label>
          <label className="field">
            <span className="field-label">年龄 *</span>
            <input
              className="input"
              type="number"
              min="1"
              max="120"
              value={age}
              onChange={(event) => setAge(event.target.value)}
              placeholder="例如：68"
            />
          </label>
          <label className="field full">
            <span className="field-label">已有疾病（可选）</span>
            <input
              className="input"
              value={conditions}
              onChange={(event) => setConditions(event.target.value)}
              placeholder="例如：高血压、糖尿病；没有可留空"
            />
          </label>
          <label className="field full">
            <span className="field-label">过敏史（可选）</span>
            <input
              className="input"
              value={allergies}
              onChange={(event) => setAllergies(event.target.value)}
              placeholder="例如：青霉素；没有可留空"
            />
          </label>
        </div>
        {error ? (
          <p className="auth-error" style={{ marginTop: 12 }} role="alert">
            {error}
          </p>
        ) : null}
        <div className="header-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" type="button" onClick={save}>
            <UserRound size={19} aria-hidden="true" />
            保存个人资料
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              sessionStorage.setItem(storageKey, "1");
              setDismissed(true);
            }}
          >
            稍后填写
          </button>
        </div>
      </section>
    </div>
  );
}
