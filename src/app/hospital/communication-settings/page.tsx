"use client";

import { FormEvent, useEffect, useState } from "react";

import DashboardShell from "@/components/dashboard-shell";
import FormSelect from "@/components/form-select";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Availability = { sms: { twilio: boolean; termii: boolean }; email: { smtp: boolean; sendgrid: boolean } };
type Templates = { appointment_reminder: string; discharge_reminder: string; patient_portal_activation: string };
type Settings = {
  provider?: string | null;
  sms_provider: "none" | "twilio" | "termii";
  email_provider: "none" | "smtp" | "sendgrid";
  sender_name: string | null;
  sender_email: string | null;
  account_id: string | null;
  templates?: Templates;
  availability?: Availability;
};

const defaults: Templates = {
  appointment_reminder: "Hello {patient_name}, your appointment is booked for {scheduled_for}.",
  discharge_reminder: "Hello {patient_name}, your hospital discharge has been completed. Please review your discharge instructions.",
  patient_portal_activation: "Hello {patient_name}, set up your patient portal using this secure link within 48 hours: {activation_url}",
};
const empty: Settings = { sms_provider: "none", email_provider: "none", sender_name: "", sender_email: "", account_id: "", templates: defaults };

export default function Page() {
  const [value, setValue] = useState<Settings>(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void api.get<Settings>("/api/v1/hospital/communications/provider-settings")
      .then((saved) => setValue({ ...empty, ...saved, templates: { ...defaults, ...saved.templates } }))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : "Unable to load communication settings."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const saved = await api.put<Settings>("/api/v1/hospital/communications/provider-settings", value);
      setValue({ ...empty, ...saved, templates: { ...defaults, ...saved.templates } });
      setNotice("Communication delivery settings saved.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to save communication settings.");
    }
  }

  const availability = value.availability;
  return (
    <DashboardShell title="Communication providers" subtitle="Choose approved SMS and email routes for this workspace">
      <PermissionGate permission="hospital.patients.update" module="hospital">
        <main className="mx-auto max-w-3xl space-y-6">
          <header>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Tenant configuration</p>
            <h1 className="mt-2 text-3xl font-bold">Delivery channels</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Choose providers made available by your platform operator. Provider credentials remain protected in the deployment environment.</p>
          </header>
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
          <form onSubmit={save} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <section className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-bold text-slate-800">SMS provider
                <FormSelect value={value.sms_provider} onChange={(event) => setValue({ ...value, sms_provider: event.target.value as Settings["sms_provider"] })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal">
                  <option value="none">Do not send SMS</option>
                  <option value="twilio" disabled={!availability?.sms.twilio}>Twilio{availability?.sms.twilio ? "" : " — unavailable"}</option>
                  <option value="termii" disabled={!availability?.sms.termii}>Termii{availability?.sms.termii ? "" : " — unavailable"}</option>
                </FormSelect>
              </label>
              <label className="block text-sm font-bold text-slate-800">Email provider
                <FormSelect value={value.email_provider} onChange={(event) => setValue({ ...value, email_provider: event.target.value as Settings["email_provider"] })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal">
                  <option value="none">Do not send email</option>
                  <option value="smtp" disabled={!availability?.email.smtp}>SMTP{availability?.email.smtp ? "" : " — unavailable"}</option>
                  <option value="sendgrid" disabled={!availability?.email.sendgrid}>SendGrid{availability?.email.sendgrid ? "" : " — unavailable"}</option>
                </FormSelect>
              </label>
            </section>
            <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">In-app messages always remain available. Queued external messages retry automatically after a temporary provider failure; permanent failures appear in communication history.</p>
            <section className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-bold text-slate-800">Sender display name
                <input value={value.sender_name || ""} onChange={(event) => setValue({ ...value, sender_name: event.target.value })} maxLength={120} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal" placeholder="Your care team" />
              </label>
              <label className="block text-sm font-bold text-slate-800">Reply-to email
                <input type="email" autoComplete="email" value={value.sender_email || ""} onChange={(event) => setValue({ ...value, sender_email: event.target.value })} maxLength={200} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal" placeholder="support@example.com" />
              </label>
            </section>
            <label className="block text-sm font-bold text-slate-800">Internal account / workspace label
              <input value={value.account_id || ""} onChange={(event) => setValue({ ...value, account_id: event.target.value })} maxLength={200} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal" placeholder="Optional reference for your team" />
            </label>
            <section className="space-y-4 border-t border-slate-100 pt-6">
              <div><h2 className="text-base font-bold text-slate-900">Message templates</h2><p className="mt-1 text-sm text-slate-600">Use only the listed placeholders. These messages are routine notifications, not a channel for urgent care.</p></div>
              <label className="block text-sm font-bold text-slate-800">Appointment reminder <span className="font-normal text-slate-500">· {'{patient_name}'}, {'{scheduled_for}'}</span>
                <textarea value={value.templates?.appointment_reminder || ""} onChange={(event) => setValue({ ...value, templates: { ...defaults, ...value.templates, appointment_reminder: event.target.value } })} minLength={2} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal" />
              </label>
              <label className="block text-sm font-bold text-slate-800">Discharge reminder <span className="font-normal text-slate-500">· {'{patient_name}'}</span>
                <textarea value={value.templates?.discharge_reminder || ""} onChange={(event) => setValue({ ...value, templates: { ...defaults, ...value.templates, discharge_reminder: event.target.value } })} minLength={2} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal" />
              </label>
              <label className="block text-sm font-bold text-slate-800">Patient portal activation <span className="font-normal text-slate-500">· {'{patient_name}'}, {'{activation_url}'}</span>
                <textarea value={value.templates?.patient_portal_activation || ""} onChange={(event) => setValue({ ...value, templates: { ...defaults, ...value.templates, patient_portal_activation: event.target.value } })} minLength={2} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-normal" />
              </label>
            </section>
            <button className="w-full rounded-xl bg-teal-600 p-3 text-sm font-bold text-white">Save delivery settings</button>
          </form>
        </main>
      </PermissionGate>
    </DashboardShell>
  );
}
