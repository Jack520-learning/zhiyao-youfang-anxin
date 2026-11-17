import {
  ArrowLeft,
  CircleHelp,
  Leaf,
  LoaderCircle,
  Send,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { getHerb } from "../catalog/herbs";
import { useAppStore } from "../store/useAppStore";

export function answerHerbQuestion(
  herbName: string,
  question: string,
  hasHighRiskMedication: boolean,
  herb?: {
    aliases: string[];
    nature: string;
    flavor: string;
    meridians: string[];
    functions: string[];
    traditionalUse: string;
    safety: string[];
    identification: string[];
  }
) {
  const normalized = question.trim();
  if (!normalized) return "";
  if (/成分|有效成分|含什么|化学组成/.test(normalized)) {
    return `结论：当前药材资料主要收录${herbName}的性味、归经、传统功用、辨识和安全提醒，没有足够可靠数据列出完整化学成分。

重点：${herb?.functions.join("、") || "传统功用需结合具体品种和炮制方法理解"}。

下一步：如需核对化学成分、质量标准或含量，请以《中国药典》、正式饮片包装和中药师审核结果为准，不要凭网传成分表自行使用。`;
  }
  if (/是什么|功效|作用|有什么用|治什么|传统功用/.test(normalized)) {
    return `结论：${herbName}${herb ? `性${herb.nature}、味${herb.flavor}，归${herb.meridians.join("、")}经` : ""}。

传统功用：${herb?.functions.join("、") || "请查看当前药材条目"}。

使用边界：${herb?.traditionalUse || "这些资料用于传统知识参考，不能替代诊断或处方。"}

下一步：是否适合您需要结合体质、症状、炮制方法和正在使用的药物，由中医师或药师判断。`;
  }
  if (/辨识|怎么认|长什么样|外观|别名/.test(normalized)) {
    return `结论：辨识${herbName}不能只看颜色或单一特征，需要结合形态、气味、质地和来源。

辨识要点：${herb?.identification.join("；") || "请查看当前药材条目的辨识说明"}。

别名参考：${herb?.aliases.join("、") || "暂无别名资料"}。

下一步：不确定品种时不要食用；饮片应保留正规包装并让药师核对。`;
  }
  if (/禁忌|副作用|安全|不能吃|哪些人不能|注意什么/.test(normalized)) {
    return `结论：${herbName}不是人人都适合，也不能因为属于传统药材就认为没有风险。

安全提醒：${herb?.safety.join("；") || "使用前需要专业评估"}。

下一步：${hasHighRiskMedication ? "您当前有需要重点关注的处方药，使用前必须让医生或药师核对。" : "同时使用西药、慢病用药或保健品时，应先让医生或药师核对。"} 出现严重不适应立即就医。`;
  }
  if (/多少钱|价格|价钱|哪里买|购买|最便宜/.test(normalized)) {
    return "结论：目前没有可靠的中药材实时价格数据，不能自动判断哪里购买最便宜。\n\n下一步：请到正规医疗机构药房或正规药店核对品种、产地和规格。不要因价格便宜购买来源不明的药材。";
  }
  if (/量|几克|吃多少|喝多少|剂量/.test(normalized)) {
    return `结论：不能仅凭“${herbName}”名称给您推荐自行用量。\n\n原因：中药用量需要结合品种、炮制方法、年龄、体重、肝肾功能、疾病和正在服用的药物。\n\n下一步：请让中医师或药师根据具体情况开具和核对，不要按短视频或网传配方自行加量。`;
  }
  if (/一起吃|同服|相互作用|西药|能不能配/.test(normalized)) {
    return `结论：${hasHighRiskMedication ? "您当前使用了需要重点关注出血或慢病风险的处方药，不能自行把中药叠加进去。" : "当前知识库不足以判断这组中西药组合是否安全。"}\n\n原因：药材成分复杂，保健品、饮片和中成药的规格也可能不同。\n\n下一步：把药材实物、包装和全部西药清单交给医生或药师核对；如出现出血、严重头晕或呼吸困难，立即就医。`;
  }
  return `结论：请先阅读这款药材页面中的传统功用、安全提醒和辨识要点。\n\n下一步：不要用单一症状自行确定体质，也不要把它替代处方药。需要个体化建议时，请让中医师或药师查看实物。`;
}

export function HerbDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const herb = id ? getHerb(id) : undefined;
  const medications = useAppStore((state) => state.medications);
  const profile = useAppStore((state) => state.profile);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [answerProgress, setAnswerProgress] = useState("");
  const hasHighRiskMedication = medications.some(
    (item) =>
      /\u534e\u6cd5\u6797|\u963f\u53f8\u5339\u6797|\u6c2f\u5421\u683c\u96f7|\u80f0\u5c9b\u7d20/.test(
        `${item.name}${item.genericName}`
      )
  );

  if (!herb) {
    return (
      <div className="page">
        <DiscoveryNav />
        <div className="card card-pad">
          <h1 className="page-title">没有找到这份药材资料</h1>
          <button className="btn btn-primary" onClick={() => navigate("/herbs")}>
            返回识中药材
          </button>
        </div>
      </div>
    );
  }

  async function askHerbQuestion() {
    const clean = question.trim();
    if (!clean || asking || !herb) return;
    setAsking(true);
    setAnswer("");
    setAnswerProgress("正在匹配药材性味、功用和安全资料…");
    await new Promise((resolve) => window.setTimeout(resolve, 140));
    const localAnswer = answerHerbQuestion(
      herb.name,
      clean,
      hasHighRiskMedication,
      herb
    );
    setAnswer(localAnswer);
    setAnswerProgress("正在结合当前药物核对中西药同用风险…");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${herb.name}（中药）：${clean}`,
          profile,
          medications,
          riskLevel: hasHighRiskMedication ? "medium" : "unknown",
          groundingText: `药材资料：${herb.name}，${herb.nature}，${herb.flavor}，归${herb.meridians.join("、")}经。传统功用：${herb.functions.join("、")}。安全提醒：${herb.safety.join("；")}。本地安全回答：${localAnswer}`,
          history: []
        })
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (response.ok && payload.message) {
        setAnswer(payload.message);
      }
    } catch {
      // The deterministic answer remains available.
    } finally {
      setAsking(false);
      setAnswerProgress("");
    }
  }

  return (
    <div className="page">
      <DiscoveryNav />
      <button className="btn btn-ghost page-back" type="button" onClick={() => navigate("/herbs")}>
        <ArrowLeft size={19} aria-hidden="true" />
        返回识中药材
      </button>
      <header className="page-header">
        <div>
          <p className="eyebrow">中草药百科 · 整理资料</p>
          <h1 className="page-title">{herb.name}</h1>
          <p className="page-description">
            {herb.nature} · {herb.flavor} · 归{herb.meridians.join("、")}经
          </p>
        </div>
        <span className="herb-mark large">
          <Leaf size={34} aria-hidden="true" />
        </span>
      </header>

      <div className="catalog-detail-grid">
        <div className="catalog-detail-main">
          <section className="card card-pad">
            <h2>传统功用</h2>
            <div className="chip-row">
              {herb.functions.map((item) => (
                <span className="chip risk-low" key={item}>{item}</span>
              ))}
            </div>
            <p className="catalog-answer" style={{ marginTop: 14 }}>
              {herb.traditionalUse}
            </p>
          </section>

          <section className="card card-pad">
            <div className="section-heading">
              <h2>使用安全提醒</h2>
              <ShieldAlert size={23} color="var(--amber)" aria-hidden="true" />
            </div>
            <ul className="knowledge-list warning-list">
              {herb.safety.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="card card-pad">
            <h2>辨识要点</h2>
            <ul className="knowledge-list">
              {herb.identification.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="catalog-detail-side">
          <section className="card card-pad">
            <div className="section-heading">
              <div>
                <h2>问一问</h2>
                <p>不提供自行配伍或剂量建议。</p>
              </div>
              <CircleHelp size={22} color="var(--primary)" aria-hidden="true" />
            </div>
            <textarea
              className="textarea"
              value={question}
              placeholder="例如：能和我的西药一起吃吗？"
              onChange={(event) => {
                setQuestion(event.target.value);
                setAnswer("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void askHerbQuestion();
                }
              }}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={!question.trim() || asking}
              onClick={() => void askHerbQuestion()}
              style={{ width: "100%", marginTop: 10 }}
            >
              {asking ? (
                <LoaderCircle size={19} className="spin" aria-hidden="true" />
              ) : (
                <Send size={19} aria-hidden="true" />
              )}
              {asking ? "正在回答" : "发送问题"}
            </button>
            {asking && answerProgress ? (
              <div className="notice" style={{ marginTop: 10 }} aria-live="polite">
                <LoaderCircle size={19} className="spin" aria-hidden="true" />
                {answerProgress}
              </div>
            ) : null}
            {answer ? (
              <div className="catalog-answer" aria-live="polite">
                {answer}
              </div>
            ) : null}
          </section>

          <section className="card card-pad source-disclaimer">
            <div className="notice">
              <ShieldCheck size={20} aria-hidden="true" />
              中药识别和资料仅供传统知识参考，不用于诊断或自行处方。
            </div>
            <h2 style={{ marginTop: 14 }}>资料来源</h2>
            <p>{herb.sourceTitle}</p>
            <span className="chip risk-medium">待专业审核</span>
          </section>
        </aside>
      </div>
    </div>
  );
}
