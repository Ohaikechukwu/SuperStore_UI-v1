"use client";

import FormSelect from "@/components/form-select";
import { FormEvent, useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Patient = { id: string; full_name: string; patient_number: string; email: string | null };

export default function Page() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api.get<Patient[]>("/api/v1/clinical/patients")
      .then(setPatients)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load patients."));
  }, []);

  function selectPatient(id: string) {
    const patient = patients.find((item) => item.id === id);
    setPatientId(id);
    setEmail(patient?.email || "");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const account = await api.post<{ email: string; account_exists: boolean }>("/api/v1/hospital/patient-portal/accounts", {
        patient_id: patientId,
        email,
      });
      setNotice(`${account.account_exists ? "A new activation link was sent to" : "An activation link was sent to"} ${account.email}. The link expires in 48 hours and lets the patient choose their own password.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create portal account.");
    }
  }

  return <DashboardShell title="Patient portal accounts" subtitle="Send patients a verified, one-time portal activation link"><PermissionGate permission="hospital.patients.update" module="hospital"><main className="mx-auto max-w-[1280px] space-y-6"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Patient portal</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Activate a patient login</h1><p className="mt-2 text-sm text-slate-500">Confirm the patient’s email and send a single-use activation link. Staff never see or set the patient’s password.</p></div><p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{patients.length} registered patients available</p></header>{notice && <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}{error && <p className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div><h2 className="text-xl font-bold text-slate-900">Patient and delivery details</h2><p className="mt-1 text-sm text-slate-500">The activation link expires after 48 hours and becomes invalid as soon as another link is issued.</p></div><div className="mt-7 grid gap-5 md:grid-cols-2"><label className="block text-sm font-semibold text-slate-700 md:col-span-2">Patient<FormSelect value={patientId} onChange={(event) => selectPatient(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 p-3"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_number})</option>)}</FormSelect></label><label className="block text-sm font-semibold text-slate-700 md:col-span-2">Verified delivery email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label></div><div className="mt-7 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Confirm this address with the patient before sending the link. The patient chooses their own password after opening it.</p><button disabled={!patientId || !email} className="shrink-0 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Send activation link</button></div></form><aside className="rounded-3xl border border-teal-100 bg-teal-50 p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">What happens next</p><ol className="mt-5 space-y-5 text-sm text-teal-950"><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-bold text-white">1</span><span><strong>Single-use link issued</strong><span className="mt-1 block text-teal-800">The server validates only a hash, and each new link invalidates the prior one.</span></span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-bold text-white">2</span><span><strong>Patient chooses password</strong><span className="mt-1 block text-teal-800">The password is never returned to staff or included in the activation email.</span></span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-bold text-white">3</span><span><strong>Portal access starts</strong><span className="mt-1 block text-teal-800">The email is verified when the link is consumed, then the patient can sign in.</span></span></li></ol></aside></div></main></PermissionGate></DashboardShell>;
}
