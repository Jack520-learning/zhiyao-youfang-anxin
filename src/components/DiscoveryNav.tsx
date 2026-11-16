import {
  BookOpenText,
  ClipboardList,
  Leaf,
  MessageCircleHeart
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const items = [
  { path: "/chat", label: "智能问药", icon: MessageCircleHeart },
  { path: "/catalog", label: "药品百科", icon: BookOpenText },
  { path: "/herbs", label: "识中药材", icon: Leaf },
  { path: "/multi-drug", label: "多药对账", icon: ClipboardList }
];

export function DiscoveryNav() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav className="discovery-nav" aria-label="识药与问药功能">
      {items.map(({ path, label, icon: Icon }) => {
        const active =
          location.pathname === path ||
          location.pathname.startsWith(`${path}/`);
        return (
          <button
            type="button"
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
            key={path}
            onClick={() => navigate(path)}
          >
            <Icon size={19} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
