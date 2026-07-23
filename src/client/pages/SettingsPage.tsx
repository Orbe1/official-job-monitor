import { Bell, Check, Heart, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { NotificationFrequency, OpportunityFocus, TechnicalCategory } from "../../shared/domain";
import { CATEGORY_LABELS } from "../../shared/constants";
import { useData } from "../DataContext";
import { Button, CompanyLogo } from "../components/ui";

const interestOptions: TechnicalCategory[] = ["software", "machine_learning", "infrastructure", "networking", "support", "quant", "security", "data_science", "data", "product_management"];

export function SettingsPage() {
  const { data, updatePreferences } = useData();
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<OpportunityFocus>(data?.preferences.opportunityFocus ?? "both");
  const [interests, setInterests] = useState<TechnicalCategory[]>(data?.preferences.technicalInterests ?? []);
  const [remote, setRemote] = useState(data?.preferences.remotePreferred ?? false);
  const [frequency, setFrequency] = useState<NotificationFrequency>(data?.preferences.defaultNotificationFrequency ?? "immediate");
  if (!data) return null;
  const developmentAccount = data.viewer.mode === "development";
  const displayName = developmentAccount ? "Student account" : data.viewer.name;
  const displayDetail = developmentAccount ? "Your preferences and alerts" : data.viewer.email;

  const save = async () => {
    setSaving(true);
    try {
      await updatePreferences({ opportunityFocus: focus, technicalInterests: interests, remotePreferred: remote, defaultNotificationFrequency: frequency });
    } catch {
      // The shared mutation notice describes the failed save.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-student">
      <section className="settings-profile">
        <CompanyLogo src={null} name={displayName} initials={data.viewer.initials} size="xl" />
        <div><h2>{displayName}</h2><p>{displayDetail}</p></div>
      </section>

      <div className="settings-student__grid">
        <section className="settings-card">
          <header><SlidersHorizontal /><div><h3>What you’re looking for</h3><p>Used to put better matches first in Discover.</p></div></header>
          <fieldset><legend>Role type</legend><div className="segmented">{(["internship", "new_grad", "both"] as OpportunityFocus[]).map((value) => <button type="button" key={value} className={focus === value ? "is-active" : ""} onClick={() => setFocus(value)}>{value === "internship" ? "Internship" : value === "new_grad" ? "New grad" : "Both"}</button>)}</div></fieldset>
          <fieldset><legend>Technical interests</legend><div className="settings-interest-grid">{interestOptions.map((interest) => <button type="button" key={interest} className={interests.includes(interest) ? "is-selected" : ""} onClick={() => setInterests((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest])}>{interests.includes(interest) && <Check />}{CATEGORY_LABELS[interest]}</button>)}</div></fieldset>
          <label className="settings-check"><input type="checkbox" checked={remote} onChange={(event) => setRemote(event.target.checked)} /><span><strong>Prefer remote-friendly roles</strong><small>Remote roles will rank higher, not hide everything else.</small></span></label>
        </section>

        <section className="settings-card">
          <header><Bell /><div><h3>Default company alerts</h3><p>Applied when you follow a new company.</p></div></header>
          <div className="settings-frequency">{(["immediate", "daily", "off"] as NotificationFrequency[]).map((value) => <button key={value} className={frequency === value ? "is-selected" : ""} onClick={() => setFrequency(value)}><strong>{value === "immediate" ? "Immediate" : value === "daily" ? "Daily digest" : "Off"}</strong><span>{value === "immediate" ? "As roles are detected" : value === "daily" ? "One daily roundup" : "No notifications"}</span></button>)}</div>
          <Link className="settings-link" to="/watch"><Heart /> Manage followed companies</Link>
        </section>
      </div>

      <div className="settings-actions"><Button loading={saving} onClick={() => void save()}>Save preferences</Button>{data.viewer.isAdmin && <Link className="button button--quiet button--md" to="/admin/sources"><ShieldCheck /> Developer tools</Link>}</div>

      <section className="settings-trust"><UserRound /><p>Your saves, follows, application notes, and alert preferences are private to your account.</p></section>
    </div>
  );
}
