import type { ReactNode } from "react";

interface StateBlockProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export default function StateBlock({ title, description, action }: StateBlockProps) {
  return (
    <div className="ui-state-block" role="status" aria-live="polite">
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="ui-state-action">{action}</div>}
    </div>
  );
}
