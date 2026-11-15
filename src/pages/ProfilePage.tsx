import {
  BellRing,
  Check,
  Cloud,
  Copy,
  Download,
  Eye,
  KeyRound,
  LockKeyhole,
  LoaderCircle,
  LogOut,
  Pause,
  Play,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Type,
  UserRound,
  Volume2,
  UsersRound
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteCloudFamily,
  subscribeToPush,
  syncCloudSnapshot,
  unsubscribeFromPush,
  updateFamilyEmergencyContacts
} from "../lib/cloud";
import {
  getSpeechPlaybackState,
  deleteCustomVoiceRemote,
  pauseSpeaking,
  resumeSpeaking,
  stopSpeaking,
  testVoiceMode,
  type SpeechPlaybackState,
  type VoiceMode
} from "../lib/speech";
import { VoiceCloneRecorder } from "../components/VoiceCloneRecorder";
import { LinkedAccountManager } from "../components/LinkedAccountManager";
import { useAppStore } from "../store/useAppStore";
import type { EmergencyContact } from "../types";

const voiceOptions: Array<{ value: VoiceMode; label: string }> = [
  { value: "warm", label: "温和女声" },
  { value: "clear", label: "明亮女声" },
  { value: "male", label: "清晰男声" },
  { value: "calm", label: "沉稳男声" }
];

export function ProfilePage() {
  const navigate = useNavigate();
  const role = useAppStore((state) => state.role);
  const familyCode = useAppStore((state) => state.familyCode);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const profile = useAppStore((state) => state.profile);
  const preferences = useAppStore((state) => state.preferences);
  const consent = useAppStore((state) => state.consent);
  const contacts = useAppStore((state) => state.emergencyContacts);
  const auditEvents = useAppStore((state) => state.auditEvents);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const updateConsent = useAppStore((state) => state.updateConsent);
  const updatePreferences = useAppStore((state) => state.updatePreferences);
  const updateEmergencyContacts = useAppStore(
    (state) => state.updateEmergencyContacts
  );
  const logoutAccount = useAppStore((state) => state.logoutAccount);
  const setFamilyCode = useAppStore((state) => state.setFamilyCode);
  const verifyCurrentPassword = useAppStore(
    (state) => state.verifyCurrentPassword
  );
  const deleteLinkedAccount = useAppStore(
    (state) => state.deleteLinkedAccount
  );
  const exportSnapshot = useAppStore((state) => state.exportSnapshot);
  const addAuditEvent = useAppStore((state) => state.addAuditEvent);
  const [codeInput, setCodeInput] = useState(familyCode);
  const [toast, setToast] = useState("");
  const [cancelAccountOpen, setCancelAccountOpen] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [speechPlayback, setSpeechPlayback] =
    useState<SpeechPlaybackState>("idle");
  const [speechLoading, setSpeechLoading] = useState(false);
  const voicePreviewVersionRef = useRef(0);
  const [notificationState, setNotificationState] = useState<
    "idle" | "loading" | "granted" | "denied"
  >("idle");
  const [editingHealth, setEditingHealth] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [contactDraft, setContactDraft] = useState<EmergencyContact[]>(contacts);
  const [healthDraft, setHealthDraft] = useState({
    name: profile.name,
    age: profile.age,
    conditions: profile.conditions.join("、"),
    allergies: profile.allergies.join("、")
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setCodeInput(familyCode);
  }, [familyCode]);

  useEffect(() => {
    setContactDraft(contacts.map((contact) => ({ ...contact })));
  }, [contacts]);

  useEffect(() => {
    if (!preferences.soundEnabled) {
      setSpeechPlayback("idle");
      return;
    }
    const timer = window.setInterval(
      () => setSpeechPlayback(getSpeechPlaybackState()),
      250
    );
    return () => window.clearInterval(timer);
  }, [preferences.soundEnabled]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(familyCode);
      setToast("家庭连接码已复制");
    } catch {
      setToast(`家庭连接码：${familyCode}`);
    }
  }

  async function enableNotifications() {
    setNotificationState("loading");
    try {
      const granted = await subscribeToPush(familyCode, role);
      updatePreferences({ notificationsEnabled: granted });
      setNotificationState(granted ? "granted" : "denied");
      setToast(
        granted
          ? "系统通知已开启；部署到 HTTPS 后可接收页面关闭时的提醒"
          : "没有获得通知权限，请检查浏览器设置"
      );
    } catch {
      setNotificationState("denied");
      setToast("通知订阅未完成，请确认使用本地预览或 HTTPS 环境");
    }
  }

  function downloadData() {
    const payload = exportSnapshot();
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `智药有方-用药档案-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    addAuditEvent("data-exported", "导出本地用药档案");
    setToast("档案已经导出");
  }

  async function cancelAccount() {
    setCancelError("");
    if (!cancelPassword) {
      setCancelError("请输入当前家属账号的密码");
      return;
    }
    setCancelBusy(true);
    const valid = await verifyCurrentPassword(cancelPassword);
    if (!valid) {
      setCancelBusy(false);
      setCancelError("密码不正确，账号尚未注销");
      return;
    }
    if (role === "elder") {
      try {
        await deleteCloudFamily(familyCode);
      } catch {
        setCancelBusy(false);
        setCancelError("云端老人数据删除失败，请检查连接后重试");
        return;
      }
    } else {
      await unsubscribeFromPush().catch(() => undefined);
    }
    if (!sessionAccountId) {
      setCancelBusy(false);
      setCancelError("当前账号状态异常，请重新登录后重试");
      return;
    }
    const deletion = await deleteLinkedAccount(
      sessionAccountId,
      cancelPassword
    );
    if (!deletion.ok) {
      setCancelBusy(false);
      setCancelError(deletion.error || "账号删除失败，请稍后重试");
      return;
    }
    setCancelPassword("");
    setCancelBusy(false);
    setCancelAccountOpen(false);
    navigate("/");
  }

  function logout() {
    if (!window.confirm("退出当前账号？本地用药和对话记录会继续保留。")) {
      return;
    }
    logoutAccount();
    navigate("/");
  }

  async function toggleSpeechPlayback() {
    if (!preferences.soundEnabled) {
      setToast("请先打开语音朗读");
      return;
    }
    if (speechPlayback === "speaking") {
      pauseSpeaking();
      setSpeechPlayback("paused");
      return;
    }
    if (speechPlayback === "paused") {
      resumeSpeaking();
      setSpeechPlayback("speaking");
      return;
    }
    await previewVoice(preferences.voiceMode, preferences.customVoiceId);
  }

  async function previewVoice(mode: VoiceMode, customVoiceId?: string) {
    const requestVersion = ++voicePreviewVersionRef.current;
    stopSpeaking();
    setSpeechPlayback("idle");
    setSpeechLoading(true);
    try {
      const started = await testVoiceMode(mode, customVoiceId);
      if (requestVersion !== voicePreviewVersionRef.current) return;
      if (!started) {
        setToast("当前浏览器没有可用的语音朗读功能");
        return;
      }
      setSpeechPlayback("speaking");
    } finally {
      if (requestVersion === voicePreviewVersionRef.current) {
        setSpeechLoading(false);
      }
    }
  }

  function addCustomVoice(voiceId: string, voiceName: string) {
    const customVoices = [
      ...preferences.customVoices.filter((voice) => voice.id !== voiceId),
      { id: voiceId, name: voiceName, createdAt: new Date().toISOString() }
    ];
    updatePreferences({
      customVoices,
      customVoiceId: voiceId,
      customVoiceName: voiceName,
      voiceMode: "custom"
    });
    setToast("专属音色已创建并启用");
    void previewVoice("custom", voiceId);
  }

  async function deleteCustomVoice(voiceId: string) {
    if (!window.confirm("确定删除这个专属音色吗？删除后需要重新录制。")) {
      return;
    }
    try {
      await deleteCustomVoiceRemote(voiceId);
      const customVoices = preferences.customVoices.filter(
        (voice) => voice.id !== voiceId
      );
      const wasSelected =
        preferences.voiceMode === "custom" &&
        preferences.customVoiceId === voiceId;
      const next = customVoices[0];
      if (wasSelected) stopSpeaking();
      updatePreferences({
        customVoices,
        customVoiceId: wasSelected ? next?.id : preferences.customVoiceId,
        customVoiceName: wasSelected ? next?.name : preferences.customVoiceName,
        voiceMode: wasSelected ? (next ? "custom" : "warm") : preferences.voiceMode
      });
      setSpeechPlayback("idle");
      setToast("专属音色已删除");
    } catch (deleteError) {
      setToast(
        deleteError instanceof Error ? deleteError.message : "专属音色删除失败"
      );
    }
  }

  function changeFamilyCode() {
    const clean = codeInput.trim().toUpperCase();
    if (!clean) {
      setToast("家庭连接码不能为空");
      return;
    }
    setFamilyCode(clean);
    addAuditEvent("settings-updated", "更新家庭连接码");
    setToast("家庭连接码已保存，数据会自动同步");
  }

  function saveHealthProfile() {
    const age = Number(healthDraft.age);
    if (!healthDraft.name.trim()) {
      setToast("请填写称呼");
      return;
    }
    if (!Number.isFinite(age) || age < 1 || age > 120) {
      setToast("年龄需要填写在 1 到 120 岁之间");
      return;
    }
    updateProfile({
      name: healthDraft.name.trim(),
      age,
      healthProfileCompleted: true,
      healthProfilePromptSeen: true,
      conditions: healthDraft.conditions
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      allergies: healthDraft.allergies
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    });
    setEditingHealth(false);
    setToast("健康资料已经保存");
  }

  function startEditingContacts() {
    setContactDraft(contacts.map((contact) => ({ ...contact })));
    setEditingContacts(true);
  }

  async function saveContacts() {
    const cleaned = contactDraft
      .map((contact) => ({
        ...contact,
        name: contact.name.trim(),
        relation: contact.relation.trim(),
        phone: contact.phone.trim()
      }))
      .filter((contact) => contact.name && contact.phone);
    if (!cleaned.length) {
      setToast("请至少填写一位紧急联系人和电话号码");
      return;
    }
    if (
      cleaned.some(
        (contact) => !/^[+\d][\d+\-\s]{5,19}$/.test(contact.phone)
      )
    ) {
      setToast("电话号码格式不正确，请填写 6 到 20 位数字");
      return;
    }
    updateEmergencyContacts(cleaned);
    try {
      if (role === "family") {
        await updateFamilyEmergencyContacts(familyCode, cleaned);
      } else {
        await syncCloudSnapshot(useAppStore.getState().getCloudSnapshot());
      }
    } catch {
      setToast("联系人已保存在本机，但家庭端同步暂时失败，请检查连接");
      setEditingContacts(false);
      return;
    }
    setEditingContacts(false);
    setToast("紧急联系人已更新并同步");
  }

  const emergencyContactEditor = (
    <>
      <div className="section-heading">
        <div>
          <h2>紧急联系人</h2>
          <p>紧急联系人会在老人端和已授权家属端之间实时同步。</p>
        </div>
        <Phone size={22} color="var(--primary)" aria-hidden="true" />
      </div>
      {editingContacts ? (
        <div className="emergency-contact-editor">
          {contactDraft.map((contact, index) => (
            <div className="emergency-contact-row" key={contact.id}>
              <input
                className="input"
                value={contact.name}
                placeholder="姓名"
                aria-label={`联系人 ${index + 1} 姓名`}
                onChange={(event) =>
                  setContactDraft((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, name: event.target.value }
                        : item
                    )
                  )
                }
              />
              <input
                className="input"
                value={contact.relation}
                placeholder="关系"
                aria-label={`联系人 ${index + 1} 关系`}
                onChange={(event) =>
                  setContactDraft((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, relation: event.target.value }
                        : item
                    )
                  )
                }
              />
              <input
                className="input"
                type="tel"
                value={contact.phone}
                placeholder="电话号码"
                aria-label={`联系人 ${index + 1} 电话`}
                onChange={(event) =>
                  setContactDraft((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, phone: event.target.value }
                        : item
                    )
                  )
                }
              />
              <select
                className="select"
                value={contact.kind}
                aria-label={`联系人 ${index + 1} 类型`}
                onChange={(event) =>
                  setContactDraft((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            kind: event.target.value as EmergencyContact["kind"]
                          }
                        : item
                    )
                  )
                }
              >
                <option value="family">家属</option>
                <option value="caregiver">照护者</option>
                <option value="emergency">紧急联系人</option>
              </select>
              <button
                type="button"
                className="icon-btn"
                aria-label={`删除联系人 ${contact.name || index + 1}`}
                onClick={() =>
                  setContactDraft((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
              >
                <Trash2 size={19} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            className="btn"
            type="button"
            onClick={() =>
              setContactDraft((current) => [
                ...current,
                {
                  id: `contact-${Date.now()}`,
                  name: "",
                  relation: "",
                  phone: "",
                  kind: "family"
                }
              ])
            }
          >
            <Plus size={18} aria-hidden="true" />
            添加联系人
          </button>
          <div className="header-actions">
            <button className="btn btn-primary" type="button" onClick={saveContacts}>
              <Save size={18} aria-hidden="true" />
              保存并同步
            </button>
            <button className="btn" type="button" onClick={() => setEditingContacts(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="emergency-contact-list">
            {contacts.map((contact) => (
              <a className="emergency-contact-item" href={`tel:${contact.phone}`} key={contact.id}>
                <span>
                  <strong>{contact.name}</strong>
                  <small>{contact.relation} · {contact.kind === "caregiver" ? "照护者" : contact.kind === "emergency" ? "紧急联系人" : "家属"}</small>
                </span>
                <span>{contact.phone}</span>
                <Phone size={18} aria-hidden="true" />
              </a>
            ))}
          </div>
          <button className="btn" type="button" onClick={startEditingContacts}>
            编辑紧急联系人
          </button>
        </>
      )}
    </>
  );

  if (role === "elder") {
    return (
      <div className="page profile-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">我的</p>
            <h1 className="page-title">{profile.name}，这里只有常用设置</h1>
            <p className="page-description">
              常用在外，其余收起；看不清或听不见可用大字和语音。
            </p>
          </div>
        </header>

        <div className="elder-settings-stack">
          <LinkedAccountManager />
          <section className="card card-pad">
            <div className="elder-setting-row" style={{ padding: 0 }}>
              <span className="quick-action-icon">
                <Type size={25} aria-hidden="true" />
              </span>
              <span className="settings-copy">
                <strong>文字大小</strong>
                <span>选择后整个老人端页面会一起放大</span>
              </span>
            </div>
            <div className="font-scale-options" role="group" aria-label="文字大小">
              {[
                ["standard", "标准"],
                ["large", "大字"],
                ["extra-large", "特大"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`btn ${preferences.fontScale === value ? "btn-primary" : ""}`}
                  aria-pressed={preferences.fontScale === value}
                  onClick={() =>
                    updatePreferences({
                      fontScale: value as "standard" | "large" | "extra-large"
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="card card-pad elder-setting-row">
            <span className="quick-action-icon">
              <Eye size={25} aria-hidden="true" />
            </span>
            <span className="settings-copy">
              <strong>高对比颜色</strong>
              <span>让文字更黑、边界更清楚</span>
            </span>
            <label className="switch">
              <span className="sr-only">大字和高对比</span>
              <input
                type="checkbox"
                checked={preferences.highContrast}
                onChange={(event) =>
                  updatePreferences({ highContrast: event.target.checked })
                }
              />
              <span aria-hidden="true" />
            </label>
          </section>

          <section className="card card-pad">
            <div className="elder-setting-row" style={{ padding: 0 }}>
              <span className="quick-action-icon">
                <Volume2 size={25} aria-hidden="true" />
              </span>
              <span className="settings-copy">
                <strong>语音朗读</strong>
                <span>让回答和提醒读给您听</span>
              </span>
              <label className="switch">
                <span className="sr-only">语音朗读</span>
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(event) => {
                    if (!event.target.checked) {
                      voicePreviewVersionRef.current += 1;
                      setSpeechLoading(false);
                      stopSpeaking();
                    }
                    updatePreferences({ soundEnabled: event.target.checked });
                    if (event.target.checked) {
                      void previewVoice(
                        preferences.voiceMode,
                        preferences.customVoiceId
                      );
                    }
                  }}
                />
                <span aria-hidden="true" />
              </label>
              <button
                className="btn voice-stop-button"
                type="button"
                disabled={!preferences.soundEnabled || speechPlayback === "idle"}
                onClick={() => {
                  voicePreviewVersionRef.current += 1;
                  setSpeechLoading(false);
                  stopSpeaking();
                  setSpeechPlayback("idle");
                }}
              >
                停止朗读
              </button>
            </div>
            {preferences.soundEnabled ? (
              <div className="voice-settings">
                <div
                  className="voice-mode-options"
                  role="group"
                  aria-label="朗读音色"
                >
                  {voiceOptions.map((option) => (
                    <button
                      type="button"
                      className={
                        preferences.voiceMode === option.value ? "active" : ""
                      }
                      aria-pressed={preferences.voiceMode === option.value}
                      key={option.value}
                      onClick={() => {
                        stopSpeaking();
                        updatePreferences({ voiceMode: option.value });
                        setSpeechPlayback("idle");
                        void previewVoice(option.value);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  className="btn voice-playback-button"
                  type="button"
                  onClick={() => void toggleSpeechPlayback()}
                >
                  {speechLoading ? (
                    <LoaderCircle size={18} className="spin" aria-hidden="true" />
                  ) : speechPlayback === "speaking" ? (
                    <Pause size={18} aria-hidden="true" />
                  ) : (
                    <Play size={18} aria-hidden="true" />
                  )}
                  {speechLoading
                    ? "正在准备试听"
                    : speechPlayback === "speaking"
                    ? "暂停朗读"
                    : speechPlayback === "paused"
                      ? "继续朗读"
                      : "试听当前音色"}
                </button>
                <VoiceCloneRecorder
                  onCreated={addCustomVoice}
                  customVoices={preferences.customVoices}
                  selectedVoiceId={preferences.customVoiceId}
                  onSelect={(voiceId, voiceName) => {
                    stopSpeaking();
                    updatePreferences({
                      customVoiceId: voiceId,
                      customVoiceName: voiceName,
                      voiceMode: "custom"
                    });
                    setSpeechPlayback("idle");
                    void previewVoice("custom", voiceId);
                  }}
                  onDelete={deleteCustomVoice}
                />
              </div>
            ) : null}
          </section>

          <section className="card card-pad elder-setting-row">
            <span className="quick-action-icon">
              <BellRing size={25} aria-hidden="true" />
            </span>
            <span className="settings-copy">
              <strong>吃药提醒通知</strong>
              <span>
                {preferences.notificationsEnabled ? "已经开启" : "还没开启"} ·
                时区 {profile.timeZone}
              </span>
            </span>
            <button
              className="btn"
              type="button"
              disabled={notificationState === "loading"}
              onClick={enableNotifications}
            >
              {notificationState === "loading" ? "正在打开" : "打开"}
            </button>
          </section>

          <section className="card card-pad">
            <div className="elder-setting-row" style={{ padding: 0 }}>
              <span className="quick-action-icon">
                <UsersRound size={25} aria-hidden="true" />
              </span>
              <span className="settings-copy">
                <strong>家人可以看到用药摘要</strong>
                <span>只共享必要内容，不共享完整对话</span>
              </span>
              <label className="switch">
                <span className="sr-only">家人可以看到用药摘要</span>
                <input
                  type="checkbox"
                  checked={consent.shareMedicationSummary}
                  onChange={(event) =>
                    updateConsent({
                      shareMedicationSummary: event.target.checked
                    })
                  }
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <details className="elder-more">
              <summary>更多共享设置</summary>
              {[
                ["shareMissedDose", "多次没有确认时告诉家人"],
                ["shareEmergency", "身体不舒服求助时告诉家人"],
                ["allowSosContact", "允许 SOS 联系紧急联系人"]
              ].map(([key, title]) => {
                const consentKey = key as keyof typeof consent;
                return (
                  <div className="settings-row" key={key}>
                    <div className="settings-copy">
                      <strong>{title}</strong>
                    </div>
                    <label className="switch">
                      <span className="sr-only">{title}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(consent[consentKey])}
                        onChange={(event) =>
                          updateConsent({
                            [consentKey]: event.target.checked
                          })
                        }
                      />
                      <span aria-hidden="true" />
                    </label>
                  </div>
                );
              })}
              <div className="notice warm" style={{ marginTop: 10 }}>
                <ShieldCheck size={20} aria-hidden="true" />
                高风险用药提示必须保留给家人协助处理，不能悄悄关闭。
              </div>
            </details>
          </section>

          <details className="card card-pad elder-detail-panel">
            <summary>
              <KeyRound size={24} aria-hidden="true" />
              连接家人
              <span>{familyCode}</span>
            </summary>
            <p className="field-hint">
              把连接码告诉家人，让他们在自己的设备上打开家属端。
            </p>
            <button className="btn btn-primary" type="button" onClick={copyCode}>
              <Copy size={19} aria-hidden="true" />
              复制连接码
            </button>
            <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--line)" }} />
            {emergencyContactEditor}
          </details>

          <details className="card card-pad elder-detail-panel">
            <summary>
              <UserRound size={24} aria-hidden="true" />
              我的健康资料
              <span>{profile.age} 岁</span>
            </summary>
            {editingHealth ? (
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">称呼</span>
                  <input
                    className="input"
                    value={healthDraft.name}
                    onChange={(event) =>
                      setHealthDraft({ ...healthDraft, name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">年龄</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="120"
                    value={healthDraft.age}
                    onChange={(event) =>
                      setHealthDraft({
                        ...healthDraft,
                        age: Number(event.target.value)
                      })
                    }
                  />
                </label>
                <label className="field full">
                  <span className="field-label">疾病（顿号分隔）</span>
                  <input
                    className="input"
                    value={healthDraft.conditions}
                    onChange={(event) =>
                      setHealthDraft({
                        ...healthDraft,
                        conditions: event.target.value
                      })
                    }
                  />
                </label>
                <label className="field full">
                  <span className="field-label">过敏史（顿号分隔）</span>
                  <input
                    className="input"
                    value={healthDraft.allergies}
                    onChange={(event) =>
                      setHealthDraft({
                        ...healthDraft,
                        allergies: event.target.value
                      })
                    }
                  />
                </label>
                <div className="header-actions full">
                  <button className="btn btn-primary" type="button" onClick={saveHealthProfile}>
                    保存资料
                  </button>
                  <button className="btn" type="button" onClick={() => setEditingHealth(false)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="chip-row">
                  {profile.conditions.map((condition) => (
                    <span className="chip" key={condition}>{condition}</span>
                  ))}
                  {profile.allergies.map((allergy) => (
                    <span className="chip risk-high" key={allergy}>过敏：{allergy}</span>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    setHealthDraft({
                      name: profile.name,
                      age: profile.age,
                      conditions: profile.conditions.join("、"),
                      allergies: profile.allergies.join("、")
                    });
                    setEditingHealth(true);
                  }}
                >
                  编辑健康资料
                </button>
              </>
            )}
          </details>

          <details className="card card-pad elder-detail-panel">
            <summary>
              <LockKeyhole size={24} aria-hidden="true" />
              隐私和数据
              <span>可导出或删除</span>
            </summary>
            <div className="header-actions" style={{ marginTop: 14 }}>
              <button className="btn" type="button" onClick={downloadData}>
                <Download size={19} aria-hidden="true" />
                导出档案
              </button>
              <button className="btn" type="button" onClick={logout}>
                <LogOut size={19} aria-hidden="true" />
                退出当前账号
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  setCancelPassword("");
                  setCancelError("");
                  setCancelAccountOpen(true);
                }}
              >
                <Trash2 size={19} aria-hidden="true" />
                注销老人账号
              </button>
            </div>
            <details style={{ marginTop: 14 }}>
              <summary className="text-link">查看最近操作记录</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {auditEvents.slice(0, 5).map((event) => (
                  <div className="source-item" key={event.id}>
                    <strong>{event.summary}</strong>
                    <span>{new Date(event.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
              </div>
            </details>
          </details>
        </div>
        {cancelAccountOpen ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={() => setCancelAccountOpen(false)}
          >
            <section
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-elder-account-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 id="cancel-elder-account-title">注销老人账号</h2>
              <p>
                注销后会删除当前老人账号、健康资料、用药记录、对话记录和云端家庭摘要。家属账号会保留，但会失去这个家庭的访问权限。
              </p>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">输入当前老人账号密码确认</span>
                <input
                  className="input"
                  type="password"
                  value={cancelPassword}
                  onChange={(event) => setCancelPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              {cancelError ? (
                <p className="auth-error" role="alert">
                  {cancelError}
                </p>
              ) : null}
              <div className="modal-actions">
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={cancelBusy}
                  onClick={() => void cancelAccount()}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {cancelBusy ? "正在注销" : "确认注销老人账号"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setCancelAccountOpen(false)}
                >
                  取消
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {toast ? <div className="toast" role="status">{toast}</div> : null}
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">授权 · 家属权限</p>
          <h1 className="page-title">只查看被授权的摘要</h1>
          <p className="page-description">
            只显示老人授权摘要，不展示完整对话与隐私日志。
          </p>
        </div>
        <span className="chip">
          <ShieldCheck size={15} aria-hidden="true" />
          安全用药
        </span>
      </header>

      <LinkedAccountManager />

      <div className="settings-grid">
        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>家庭连接</h2>
              <p>两台设备输入同一个连接码即可同步摘要。</p>
            </div>
            <KeyRound size={23} color="var(--primary)" aria-hidden="true" />
          </div>
          <div className="family-code">
            <span style={{ flex: 1 }}>{familyCode}</span>
            <button className="icon-btn" type="button" aria-label="复制家庭连接码" onClick={copyCode}>
              <Copy size={19} />
            </button>
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span className="field-label">加入其他家庭</span>
            <input className="input" value={codeInput} onChange={(event) => setCodeInput(event.target.value)} />
          </label>
          <button className="btn btn-primary" type="button" style={{ marginTop: 10 }} onClick={changeFamilyCode}>
            <Cloud size={18} aria-hidden="true" />
            保存家庭连接码
          </button>
          <p className="field-hint" style={{ marginTop: 12 }}>
            家庭连接码只用于关联已授权的老人与家属，请只告诉可信任的家人。
          </p>
        </section>

        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>老人档案</h2>
              <p>这些信息参与风险核查。</p>
            </div>
            <UserRound size={23} color="var(--primary)" aria-hidden="true" />
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">称呼</span>
              <input
                className="input"
                value={profile.name}
                disabled={role === "family"}
                onChange={(event) => updateProfile({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">年龄</span>
              <input
                className="input"
                type="number"
                value={profile.age}
                disabled={role === "family"}
                onChange={(event) => updateProfile({ age: Number(event.target.value) })}
              />
            </label>
            <label className="field full">
              <span className="field-label">疾病（用顿号分隔）</span>
              <input
                className="input"
                value={profile.conditions.join("、")}
                disabled={role === "family"}
                onChange={(event) =>
                  updateProfile({
                    conditions: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean)
                  })
                }
              />
            </label>
            <label className="field full">
              <span className="field-label">过敏史（用顿号分隔）</span>
              <input
                className="input"
                value={profile.allergies.join("、")}
                disabled={role === "family"}
                onChange={(event) =>
                  updateProfile({
                    allergies: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean)
                  })
                }
              />
            </label>
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        {emergencyContactEditor}
      </section>

      <div className="settings-grid" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>共享范围</h2>
              <p>只共享必要摘要，关闭后家属看不到新内容。</p>
            </div>
            <LockKeyhole size={23} color="var(--primary)" aria-hidden="true" />
          </div>
          {[
            ["shareMedicationSummary", "当前用药摘要", "药名、用法、疾病和过敏史"],
            ["shareMissedDose", "多次未确认", "需要家人协助查看时"],
            ["shareHighRisk", "高危核查结果", "必须保留，不得静默关闭"],
            ["shareEmergency", "主动求助", "SOS 时发送必要急救信息"],
            ["allowSosContact", "联系紧急联系人", "允许 SOS 链路联系预设对象"]
          ].map(([key, title, hint]) => {
            const consentKey = key as keyof typeof consent;
            return (
              <div className="settings-row" key={key}>
                <div className="settings-copy">
                  <strong>{title}</strong>
                  <span>{hint}</span>
                </div>
                <label className="switch">
                  <span className="sr-only">{title}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(consent[consentKey])}
                    disabled={role === "family" || key === "shareHighRisk"}
                    onChange={(event) =>
                      updateConsent({ [consentKey]: event.target.checked })
                    }
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            );
          })}
        </section>

        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>适老化和提醒</h2>
              <p>设备能力不同，不能使用的功能会自动降级。</p>
            </div>
            <Eye size={23} color="var(--primary)" aria-hidden="true" />
          </div>
          <div className="settings-row">
            <div className="settings-copy">
              <strong>高对比模式</strong>
              <span>增强文字和边界对比</span>
            </div>
            <label className="switch">
              <span className="sr-only">高对比模式</span>
              <input
                type="checkbox"
                checked={preferences.highContrast}
                onChange={(event) => updatePreferences({ highContrast: event.target.checked })}
              />
              <span aria-hidden="true" />
            </label>
          </div>
          <div className="settings-row">
            <div className="settings-copy">
              <strong>语音朗读</strong>
              <span>回答和提醒尽量读出来</span>
            </div>
            <label className="switch">
              <span className="sr-only">语音朗读</span>
              <input
                type="checkbox"
                checked={preferences.soundEnabled}
                onChange={(event) => {
                  if (!event.target.checked) {
                    voicePreviewVersionRef.current += 1;
                    setSpeechLoading(false);
                    stopSpeaking();
                  }
                  updatePreferences({ soundEnabled: event.target.checked });
                  if (event.target.checked) {
                    void previewVoice(
                      preferences.voiceMode,
                      preferences.customVoiceId
                    );
                  }
                }}
              />
              <span aria-hidden="true" />
            </label>
            <button
              className="btn voice-stop-button"
              type="button"
              disabled={!preferences.soundEnabled || speechPlayback === "idle"}
              onClick={() => {
                voicePreviewVersionRef.current += 1;
                setSpeechLoading(false);
                stopSpeaking();
                setSpeechPlayback("idle");
              }}
            >
              停止朗读
            </button>
          </div>
          {preferences.soundEnabled ? (
            <div className="voice-settings family-voice-settings">
              <div
                className="voice-mode-options"
                role="group"
                aria-label="朗读音色"
              >
                {voiceOptions.map((option) => (
                  <button
                    type="button"
                    className={
                      preferences.voiceMode === option.value ? "active" : ""
                    }
                    aria-pressed={preferences.voiceMode === option.value}
                    key={option.value}
                    onClick={() => {
                      stopSpeaking();
                      updatePreferences({ voiceMode: option.value });
                      setSpeechPlayback("idle");
                      void previewVoice(option.value);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                className="btn voice-playback-button"
                type="button"
                onClick={() => void toggleSpeechPlayback()}
              >
                {speechLoading ? (
                  <LoaderCircle size={18} className="spin" aria-hidden="true" />
                ) : speechPlayback === "speaking" ? (
                  <Pause size={18} aria-hidden="true" />
                ) : (
                  <Play size={18} aria-hidden="true" />
                )}
                {speechLoading
                  ? "正在准备试听"
                  : speechPlayback === "speaking"
                  ? "暂停朗读"
                  : speechPlayback === "paused"
                    ? "继续朗读"
                    : "试听当前音色"}
              </button>
              <VoiceCloneRecorder
                onCreated={addCustomVoice}
                customVoices={preferences.customVoices}
                selectedVoiceId={preferences.customVoiceId}
                onSelect={(voiceId, voiceName) => {
                  stopSpeaking();
                  updatePreferences({
                    customVoiceId: voiceId,
                    customVoiceName: voiceName,
                    voiceMode: "custom"
                  });
                  setSpeechPlayback("idle");
                  void previewVoice("custom", voiceId);
                }}
                onDelete={deleteCustomVoice}
              />
            </div>
          ) : null}
          <div className="settings-row">
            <div className="settings-copy">
              <strong>系统通知</strong>
              <span>关闭页面后接收提醒所需 · 老人时区 {profile.timeZone}</span>
            </div>
            <button
              className="btn"
              type="button"
              disabled={notificationState === "loading"}
              onClick={enableNotifications}
            >
              <BellRing size={18} aria-hidden="true" />
              {notificationState === "granted"
                ? "已订阅"
                : notificationState === "loading"
                  ? "正在订阅"
                  : "开启通知"}
            </button>
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-heading">
          <div>
            <h2>数据管理</h2>
            <p>本地数据会持久保存，删除会同时尝试清理云端摘要。</p>
          </div>
          <ShieldCheck size={23} color="var(--primary)" aria-hidden="true" />
        </div>
        <div className="header-actions">
          <button className="btn" type="button" onClick={downloadData}>
            <Download size={19} aria-hidden="true" />
            导出档案
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setCancelPassword("");
              setCancelError("");
              setCancelAccountOpen(true);
            }}
          >
            <Trash2 size={19} aria-hidden="true" />
            注销账号
          </button>
          <button className="btn" type="button" onClick={logout}>
            <LogOut size={19} aria-hidden="true" />
            退出当前账号
          </button>
        </div>
        <div className="form-grid" style={{ marginTop: 18 }}>
          {contacts.map((contact) => (
            <div className="card card-pad card-soft" key={contact.id}>
              <strong>{contact.name} · {contact.relation}</strong>
              <p style={{ marginTop: 5, color: "var(--muted)" }}>{contact.phone}</p>
            </div>
          ))}
        </div>
      </section>

      <details className="card card-pad" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 750 }}>
          查看最近 {Math.min(auditEvents.length, 10)} 条审计记录
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          {auditEvents.slice(0, 10).map((event) => (
            <div className="settings-row" key={event.id}>
              <div className="settings-copy">
                <strong>{event.summary}</strong>
                <span>{new Date(event.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              <Check size={17} color="var(--primary)" aria-hidden="true" />
            </div>
          ))}
        </div>
      </details>

      {cancelAccountOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setCancelAccountOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-account-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="cancel-account-title">注销家属账号</h2>
            <p>
              注销后只删除当前家属账号和家庭访问权限。老人账号、健康资料、用药记录和其他账号都会保留。
            </p>
            <label className="field" style={{ marginTop: 16 }}>
              <span className="field-label">输入当前账号密码确认</span>
              <input
                className="input"
                type="password"
                value={cancelPassword}
                onChange={(event) => setCancelPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {cancelError ? (
              <p className="auth-error" role="alert">
                {cancelError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                type="button"
                disabled={cancelBusy}
                onClick={() => void cancelAccount()}
              >
                <Trash2 size={18} aria-hidden="true" />
                {cancelBusy ? "正在注销" : "确认注销家属账号"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setCancelAccountOpen(false)}
              >
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
