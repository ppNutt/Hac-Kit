import { ShieldIcon } from "./icons";
import { features } from "../features";
import type { FeatureId } from "../features";
import "./Sidebar.css";

interface SidebarProps {
  activeId: FeatureId;
  onSelect: (id: FeatureId) => void;
}

export default function Sidebar({ activeId, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Feature navigation">
      <div className="sidebar-brand">
        <ShieldIcon className="sidebar-brand-icon" />
        <span className="sidebar-brand-text">Hac-Kit</span>
      </div>

      <ul className="sidebar-list">
        {features.map((feature) => {
          const Icon = feature.icon;
          const isActive = feature.id === activeId;
          return (
            <li key={feature.id}>
              <button
                type="button"
                className={`sidebar-item${isActive ? " sidebar-item-active" : ""}`}
                onClick={() => onSelect(feature.id)}
                title={feature.description}
              >
                <Icon className="sidebar-item-icon" />
                <span className="sidebar-item-label">{feature.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        <span>Beginner-friendly pentesting toolkit</span>
      </div>
    </nav>
  );
}
