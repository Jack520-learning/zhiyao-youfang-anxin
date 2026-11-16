import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { updateFamilyRiskReview } from "../lib/cloud";
import { useAppStore } from "../store/useAppStore";
import type { RiskCheck } from "../types";

export function FamilyRiskReviewButton({
  riskCheck
}: {
  riskCheck: RiskCheck;
}) {
  const familyCode = useAppStore((state) => state.familyCode);
  const sessionAccountId = useAppStore((state) => state.sessionAccountId);
  const accounts = useAppStore((state) => state.accounts);
  const timeZone = useAppStore((state) => state.profile.timeZone);
  const markRiskReviewed = useAppStore((state) => state.markRiskReviewed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewerName =
    accounts.find((account) => account.id === sessionAccountId)?.displayName ||
    "家属";

  async function confirmReview() {
    setBusy(true);
    setError("");
    try {
      const familyReview = await updateFamilyRiskReview({
        familyCode,
        riskCheckId: riskCheck.id,
        reviewedBy: reviewerName
      });
      markRiskReviewed(riskCheck.id, familyReview);
    } catch {
      setError("核对结果尚未同步，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (riskCheck.familyReview) {
    return (
      <div className="family-review-result" aria-live="polite">
        <CheckCircle2 size={17} aria-hidden="true" />
        <span>
          家属已核对 · {riskCheck.familyReview.reviewedBy} ·{" "}
          {new Date(riskCheck.familyReview.reviewedAt).toLocaleString("zh-CN", {
            timeZone
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="family-review-action">
      <button
        className="btn family-review-button"
        type="button"
        disabled={busy}
        onClick={() => void confirmReview()}
      >
        {busy ? (
          <LoaderCircle
            size={18}
            className="spin"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2 size={18} aria-hidden="true" />
        )}
        {busy ? "正在保存" : "我已核对"}
      </button>
      <small>只记录家属核对结果，不会关闭风险提醒。</small>
      {error ? (
        <span className="family-review-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
