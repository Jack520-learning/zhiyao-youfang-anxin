import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <div className="card card-pad">
        <p className="eyebrow">页面没有找到</p>
        <h1 className="page-title">我们回到今天该做的事</h1>
        <p className="page-description">这个地址不存在，您的用药档案没有受到影响。</p>
        <button className="btn btn-primary" type="button" style={{ marginTop: 18 }} onClick={() => navigate("/")}>
          <ArrowLeft size={18} aria-hidden="true" />
          返回首页
        </button>
      </div>
    </div>
  );
}
