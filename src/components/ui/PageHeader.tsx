import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14 }}>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
