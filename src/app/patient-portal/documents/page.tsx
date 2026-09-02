"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError, downloadApiFile } from "@/lib/api";

type DocumentItem = { id: string; title: string; document_type: string; created_at: string };

export default function Page() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    void api.get<{ documents: DocumentItem[] }>("/api/v1/hospital/patient-portal/me")
      .then((response) => setItems(response.documents))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load documents."));
  }, []);

  async function download(item: DocumentItem) {
    setError("");
    setDownloading(item.id);
    try {
      await downloadApiFile(`/api/v1/hospital/patient-portal/documents/${item.id}/download`, item.title);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to download this document.");
    } finally {
      setDownloading("");
    }
  }

  return <DashboardShell title="Patient documents" subtitle="Reports, statements, and discharge documents"><PermissionGate permission="patient.portal.access" module="hospital"><main className="mx-auto max-w-[1000px] space-y-6"><h1 className="text-3xl font-bold">Documents</h1>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<section className="space-y-3">{items.length ? items.map((item) => <article key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><FileText size={18}/></span><div><p className="font-bold">{item.title}</p><p className="text-xs capitalize text-slate-500">{item.document_type} · {new Date(item.created_at).toLocaleDateString()}</p></div></div><button disabled={downloading === item.id} onClick={() => void download(item)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-60">{downloading === item.id ? "Preparing…" : <>Download <Download size={14}/></>}</button></article>) : <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No documents available.</p>}</section></main></PermissionGate></DashboardShell>;
}
