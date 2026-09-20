import type { ReactNode } from "react";

interface FeatureLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}

export default function FeatureLayout({ title, description, actions, children }: FeatureLayoutProps) {
  return (
    <div className="feature-page">
      <header className="feature-header feature-header-row">
        <div>
          <h1>{title}</h1>
          <p className="feature-description">{description}</p>
        </div>
        {actions && <div className="feature-header-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
