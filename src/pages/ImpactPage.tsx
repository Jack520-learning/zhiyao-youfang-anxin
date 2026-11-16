import {
  Activity,
  Building2,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  UsersRound
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DiscoveryNav } from "../components/DiscoveryNav";
import { buildProactiveRiskInsights } from "../lib/proactiveRisk";
import { useAppStore } from "../store/useAppStore";

export function ImpactPage() {
  const navigate = useNavigate();
  const medications = useAppStore((state) => state.medications);
  const doseEvents = useAppStore((state) => state.doseEvents);
  const riskChecks = useAppStore((state) => state.riskChecks);
  const familyAlerts = useAppStore((state) => state.familyAlerts);
  const conversations = useAppStore((state) => state.conversations);
  const activeMedications = medications.filter(
    (medication) => medication.status === "active"
  );
  const takenCount = doseEvents.filter(
    (event) => event.status === "taken"
  ).length;
  const handledAlerts = familyAlerts.filter((alert) => alert.handledAt).length;
  const proactiveInsights = buildProactiveRiskInsights({
    medications,
    doseEvents,
    riskChecks,
    familyAlerts
  });

  const metrics = [
    {
      label: "当前用药",
      value: activeMedications.length,
      note: "种正在管理"
    },
    {
      label: "安全核查",
      value: riskChecks.length,
      note: "次规则交叉核对"
    },
    {
      label: "服药确认",
      value: takenCount,
      note: "次已记录操作"
    },
    {
      label: "主动趋势",
      value: proactiveInsights.length,
      note: "项近期风险分析"
    }
  ];

  return (
    <div className="page impact-page">
      <DiscoveryNav />
      <header className="page-header">
        <div>
          <p className="eyebrow">效果指标 · 社会价值 · 可持续模式</p>
          <h1 className="page-title">让老人少一次看不懂，让家庭少一次危险猜测</h1>
          <p className="page-description">
            以老人独立使用为前提，用多模态识别、确定性安全规则和家属协同降低错误用药与信息断层。
          </p>
        </div>
        <span className="chip">
          <TrendingUp size={15} aria-hidden="true" />
          运行数据
        </span>
      </header>

      <div className="impact-metrics">
        {metrics.map((metric) => (
          <section className="card metric impact-metric" key={metric.label}>
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
            <div className="metric-note">{metric.note}</div>
          </section>
        ))}
      </div>

      <div className="impact-grid">
        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>真实问题与解决方案</h2>
              <p>不是增加一个聊天框，而是重做老人用药的完整链路。</p>
            </div>
            <HeartHandshake size={24} color="var(--primary)" aria-hidden="true" />
          </div>
          <div className="impact-value-list">
            <article>
              <strong>看不懂说明书</strong>
              <p>拍照识别与多药结果拆分，把专业用法转成“什么时候吃、怎么吃”。</p>
            </article>
            <article>
              <strong>不知道药能不能一起用</strong>
              <p>本地规则先核对重复成分、相互作用、过敏史和高危停止线，再让模型解释。</p>
            </article>
            <article>
              <strong>家属无法及时发现风险</strong>
              <p>漏服、主动求助和高风险核查通过实时摘要形成异常通知闭环。</p>
            </article>
            <article>
              <strong>不会操作复杂软件</strong>
              <p>语音优先、大按钮、大字、简化路径和可停止朗读降低学习成本。</p>
            </article>
          </div>
        </section>

        <section className="card card-pad">
          <div className="section-heading">
            <div>
              <h2>效果评估方式</h2>
              <p>只展示可计算指标，不承诺未经临床验证的医疗效果。</p>
            </div>
            <Activity size={24} color="var(--primary)" aria-hidden="true" />
          </div>
          <div className="impact-evaluation">
            <div>
              <b>01</b>
              <span>首次任务完成率</span>
              <small>老人能否独立完成查药、识药和服药确认</small>
            </div>
            <div>
              <b>02</b>
              <span>高风险拦截率</span>
              <small>测试集高危场景是否正确提示医生或药师</small>
            </div>
            <div>
              <b>03</b>
              <span>多药识别完整率</span>
              <small>一张照片中的不同药物是否被逐项列出</small>
            </div>
            <div>
              <b>04</b>
              <span>家属异常处理时长</span>
              <small>从异常通知到家属标记已处理的时间</small>
            </div>
          </div>
          <div className="notice" style={{ marginTop: 16 }}>
            <ShieldCheck size={20} aria-hidden="true" />
            页面中的次数来自当前原型运行数据，不构成医疗有效率或真实世界疗效结论。
          </div>
        </section>
      </div>

      <section className="card card-pad impact-business">
        <div className="section-heading">
          <div>
            <h2>可持续服务模式</h2>
            <p>以家庭安全为核心，避免依赖向老人推销药品。</p>
          </div>
          <Sparkles size={24} color="var(--primary)" aria-hidden="true" />
        </div>
        <div className="impact-business-grid">
          <article>
            <UsersRound size={23} aria-hidden="true" />
            <strong>家庭守护订阅</strong>
            <p>多老人档案、多家属协同、提醒与复诊摘要增值服务。</p>
          </article>
          <article>
            <Building2 size={23} aria-hidden="true" />
            <strong>社区与养老机构</strong>
            <p>面向社区养老、护理站和日间照料中心提供批量授权管理。</p>
          </article>
          <article>
            <Store size={23} aria-hidden="true" />
            <strong>药房安全协同</strong>
            <p>与药师复核流程连接，提供可追溯的用药清单与风险记录。</p>
          </article>
        </div>
        <div className="header-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/chat")}>
            进入智能问药
          </button>
          <button className="btn" type="button" onClick={() => navigate("/evaluation")}>
            打开质量评估
          </button>
          <button className="btn" type="button" onClick={() => navigate("/family")}>
            查看家庭协同
          </button>
        </div>
      </section>

      <section className="card card-pad impact-boundary">
        <h2>价值边界</h2>
        <p>
          产品不诊断疾病、不开处方、不代替老人决定停药或补服，也不从药品销售中获取推荐佣金。真实医疗决策仍由医生、药师和老人家庭共同完成。
        </p>
        <span>
          已分析对话 {conversations.length} 个 · 已处理家庭异常 {handledAlerts} 条
        </span>
      </section>
    </div>
  );
}
