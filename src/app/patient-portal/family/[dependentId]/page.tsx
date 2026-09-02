"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Overview = {
  dependent: { name: string; patient_number: string; relationship: string; date_of_birth: string | null };
  appointments: Array<{ id: string; scheduled_for: string; status: string; reason: string | null }>;
  prescriptions: Array<{ id: string; status: string; notes: string | null; items: Array<{ product_name: string; dosage: string; frequency: string; duration: string | null; instructions: string | null }> }>;
  laboratory: Array<{ test_name: string; result: string | null; reviewed_at: string | null }>;
  radiology: Array<{ study_name: string; report: string | null; approved_at: string | null }>;
};

export default function DependentCarePage() {
  const params = useParams<{ dependentId: string }>();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.dependentId) return;
    void api.get<Overview>(`/api/v1/hospital/patient-portal/family/${params.dependentId}/overview`)
      .then(setData)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load dependent care."));
  }, [params.dependentId]);

  return <DashboardShell title="Dependent care" subtitle="Read-only information shared through hospital-approved access"><PermissionGate permission="patient.portal.access" module="hospital"><main className="mx-auto max-w-[1100px] space-y-6"><Link href="/patient-portal/family" className="text-sm font-bold text-teal-700">← Family & dependents</Link>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{!data ? !error && <p className="text-sm text-slate-500">Loading dependent care…</p> : <><header><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">{data.dependent.relationship}</p><h1 className="mt-1 text-3xl font-bold">{data.dependent.name}</h1><p className="mt-2 text-sm text-slate-500">{data.dependent.patient_number}{data.dependent.date_of_birth ? ` · Born ${data.dependent.date_of_birth}` : ""}</p><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">This view is limited to upcoming appointments and clinician-released care information. It does not permit changes, payments, messages, or document downloads.</p></header><div className="grid gap-6 lg:grid-cols-2"><Section title="Upcoming appointments" empty="No upcoming appointments.">{data.appointments.map((item) => <article key={item.id} className="rounded-2xl bg-slate-50 p-4"><p className="font-bold">{new Date(item.scheduled_for).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-1 text-sm text-slate-600">{item.reason || "Hospital appointment"} · {item.status.replaceAll("_", " ")}</p></article>)}</Section><Section title="Active prescriptions" empty="No active prescriptions shared.">{data.prescriptions.map((item) => <article key={item.id} className="rounded-2xl bg-slate-50 p-4">{item.notes && <p className="mb-2 text-sm text-slate-600">{item.notes}</p>}{item.items.map((line, index) => <p key={index} className="text-sm text-slate-800">{line.product_name} · {line.dosage}, {line.frequency}{line.duration ? ` for ${line.duration}` : ""}{line.instructions ? ` · ${line.instructions}` : ""}</p>)}</article>)}</Section><Section title="Reviewed laboratory results" empty="No reviewed laboratory results shared.">{data.laboratory.map((item, index) => <article key={`${item.test_name}-${index}`} className="rounded-2xl bg-slate-50 p-4"><p className="font-bold">{item.test_name}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.result}</p></article>)}</Section><Section title="Approved radiology reports" empty="No approved radiology reports shared.">{data.radiology.map((item, index) => <article key={`${item.study_name}-${index}`} className="rounded-2xl bg-slate-50 p-4"><p className="font-bold">{item.study_name}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.report || "Report available"}</p></article>)}</Section></div></>}</main></PermissionGate></DashboardShell>;
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{title}</h2><div className="mt-4 space-y-3">{children.length ? children : <p className="text-sm text-slate-500">{empty}</p>}</div></section>;
}
