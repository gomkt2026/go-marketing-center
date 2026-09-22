import { Link } from 'react-router-dom';

export function HubShortcuts({ items }: { items: { to: string; label: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="hub-shortcuts">
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="hub-shortcut-link">
          {item.label}
        </Link>
      ))}
    </div>
  );
}
