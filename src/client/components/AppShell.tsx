import {
  Bell,
  Bookmark,
  CheckCheck,
  ChevronDown,
  Folder,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import type { Notification } from "../../shared/domain";
import { useData } from "../DataContext";
import { relativeTime } from "../format";
import { Button, CompanyLogo, IconButton } from "./ui";

const navigation = [
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/watch", label: "Following", icon: Bookmark },
  { to: "/tracker", label: "My Roles", icon: Folder },
] as const;

const pageNames: Array<[RegExp, string]> = [
  [/^\/discover/, "Discover"],
  [/^\/watch/, "Following"],
  [/^\/tracker/, "My Roles"],
  [/^\/companies\//, "Company details"],
  [/^\/admin/, "Developer tools"],
  [/^\/settings/, "Settings"],
];

function NotificationItem({ notification, onRead, onOpen }: {
  notification: Notification;
  onRead: () => void;
  onOpen: () => void;
}) {
  return (
    <article className={clsx("notification-item", !notification.readAt && "notification-item--unread")}>
      <button className="notification-item__body" onClick={onOpen}>
        <span className="notification-item__icon" aria-hidden="true"><Zap /></span>
        <span>
          <strong>{notification.title}</strong>
          <span>{notification.body.replace(/Matched alert:.*$/i, "").trim()}</span>
          <small>{relativeTime(notification.createdAt)}</small>
        </span>
      </button>
      {!notification.readAt && <IconButton label="Mark notification read" onClick={onRead}><CheckCheck /></IconButton>}
    </article>
  );
}

function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { data, markNotificationRead, markAllNotificationsRead } = useData();
  const panelRef = useRef<HTMLDivElement>(null);
  const notifications = (data?.notifications ?? []).filter((item) => item.type !== "source_health");
  const unread = notifications.filter((item) => !item.readAt).length;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onMouseDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <aside className="notification-center" ref={panelRef} aria-label="Notifications">
      <header>
        <div><h2>Notifications</h2><p>{unread ? `${unread} new` : "You’re caught up"}</p></div>
        <IconButton label="Close notifications" onClick={onClose}><X /></IconButton>
      </header>
      {unread > 0 && (
        <button className="text-action notification-center__read-all" onClick={() => void markAllNotificationsRead().catch(() => undefined)}>
          <CheckCheck /> Mark all read
        </button>
      )}
      <div className="notification-center__list">
        {notifications.length ? notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onRead={() => void markNotificationRead(notification.id).catch(() => undefined)}
            onOpen={() => {
              if (!notification.readAt) void markNotificationRead(notification.id).catch(() => undefined);
              if (notification.jobId) navigate(`/discover?job=${notification.jobId}`);
              else if (notification.companyId) navigate(`/watch?company=${notification.companyId}`);
              onClose();
            }}
          />
        )) : (
          <div className="notification-center__empty"><Bell /><strong>No new roles yet</strong><span>Updates from companies you follow will appear here.</span></div>
        )}
      </div>
    </aside>
  );
}

function ProfileMenu({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: "sidebar" | "topbar" }) {
  const { data } = useData();
  const ref = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const developmentAccount = data?.viewer.mode === "development";
  const displayName = developmentAccount ? "Student account" : data?.viewer.name;
  const displayDetail = developmentAccount ? "Preferences and alerts" : data?.viewer.email;
  const environmentLabel = data?.dataMode === "live_database"
    ? "Live official sources · local database"
    : data?.dataMode === "empty_database"
      ? "Empty local database · email stays local"
      : "Local fixtures · email stays local";
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstItemRef.current?.focus();
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className={clsx("profile-menu", `profile-menu--${anchor}`)} ref={ref} aria-label="Account menu">
      <div className="profile-menu__identity">
        <strong>{displayName}</strong>
        <span>{displayDetail}</span>
        {developmentAccount && <small className="profile-menu__environment">{environmentLabel}</small>}
      </div>
      <NavLink ref={firstItemRef} to="/settings" onClick={onClose}><Settings /> Settings</NavLink>
      {data?.viewer.isAdmin && <NavLink to="/admin/sources" onClick={onClose}><ShieldCheck /> Developer tools</NavLink>}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data, refreshing, refresh, mutationError, clearMutationError } = useData();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<"sidebar" | "topbar">("sidebar");
  const studentNotifications = data?.notifications.filter((notification) => notification.type !== "source_health") ?? [];
  const unread = studentNotifications.filter((notification) => !notification.readAt).length;
  const pageName = pageNames.find(([matcher]) => matcher.test(location.pathname))?.[1] ?? "InternJobs";
  const accountName = data?.viewer.mode === "development" ? "Student account" : data?.viewer.name ?? "Account";
  const accountDetail = data?.viewer.mode === "development" ? "Your workspace" : data?.viewer.email;
  const primaryPage = /^\/(discover|watch|tracker)(?:\/|$)/.test(location.pathname);
  const latestSuccessfulCheck = data?.sources.reduce<string | null>((latest, source) => {
    if (!source.lastSuccessAt) return latest;
    return !latest || source.lastSuccessAt > latest ? source.lastSuccessAt : latest;
  }, null) ?? null;
  const dataStatus = data?.dataMode === "live_database"
    ? {
        label: "Live official sources",
        detail: latestSuccessfulCheck ? `Checked ${relativeTime(latestSuccessfulCheck)}` : "Waiting for first check",
        tone: "live",
      }
    : data?.dataMode === "empty_database"
      ? { label: "Live workspace", detail: "No sources configured", tone: "empty" }
      : { label: "Sample workspace", detail: "Development fixtures", tone: "sample" };

  return (
    <div className="app-shell app-shell--student">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar sidebar--student">
        <button className="brand" onClick={() => navigate("/discover")} aria-label="InternJobs home">
          <span className="brand__mark" aria-hidden="true"><Sparkles /></span>
          <span className="brand__type"><strong>InternJobs</strong><small>Catch roles early</small></span>
        </button>
        <nav className="sidebar__nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} aria-label={item.label} className={({ isActive }) => clsx("sidebar-link", isActive && "sidebar-link--active")} to={item.to}>
                <Icon aria-hidden="true" /><span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar__account-area">
          <button
            className="sidebar-account"
            aria-label="Open account menu"
            aria-haspopup="true"
            aria-expanded={profileOpen && profileAnchor === "sidebar"}
            onClick={() => {
              setNotificationsOpen(false);
              setProfileAnchor("sidebar");
              setProfileOpen((current) => profileAnchor === "sidebar" ? !current : true);
            }}
          >
            <CompanyLogo src={null} name={accountName} initials={data?.viewer.initials} size="sm" />
            <span><strong>{accountName}</strong><small>{accountDetail}</small></span>
            <Settings aria-hidden="true" />
          </button>
        </div>
      </aside>

      <ProfileMenu open={profileOpen} anchor={profileAnchor} onClose={() => setProfileOpen(false)} />

      <div className="app-column">
        <header className={clsx("topbar", "topbar--student", primaryPage && "topbar--primary")}>
          <h1 className={primaryPage ? "sr-only" : undefined}>{pageName}</h1>
          {dataStatus && (
            <div className={clsx("topbar-data-status", `topbar-data-status--${dataStatus.tone}`)} aria-label={`${dataStatus.label}. ${dataStatus.detail}.`}>
              <span className="topbar-data-status__dot" aria-hidden="true" />
              <span><strong>{dataStatus.label}</strong><small>{dataStatus.detail}</small></span>
            </div>
          )}
          <div className="topbar__actions">
            <IconButton label="Refresh opportunities" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={clsx(refreshing && "spin")} />
            </IconButton>
            <div className="notification-trigger">
              <IconButton
                label={unread ? `Open notifications, ${unread} unread` : "Open notifications"}
                aria-expanded={notificationsOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setProfileOpen(false);
                  setNotificationsOpen((current) => !current);
                }}
              ><Bell /></IconButton>
              {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
            </div>
            <button className="profile-trigger profile-trigger--topbar" aria-label="Open account menu" aria-haspopup="true" aria-expanded={profileOpen && profileAnchor === "topbar"} onClick={() => {
              setNotificationsOpen(false);
              setProfileAnchor("topbar");
              setProfileOpen((current) => profileAnchor === "topbar" ? !current : true);
            }}>
              <CompanyLogo src={null} name={accountName} initials={data?.viewer.initials} size="sm" />
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
          <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        </header>

        <main id="main-content" className={clsx("app-main", "app-main--student", primaryPage && "app-main--primary")} tabIndex={-1}>{children}</main>
      </div>

      {mutationError && (
        <div className="toast" role="alert">
          <span><strong>Change wasn’t saved</strong>{mutationError}</span>
          <Button size="sm" variant="quiet" onClick={clearMutationError}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}
