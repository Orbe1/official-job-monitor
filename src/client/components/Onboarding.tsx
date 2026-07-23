import { ArrowLeft, ArrowRight, Bell, Check, MapPin, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NotificationFrequency, OpportunityFocus, TechnicalCategory, UserPreferences } from "../../shared/domain";
import { useData } from "../DataContext";
import { Button, CompanyLogo } from "./ui";

const interests: Array<{ value: TechnicalCategory; label: string }> = [
  { value: "software", label: "Software engineering" },
  { value: "machine_learning", label: "AI / ML" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "networking", label: "Networking" },
  { value: "support", label: "Support / infrastructure" },
  { value: "quant", label: "Quant" },
  { value: "security", label: "Security" },
  { value: "data_science", label: "Data science" },
  { value: "data", label: "Data engineering" },
  { value: "product_management", label: "Product management" },
];

const locations = ["San Francisco", "New York", "Seattle", "Chicago", "Boston", "Austin"];
const steps = ["Role type", "Interests", "Location", "Companies", "Alerts"];

export function Onboarding() {
  const { data, finishOnboarding } = useData();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<OpportunityFocus>(data?.preferences.opportunityFocus ?? "both");
  const [selectedInterests, setSelectedInterests] = useState<TechnicalCategory[]>(data?.preferences.technicalInterests ?? []);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(data?.preferences.preferredLocations ?? []);
  const [remotePreferred, setRemotePreferred] = useState(data?.preferences.remotePreferred ?? false);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<NotificationFrequency>(data?.preferences.defaultNotificationFrequency ?? "immediate");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const companies = useMemo(() => (data?.companies ?? [])
    .filter((company) => company.monitoringMode === "continuous")
    .sort((a, b) => a.priorityTier - b.priorityTier || a.name.localeCompare(b.name))
    .slice(0, 12), [data?.companies]);

  const open = Boolean(data && !data.preferences.onboardingCompleted);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!data || !open) return null;

  const toggle = <T,>(items: T[], value: T) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
  const preferences: UserPreferences = {
    onboardingCompleted: true,
    opportunityFocus: focus,
    technicalInterests: selectedInterests,
    preferredLocations: selectedLocations,
    remotePreferred,
    defaultNotificationFrequency: frequency,
    lastVisitAt: data.preferences.lastVisitAt,
  };

  const complete = async (useDefaults = false) => {
    setSaving(true);
    try {
      await finishOnboarding(useDefaults ? { ...preferences, opportunityFocus: "both", technicalInterests: [], preferredLocations: [], remotePreferred: false } : preferences, useDefaults ? [] : selectedCompanies);
    } catch {
      // The shared mutation notice explains the failure and keeps setup open for retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-backdrop">
      <section ref={dialogRef} className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <header className="onboarding__header">
          <span className="onboarding__brand"><Target /> InternJobs</span>
          <div className="onboarding__progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((label, index) => <span key={label} className={index <= step ? "is-active" : ""}><i />{label}</span>)}
          </div>
        </header>

        <div className="onboarding__body">
          {step === 0 && (
            <div className="onboarding-step">
              <Sparkles aria-hidden="true" /><h2 id="onboarding-title">What are you looking for?</h2><p>We’ll put the most relevant roles first.</p>
              <div className="onboarding-options onboarding-options--three">
                {(["internship", "new_grad", "both"] as OpportunityFocus[]).map((value) => (
                  <button key={value} className={focus === value ? "is-selected" : ""} onClick={() => setFocus(value)}>
                    {focus === value && <Check />}{value === "internship" ? "Internships" : value === "new_grad" ? "New grad" : "Both"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-step">
              <Sparkles aria-hidden="true" /><h2 id="onboarding-title">What do you want to build?</h2><p>Choose any areas you’d be excited to work in.</p>
              <div className="onboarding-options onboarding-options--interests">
                {interests.map(({ value, label }) => <button key={value} className={selectedInterests.includes(value) ? "is-selected" : ""} onClick={() => setSelectedInterests(toggle(selectedInterests, value))}>{selectedInterests.includes(value) && <Check />}{label}</button>)}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-step">
              <MapPin aria-hidden="true" /><h2 id="onboarding-title">Where would you work?</h2><p>Pick a few hubs, or tell us remote matters.</p>
              <div className="onboarding-options onboarding-options--locations">
                {locations.map((location) => <button key={location} className={selectedLocations.includes(location) ? "is-selected" : ""} onClick={() => setSelectedLocations(toggle(selectedLocations, location))}>{selectedLocations.includes(location) && <Check />}{location}</button>)}
                <button className={remotePreferred ? "is-selected" : ""} onClick={() => setRemotePreferred((current) => !current)}>{remotePreferred && <Check />}Remote-friendly</button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="onboarding-step onboarding-step--companies">
              <Target aria-hidden="true" /><h2 id="onboarding-title">Follow a few companies</h2><p>You’ll see their roles sooner and can change this anytime.</p>
              <div className="onboarding-companies">
                {companies.map((company) => <button key={company.id} className={selectedCompanies.includes(company.id) ? "is-selected" : ""} onClick={() => setSelectedCompanies(toggle(selectedCompanies, company.id))}><CompanyLogo src={company.logoUrl} name={company.name} initials={company.initials} size="md" /><span>{company.name}</span>{selectedCompanies.includes(company.id) && <Check />}</button>)}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="onboarding-step">
              <Bell aria-hidden="true" /><h2 id="onboarding-title">How should we notify you?</h2><p>This becomes the default for companies you follow.</p>
              <div className="onboarding-options onboarding-options--frequency">
                {(["immediate", "daily", "off"] as NotificationFrequency[]).map((value) => <button key={value} className={frequency === value ? "is-selected" : ""} onClick={() => setFrequency(value)}>{frequency === value && <Check />}<strong>{value === "immediate" ? "Immediate" : value === "daily" ? "Daily digest" : "Off"}</strong><span>{value === "immediate" ? "Hear about new roles as they’re detected." : value === "daily" ? "One concise roundup each day." : "Follow without notifications."}</span></button>)}
              </div>
            </div>
          )}
        </div>

        <footer className="onboarding__footer">
          <button className="text-action" disabled={saving} onClick={() => void complete(true)}>Skip setup</button>
          <div>
            {step > 0 && <Button variant="quiet" onClick={() => setStep((current) => current - 1)}><ArrowLeft /> Back</Button>}
            {step < steps.length - 1
              ? <Button onClick={() => setStep((current) => current + 1)}>Continue <ArrowRight /></Button>
              : <Button loading={saving} onClick={() => void complete()}>Show my roles <ArrowRight /></Button>}
          </div>
        </footer>
      </section>
    </div>
  );
}
