import {
  ArrowLeft,
  ClipboardCheck,
  Download,
  FlaskConical,
  ShieldCheck
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { herbs } from "../catalog/herbs";
import { medicines } from "../catalog/medicines";
import { evaluateSafetyScenarios } from "../evaluation/safetyScenarios";

export function EvaluationPage() {
  const navigate = useNavigate();
  const results = useMemo(() => evaluateSafetyScenarios(), []);
  const passed = results.filter((result) => result.passed).length;
  const passRate = Math.round((passed / results.length) * 100);
  const failed = results.filter((result) => !result.passed);
  const pendingMedicines = medicines.filter(
    (medicine) => medicine.reviewStatus !== "verified"
  );
  const reviewQueue = [
    ...pendingMedicines.slice(0, 12).map((medicine) => ({
      id: medicine.slug,
      type: "药品",
      name: medicine.displayName,
      source: medicine.sourceTitle,
      status: medicine.reviewStatus
    })),
    ...herbs.slice(0, 6).map((herb) => ({
      id: herb.id,
      type: "中药材",
      name: herb.name,
      source: herb.sourceTitle,
      status: herb.reviewStatus
    }))
  ];

  function downloadReviewQueue() {
    const lines = [
      ["类型", "名称", "来源", "当前状态"],
      ...reviewQueue.map((item) => [
        item.type,
        item.name,
        item.source,
        item.status
      ])
    ];
    const csv = lines
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `智药有方-知识复核队列-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page evaluation-page">
      <button
        type="button"
        className="btn btn-ghost page-back"
        onClick={() => navigate("/impact")}
      >
        <ArrowLeft size={19} aria-hidden="true" />
        返回效果与价值
      </button>
      <header className="page-header">
        <div>
          <p className="eyebrow">工程回归 · 安全测试 · 知识复核</p>
          <h1 className="page-title">质量评估与知识复核中心</h1>
          <p className="page-description">
            用固定安全场景持续检查高危求助、相互作用、重复成分、过敏和资料不足处理。
          </p>
        </div>
        <span className="chip">
          <FlaskConical size={15} aria-hidden="true" />
          本地可重复评估
        </span>
      </header>

      <div className="evaluation-summary">
        <section className="card metric">
          <div className="metric-label">场景通过率</div>
          <div className="metric-value">{passRate}%</div>
          <div className="metric-note">
            {passed} / {results.length} 个安全场景
          </div>
        </section>
        <section className="card metric">
          <div className="metric-label">需要修正</div>
          <div
            className="metric-value"
            style={{ color: failed.length ? "var(--red)" : undefined }}
          >
            {failed.length}
          </div>
          <div className="metric-note">风险等级或安全关键词不符</div>
        </section>
        <section className="card metric">
          <div className="metric-label">待复核药品</div>
          <div className="metric-value">{pendingMedicines.length}</div>
          <div className="metric-note">专业审核完成前保持待复核</div>
        </section>
      </div>

      <section className="card card-pad evaluation-scenarios">
        <div className="section-heading">
          <div>
            <h2>安全场景回归结果</h2>
            <p>期望覆盖高危停止线、相互作用、重复成分、过敏和资料不足。</p>
          </div>
          <ShieldCheck size={24} color="var(--primary)" aria-hidden="true" />
        </div>
        <div className="evaluation-table-wrap">
          <table className="evaluation-table">
            <thead>
              <tr>
                <th>类别</th>
                <th>场景</th>
                <th>期望等级</th>
                <th>实际等级</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td>{result.category}</td>
                  <td>
                    <strong>{result.title}</strong>
                    <small>{result.actualTitle}</small>
                  </td>
                  <td>{result.expectedLevels.join(" / ")}</td>
                  <td>{result.actualLevel}</td>
                  <td>
                    <span className={`evaluation-result ${result.passed ? "pass" : "fail"}`}>
                      {result.passed ? "通过" : "需修正"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="notice warm" style={{ marginTop: 14 }}>
          <ShieldCheck size={20} aria-hidden="true" />
          这是工程安全回归，不等同于临床有效性验证；任何药品事实仍需药师逐条复核。
        </div>
      </section>

      <section className="card card-pad evaluation-review">
        <div className="section-heading">
          <div>
            <h2>知识库专业复核队列</h2>
            <p>复核流程：逐条核对批准说明书、记录审核人、更新版本后才能标记已验证。</p>
          </div>
          <button className="btn" type="button" onClick={downloadReviewQueue}>
            <Download size={18} aria-hidden="true" />
            导出复核队列
          </button>
        </div>
        <div className="evaluation-review-grid">
          {reviewQueue.slice(0, 9).map((item) => (
            <article key={`${item.type}-${item.id}`}>
              <span>{item.type}</span>
              <strong>{item.name}</strong>
              <small>{item.source}</small>
              <b>待专业复核</b>
            </article>
          ))}
        </div>
        <p className="field-hint" style={{ marginTop: 12 }}>
          当前中药材记录 {herbs.length} 条；导出文件用于药师或教师线下审核，不会在未授权情况下自动修改资料。
        </p>
      </section>

      <section className="card card-pad evaluation-method">
        <div className="section-heading">
          <div>
            <h2>下一步评估建议</h2>
            <p>让比赛展示从“功能列表”升级为可验证的工程闭环。</p>
          </div>
          <ClipboardCheck size={24} color="var(--primary)" aria-hidden="true" />
        </div>
        <div className="impact-evaluation">
          <div>
            <b>01</b>
            <span>扩充到 100 个安全场景</span>
            <small>覆盖 149 种药品、常见中药和保健品组合。</small>
          </div>
          <div>
            <b>02</b>
            <span>双评审标注</span>
            <small>由至少两名专业人员独立确认预期风险和来源。</small>
          </div>
          <div>
            <b>03</b>
            <span>模型对照实验</span>
            <small>比较纯模型、纯规则和规则约束模型的漏报与越界情况。</small>
          </div>
          <div>
            <b>04</b>
            <span>真实用户任务测试</span>
            <small>观察老人首次查药、识药和服药确认的完成时间与错误率。</small>
          </div>
        </div>
      </section>
    </div>
  );
}
