import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  LayoutDashboard,
  Users,
  CalendarDays,
  ReceiptText,
  Sparkles,
  Settings,
  LogOut,
  Menu,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { clinicToday, displayDate } from '../lib/api';
import { ErrorNotice } from './ui';
export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false),
    [error, setError] = useState<unknown>();
  const location = useLocation();
  const links: [string, string, LucideIcon][] = [
    ['/', 'Overview', LayoutDashboard],
    ['/patients', 'Patients', Users],
    ['/appointments', 'Appointments', CalendarDays],
    ['/billing', 'Billing & receipts', ReceiptText],
  ];
  if (user?.role === 'ADMIN') links.push(['/copilot', 'AI Copilot', Sparkles]);
  links.push([
    '/settings',
    user?.role === 'ADMIN' ? 'Clinic settings' : 'Account settings',
    Settings,
  ]);
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            CareDesk<small>CLINIC WORKSPACE</small>
          </span>
        </NavLink>
        <button
          className="icon-button mobile-close"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="clinic-switch">
          <span className="clinic-avatar">NC</span>
          <div>
            <strong>Nazipur Clinic</strong>
            <small>Single-clinic workspace</small>
          </div>
          <span className="online-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink
              end={to === '/'}
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === 'AI Copilot' && <span className="tiny-tag">AI</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="help-card">
            <span className="eyebrow">LEARN AS YOU BUILD</span>
            <strong>A thoughtful foundation.</strong>
            <p>Trace every feature from the screen to the database.</p>
            <a href="https://react.dev/learn" target="_blank" rel="noreferrer">
              React learning guide <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="user-row">
            <span className="avatar">
              {user?.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role === 'ADMIN' ? 'Administrator' : 'Receptionist'}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => {
                void logout().catch(setError);
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>{' '}
              <strong>{links.find((l) => l[0] === location.pathname)?.[1] || 'Details'}</strong>
            </span>
          </div>
          <div className="topbar-meta">
            <span className="live-label">
              <i /> Clinic online
            </span>
            <span>{displayDate(clinicToday())}</span>
          </div>
        </header>
        <main className="content">
          <ErrorNotice error={error} />
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>CareDesk · Clinic operations</span>
          <span>Dates follow Asia/Dhaka · Amounts in BDT</span>
        </footer>
      </div>
    </div>
  );
}
