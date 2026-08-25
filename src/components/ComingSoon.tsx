import type { ReactNode } from "react";

interface ComingSoonProps {
  title: string;
  description: string;
  sprint: string;
  children?: ReactNode;
}

/**
 * Shared placeholder shown for features whose sprint hasn't been built yet.
 * Keeps every tab navigable and consistent while work is in progress.
 */
export default function ComingSoon({ title, description, sprint, children }: ComingSoonProps) {
  return (
    <div className="feature-page">
      <header className="feature-header">
        <h1>{title}</h1>
        <p className="feature-description">{description}</p>
      </header>

      <div className="panel coming-soon-panel">
        <span className="badge">{sprint} · Coming soon</span>
        <p>
          This feature hasn't been built yet. It's tracked on the project board and will
          be implemented in an upcoming sprint.
        </p>
        {children}
      </div>
    </div>
  );
}
