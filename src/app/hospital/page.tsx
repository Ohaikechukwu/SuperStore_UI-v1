"use client";
import { FormEvent, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { BedDouble, ClipboardList, FileText, FlaskConical, HeartPulse, LogOut, Plus, Search, Stethoscope, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import AppSelect from "@/components/app-select";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
type Branch = {
    id: string;
    name: string;
    code: string;
    active: boolean;
};
type Patient = {
    id: string;
    patient_number: string;
    full_name: string;
    phone: string | null;
};
type Ward = {
    id: string;
    branch_id: string;
    name: string;
    ward_type: string;
};
type Bed = {
    id: string;
    ward_id: string;
    bed_number: string;
    status: string;
};
type Provider = {
    id: string;
    name: string;
    job_title: string | null;
};
type Admission = {
    id: string;
    patient_id: string;
    patient_name: string;
    bed_number: string;
    status: string;
    reason: string | null;
};
type Encounter = {
    id: string;
    patient_id: string;
    patient_name: string;
    encounter_type: string;
    status: string;
    diagnosis: string | null;
    notes: string | null;
};
type Lab = {
    id: string;
    patient_id: string;
    patient_name: string;
    test_name: string;
    priority: string;
    status: string;
    result: string | null;
    charge_amount: string;
    invoice_id: string | null;
};
type TestCatalog = {
    id: string;
    code: string;
    name: string;
    specimen_type: string | null;
    standard_price: string;
    turnaround_hours: number | null;
};
type Radiology = {
    id: string;
    patient_id: string;
    patient_name: string;
    study_name: string;
    priority: string;
    status: string;
    report: string | null;
    charge_amount: string;
    invoice_id: string | null;
};
type Invoice = {
    id: string;
    patient_id: string;
    description: string;
    amount: string;
    paid_amount: string;
    status: string;
};
type PatientRecord = {
    patient: {
        full_name: string;
        patient_number: string;
        date_of_birth: string | null;
        sex: string | null;
        phone: string | null;
        email: string | null;
    };
    encounters: Array<{
        id: string;
        status: string;
        diagnosis: string | null;
    }>;
    admissions: Array<{
        id: string;
        bed_id: string;
        status: string;
    }>;
    prescriptions: Array<{
        id: string;
        status: string;
    }>;
    laboratory: Array<{
        id: string;
        test_name: string;
        status: string;
        result: string | null;
    }>;
    radiology: Array<{
        id: string;
        study_name: string;
        status: string;
        report: string | null;
    }>;
    nursing: Array<{
        id: string;
        note_type: string;
        content: string;
    }>;
};
type Tab = "patients" | "admissions" | "care" | "diagnostics" | "billing" | "setup";
type Modal = "patient" | "admission" | "encounter" | "nursing" | "ward" | "bed" | "lab" | "radiology" | "invoice" | null;
type HospitalWorkspace = {
    patients: Patient[];
    branches: Branch[];
    wards: Ward[];
    beds: Bed[];
    admissions: Admission[];
    encounters: Encounter[];
    labs: Lab[];
    radiology: Radiology[];
    invoices: Invoice[];
};
const emptyWorkspace: HospitalWorkspace = { patients: [], branches: [], wards: [], beds: [], admissions: [], encounters: [], labs: [], radiology: [], invoices: [] };
const maxVisibleRows = 100;
const inputClass = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const branchName = (branches: Branch[], id: string) => branches.find((branch) => branch.id === id)?.name || "Unknown branch";
export default function Page() {
    const [tab, setTab] = useState<Tab>("patients");
    const [workspace, setWorkspace] = useState<HospitalWorkspace>(emptyWorkspace);
    const { patients, branches, wards, beds, admissions, encounters, labs, radiology, invoices } = workspace;
    const [query, setQuery] = useState("");
    const [modal, setModalState] = useState<Modal>(null);
    const [, startTransition] = useTransition();
    const setModal = (next: Modal) => startTransition(() => setModalState(next));
    const [selectedPatient, setSelectedPatient] = useState("");
    const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
    const [selectedRadiology, setSelectedRadiology] = useState<Radiology | null>(null);
    const [recordPatient, setRecordPatient] = useState<Patient | null>(null);
    const [record, setRecord] = useState<PatientRecord | null>(null);
    const [recordPurpose, setRecordPurpose] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    async function load() {
        setBusy(true);
        setError("");
        const results = await Promise.allSettled([
            api.get<Patient[]>("/api/v1/clinical/patients"), api.get<Branch[]>("/api/v1/catalog/branches"), api.get<Ward[]>("/api/v1/hospital/wards"), api.get<Bed[]>("/api/v1/hospital/beds"), api.get<Admission[]>("/api/v1/hospital/admissions"), api.get<Encounter[]>("/api/v1/hospital/encounters"), api.get<Lab[]>("/api/v1/hospital/lab/orders"), api.get<Radiology[]>("/api/v1/hospital/radiology/orders"), api.get<Invoice[]>("/api/v1/hospital/billing/invoices"),
        ]);
        const failed = results.find((result) => result.status === "rejected");
        startTransition(() => {
            setWorkspace((current) => ({
                patients: results[0].status === "fulfilled" ? results[0].value : current.patients,
                branches: results[1].status === "fulfilled" ? results[1].value : current.branches,
                wards: results[2].status === "fulfilled" ? results[2].value : current.wards,
                beds: results[3].status === "fulfilled" ? results[3].value : current.beds,
                admissions: results[4].status === "fulfilled" ? results[4].value : current.admissions,
                encounters: results[5].status === "fulfilled" ? results[5].value : current.encounters,
                labs: results[6].status === "fulfilled" ? results[6].value : current.labs,
                radiology: results[7].status === "fulfilled" ? results[7].value : current.radiology,
                invoices: results[8].status === "fulfilled" ? results[8].value : current.invoices,
            }));
            if (failed?.status === "rejected" && failed.reason instanceof ApiError && failed.reason.status >= 500)
                setError(failed.reason.message);
            setBusy(false);
        });
    }
    useEffect(() => {
        const timer = window.setTimeout(() => { void load(); }, 0);
        return () => window.clearTimeout(timer);
    }, []);
    const deferredQuery = useDeferredValue(query);
    const matchingPatients = useMemo(() => patients.filter((patient) => `${patient.full_name} ${patient.patient_number} ${patient.phone || ""}`.toLowerCase().includes(deferredQuery.toLowerCase())), [deferredQuery, patients]);
    const visiblePatients = matchingPatients.slice(0, 100);
    const visibleAdmissions = useMemo(() => admissions.slice(0, maxVisibleRows), [admissions]);
    const visibleBeds = useMemo(() => beds.slice(0, maxVisibleRows), [beds]);
    const visibleEncounters = useMemo(() => encounters.slice(0, maxVisibleRows), [encounters]);
    const visibleInvoices = useMemo(() => invoices.slice(0, maxVisibleRows), [invoices]);
    const visibleLabs = useMemo(() => labs.slice(0, maxVisibleRows), [labs]);
    const visibleRadiology = useMemo(() => radiology.slice(0, maxVisibleRows), [radiology]);
    const visibleWards = useMemo(() => wards.slice(0, maxVisibleRows), [wards]);
    const availableBeds = useMemo(() => beds.filter((bed) => bed.status === "available"), [beds]);
    const activeAdmissions = useMemo(() => admissions.filter((admission) => admission.status === "admitted"), [admissions]);
    const patientNames = useMemo(() => new Map(patients.map((patient) => [patient.id, patient.full_name])), [patients]);
    const bedsByWard = useMemo(() => beds.reduce((grouped, bed) => {
        const wardBeds = grouped.get(bed.ward_id) || [];
        wardBeds.push(bed);
        grouped.set(bed.ward_id, wardBeds);
        return grouped;
    }, new Map<string, Bed[]>()), [beds]);
    const patientName = (id: string) => patientNames.get(id) || "Unknown patient";
    const outstandingInvoiceCount = useMemo(() => invoices.filter((item) => item.status !== "paid").length, [invoices]);
    const openEncounters = useMemo(() => selectedPatient ? encounters.filter((item) => item.patient_id === selectedPatient && item.status === "open") : encounters.filter((item) => item.status === "open"), [encounters, selectedPatient]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isSubmitting) return;
        const form = new FormData(event.currentTarget);
        const value = (name: string) => String(form.get(name) || "");
        let path = "";
        let payload: Record<string, unknown> = {};
        if (modal === "patient") {
            path = "/api/v1/clinical/patients";
            payload = { branch_id: value("branch_id"), full_name: value("full_name"), date_of_birth: value("date_of_birth"), sex: value("sex"), phone: value("phone"), email: value("email") || null, address: value("address"), national_id: value("national_id") || null, referral_source: value("referral_source") || "walk_in", blood_group: value("blood_group") || null, marital_status: value("marital_status") || null, emergency_contact_name: value("emergency_contact_name") || null, emergency_contact_relationship: value("emergency_contact_relationship") || null, emergency_contact_phone: value("emergency_contact_phone") || null, payment_type: value("payment_type") || null, occupation: value("occupation") || null, religion: value("religion") || null, preferred_language: value("preferred_language") || null, photo_url: value("photo_url") || null };
        }
        if (modal === "admission") {
            path = "/api/v1/hospital/admissions";
            payload = {
                patient_id: value("patient_id"),
                admitting_clinician_id: value("admitting_clinician_id"),
                ward_id: value("ward_id"), bed_id: value("bed_id"),
                admission_type: value("admission_type"),
                provisional_diagnosis: value("provisional_diagnosis"), reason: value("reason"),
                payment_type: value("payment_type"), admitted_at: value("admitted_at") ? new Date(value("admitted_at")).toISOString() : null,
                referring_doctor: value("referring_doctor") || null,
                expected_length_of_stay_days: value("expected_length_of_stay_days") ? Number(value("expected_length_of_stay_days")) : null,
                attendant_name: value("attendant_name") || null,
                attendant_phone: value("attendant_phone") || null,
                attendant_relationship: value("attendant_relationship") || null,
            };
        }
        if (modal === "encounter") {
            path = "/api/v1/clinical/encounters";
            payload = { patient_id: value("patient_id"), branch_id: value("branch_id"), encounter_type: value("encounter_type"), diagnosis: value("diagnosis") || null, notes: value("notes") || null };
        }
        if (modal === "nursing") {
            path = "/api/v1/hospital/nursing-notes";
            payload = { patient_id: value("patient_id"), admission_id: value("admission_id"), note_type: value("note_type"), content: value("content") };
        }
        if (modal === "ward") {
            path = "/api/v1/hospital/wards";
            payload = { branch_id: value("branch_id"), name: value("name"), ward_type: value("ward_type") };
        }
        if (modal === "bed") {
            path = "/api/v1/hospital/beds";
            payload = { ward_id: value("ward_id"), bed_number: value("bed_number") };
        }
        if (modal === "lab") {
            path = "/api/v1/hospital/lab/orders";
            payload = { patient_id: value("patient_id"), encounter_id: value("encounter_id"), test_catalog_ids: form.getAll("test_catalog_ids").map(String).filter(Boolean), provisional_diagnosis: value("provisional_diagnosis") || null, priority: value("priority") };
        }
        if (modal === "radiology") {
            path = "/api/v1/hospital/radiology/orders";
            payload = { patient_id: value("patient_id"), encounter_id: value("encounter_id"), study_name: value("study_name"), charge_amount: value("charge_amount"), priority: value("priority") };
        }
        if (modal === "invoice") {
            path = "/api/v1/hospital/billing/invoices";
            payload = { patient_id: value("patient_id"), encounter_id: value("encounter_id") || null, admission_id: value("admission_id") || null, description: value("description"), amount: value("amount") };
            if (!payload.encounter_id && !payload.admission_id) {
                setError("Link the invoice to an encounter or admission.");
                return;
            }
            if (payload.encounter_id && payload.admission_id) {
                setError("Link the invoice to one care context only.");
                return;
            }
        }
        try {
            setIsSubmitting(true);
            await api.post(path, payload);
            setModal(null);
            setNotice(modal === "lab" ? "Laboratory orders created successfully." : "Hospital record saved successfully.");
            await load();
        }
        catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Unable to save hospital record.");
        } finally { setIsSubmitting(false); }
    }
    async function discharge() { if (!selectedAdmission)
        return; try {
        await api.post(`/api/v1/hospital/admissions/${selectedAdmission.id}/discharge`, { notes: "Discharged from hospital workspace" });
        setSelectedAdmission(null);
        setNotice("Patient discharged and bed released.");
        await load();
    }
    catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to discharge patient.");
    } }
    async function closeEncounter(encounter: Encounter) { try {
        await api.post(`/api/v1/hospital/encounters/${encounter.id}/close`, { status: "closed", notes: "Closed from hospital workspace" });
        setNotice("Encounter closed.");
        await load();
    }
    catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to close encounter.");
    } }
    async function reportRadiology(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selectedRadiology)
        return; try {
        await api.post(`/api/v1/hospital/radiology/orders/${selectedRadiology.id}/report`, { report: String(new FormData(event.currentTarget).get("report")) });
        setSelectedRadiology(null);
        setNotice("Radiology report recorded.");
        await load();
    }
    catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to record radiology report.");
    } }
    async function payInvoice(invoice: Invoice) { const remaining = Number(invoice.amount) - Number(invoice.paid_amount); try {
        await api.post(`/api/v1/hospital/billing/invoices/${invoice.id}/pay`, { amount: remaining.toFixed(2), payment_method: "cash" });
        setNotice("Clinical invoice payment recorded.");
        await load();
    }
    catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to record payment.");
    } }
    async function openRecord() { if (!recordPatient || recordPurpose.trim().length < 2) {
        setError("Enter the clinical purpose before opening this patient record.");
        return;
    } try {
        setRecord(await api.get<PatientRecord>(`/api/v1/clinical/patients/${recordPatient.id}/record?purpose=${encodeURIComponent(recordPurpose.trim())}`));
    }
    catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to open patient record.");
    } }
    const formTitle: Record<Exclude<Modal, null>, string> = { patient: "Register patient", admission: "Admit patient", encounter: "New encounter", nursing: "Document nursing note", ward: "Create ward", bed: "Add bed", lab: "Order laboratory test", radiology: "Order radiology study", invoice: "Create clinical invoice" };
    const PatientSelect = () => <Select label="Patient" name="patient_id" required defaultValue={selectedPatient} options={patients.map((patient) => [patient.id, `${patient.full_name} (${patient.patient_number})`])}/>;
    const EncounterSelect = () => <Select label="Open encounter" name="encounter_id" required wide options={openEncounters.map((encounter) => [encounter.id, `${encounter.patient_name} · ${encounter.encounter_type}`])} hint="Required for offline-safe diagnostic orders."/>;
    return <DashboardShell title="Hospital operations" subtitle="Patients, admissions, diagnostics, nursing, discharge, and billing"><PermissionGate permission="hospital.patients.read" module="hospital"><div className="mx-auto max-w-[1280px] space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Clinical workspace</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Hospital</h1></div><div className="flex flex-wrap gap-2"><button onClick={() => setModal("patient")} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16}/> Register patient</button><button onClick={() => setModal("encounter")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><Stethoscope size={16}/> New encounter</button><button onClick={() => { startTransition(() => setTab("setup")); setModal("ward"); }} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800"><BedDouble size={16}/> Set up wards</button></div></header>
    {error && <Message color="rose" text={error}/>}{notice && <Message color="emerald" text={notice}/>}
    <div className="grid gap-4 sm:grid-cols-4"><Metric label="Patients" value={patients.length}/><Metric label="Active admissions" value={activeAdmissions.length}/><Metric label="Open encounters" value={openEncounters.length}/><Metric label="Outstanding billing" value={outstandingInvoiceCount}/></div>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2"><TabButton active={tab === "patients"} click={() => setTab("patients")} icon={<HeartPulse size={16}/>} label="Patients"/><TabButton active={tab === "admissions"} click={() => setTab("admissions")} icon={<BedDouble size={16}/>} label="Admissions & beds"/><TabButton active={tab === "care"} click={() => setTab("care")} icon={<ClipboardList size={16}/>} label="Care & nursing"/><TabButton active={tab === "diagnostics"} click={() => setTab("diagnostics")} icon={<FlaskConical size={16}/>} label="Diagnostics"/><TabButton active={tab === "billing"} click={() => setTab("billing")} icon={<FileText size={16}/>} label="Billing"/><TabButton active={tab === "setup"} click={() => setTab("setup")} icon={<ClipboardList size={16}/>} label="Clinical setup"/></nav>
    {tab === "patients" && <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex gap-3 border-b border-slate-100 p-5"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patients" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"/></label><button onClick={() => setModal("admission")} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Admit patient</button></div>{matchingPatients.length > visiblePatients.length && <p className="px-5 pt-4 text-xs text-slate-500">Showing the first {visiblePatients.length} matching patients. Refine the search to find a specific patient.</p>}<div className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">{visiblePatients.map((patient) => <article key={patient.id} className="rounded-2xl border border-slate-200 p-5"><p className="font-bold">{patient.full_name}</p><p className="mt-1 text-xs text-slate-400">{patient.patient_number}</p><p className="mt-4 text-xs text-slate-500">{patient.phone || "No phone recorded"}</p><div className="mt-4 flex gap-3"><button onClick={() => { setRecordPatient(patient); setRecord(null); setRecordPurpose(""); }} className="text-xs font-bold text-teal-700">Open record</button><button onClick={() => { setSelectedPatient(patient.id); setModal("encounter"); }} className="text-xs font-bold text-slate-600">New encounter</button></div></article>)}{!visiblePatients.length && <p className="col-span-full p-10 text-center text-sm text-slate-500">{busy ? "Loading patients…" : "No patients found."}</p>}</div></section>}
    {tab === "admissions" && <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><Panel title="Admission register" action="New admission" click={() => setModal("admission")}><div className="divide-y divide-slate-100">{visibleAdmissions.map((admission) => <div key={admission.id} className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-bold">{admission.patient_name}</p><p className="text-xs text-slate-400">Bed {admission.bed_number} · {admission.reason || "No reason"}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{admission.status}</span>{admission.status === "admitted" && <button onClick={() => setSelectedAdmission(admission)} className="p-2 text-rose-600" title="Discharge"><LogOut size={16}/></button>}</div>)}{!admissions.length && <p className="py-8 text-sm text-slate-500">No admissions recorded.</p>}</div>{admissions.length > visibleAdmissions.length && <p className="pt-4 text-xs text-slate-500">Showing the first {visibleAdmissions.length} admissions.</p>}</Panel><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">Beds</h2><p className="mt-1 text-xs text-slate-400">{availableBeds.length} available of {beds.length}</p></div><div className="flex gap-2"><button onClick={() => setModal("ward")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Ward</button><button onClick={() => setModal("bed")} className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white">Bed</button></div></div><div className="mt-5 grid grid-cols-2 gap-3">{visibleBeds.map((bed) => <div key={bed.id} className={`rounded-xl p-3 text-center text-xs font-bold ${bed.status === "available" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><BedDouble className="mx-auto mb-1" size={17}/>{bed.bed_number}<p className="mt-1 text-[10px] capitalize">{bed.status}</p></div>)}</div>{beds.length > visibleBeds.length && <p className="mt-3 text-xs text-slate-500">Showing the first {visibleBeds.length} beds.</p>}{wards.map((ward) => <p key={ward.id} className="mt-3 text-xs text-slate-500">{ward.name} · {branchName(branches, ward.branch_id)}</p>)}</section></div>}
    {tab === "care" && <Panel title="Encounters and nursing documentation" action="New nursing note" click={() => setModal("nursing")}><p className="mb-4 text-xs text-slate-400">Notes attach to an active admission, keeping them branch-scoped while the store is offline.</p><div className="divide-y divide-slate-100">{visibleEncounters.map((encounter) => <div key={encounter.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-bold">{encounter.patient_name} <span className="font-normal text-slate-400">· {encounter.encounter_type}</span></p><p className="mt-1 text-xs text-slate-500">{encounter.diagnosis || "No diagnosis recorded"}{encounter.notes ? ` · ${encounter.notes}` : ""}</p></div><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">{encounter.status}</span>{encounter.status === "open" && <button onClick={() => void closeEncounter(encounter)} className="text-xs font-bold text-rose-700">Close encounter</button>}</div>)}{!encounters.length && <p className="py-8 text-sm text-slate-500">No encounters recorded.</p>}</div>{encounters.length > visibleEncounters.length && <p className="pt-4 text-xs text-slate-500">Showing the first {visibleEncounters.length} encounters.</p>}</Panel>}
    {tab === "diagnostics" && <div className="grid gap-6 lg:grid-cols-2"><DiagnosticPanel title="Laboratory" rows={visibleLabs} create={() => setModal("lab")} select={() => undefined}/><DiagnosticPanel title="Radiology" rows={visibleRadiology} create={() => setModal("radiology")} select={setSelectedRadiology}/>{(labs.length > visibleLabs.length || radiology.length > visibleRadiology.length) && <p className="text-xs text-slate-500 lg:col-span-2">Showing the first {maxVisibleRows} requests in each diagnostic worklist.</p>}</div>}
    {tab === "setup" && <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><Panel title="Wards and beds" action="Create ward" click={() => setModal("ward")}><p className="text-sm text-slate-500">Set up wards first, then add beds. Admissions only show available beds from the selected ward.</p><div className="mt-5 divide-y divide-slate-100">{visibleWards.map((ward) => { const wardBeds = bedsByWard.get(ward.id) || []; return <div key={ward.id} className="py-4"><div className="flex items-start justify-between gap-4"><div><p className="font-bold">{ward.name}</p><p className="mt-1 text-xs text-slate-400">{ward.ward_type} · {branchName(branches, ward.branch_id)} · {wardBeds.filter((bed) => bed.status === "available").length} of {wardBeds.length} beds available</p></div><button onClick={() => setModal("bed")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Add bed</button></div></div>; })}{!wards.length && <p className="py-8 text-sm text-slate-500">No wards yet. Create the first ward to begin bed configuration.</p>}</div>{wards.length > visibleWards.length && <p className="pt-4 text-xs text-slate-500">Showing the first {visibleWards.length} wards.</p>}</Panel><section className="rounded-3xl border border-teal-100 bg-teal-50 p-6"><FlaskConical className="text-teal-700" size={24}/><h2 className="mt-4 text-xl font-bold text-slate-900">Diagnostic test catalog</h2><p className="mt-2 text-sm text-slate-600">Manage approved tests, specimen types, turnaround times, and system-controlled prices in the Laboratory module.</p><a href="/laboratory" className="mt-5 inline-flex rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Open test catalog</a></section></div>}
    {tab === "billing" && <Panel title="Clinical billing" action="New invoice" click={() => setModal("invoice")}><p className="mb-4 text-xs text-slate-400">Each invoice is tied to one encounter or admission for reliable branch reconciliation.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-3">Patient</th><th className="py-3">Description</th><th className="py-3">Amount</th><th className="py-3">Status</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{visibleInvoices.map((invoice) => <tr key={invoice.id}><td className="py-4 font-semibold">{patientName(invoice.patient_id)}</td><td className="py-4">{invoice.description}</td><td className="py-4 font-bold">{invoice.amount}</td><td className="py-4 capitalize">{invoice.status}</td><td className="py-4 text-right">{invoice.status !== "paid" && <button onClick={() => void payInvoice(invoice)} className="text-xs font-bold text-teal-700">Pay balance</button>}</td></tr>)}</tbody></table></div>{invoices.length > visibleInvoices.length && <p className="pt-4 text-xs text-slate-500">Showing the first {visibleInvoices.length} invoices.</p>}{!invoices.length && <p className="py-8 text-center text-sm text-slate-500">No clinical invoices.</p>}</Panel>}
    {modal && <RecordModal title={formTitle[modal]} close={() => setModal(null)} submit={submit} submitting={isSubmitting}><div className="grid gap-4 sm:grid-cols-2">
      {modal === "patient" && <><Select label="Branch" name="branch_id" required options={branches.map((b) => [b.id, `${b.name} (${b.code})`])}/><Text label="Full name" name="full_name" required wide/><Text label="Date of birth" name="date_of_birth" type="date"/><Text label="Sex" name="sex" required/><Text label="Phone" name="phone" required/><Text label="Email" name="email" type="email"/><Text label="Address" name="address" textarea wide required/><Text label="National ID / NIN" name="national_id"/><Select label="Referral source" name="referral_source" options={[["walk_in", "Walk-in"], ["referral", "Referral"], ["emergency", "Emergency"], ["corporate", "Corporate"], ["other", "Other"]]}/><Text label="Blood group" name="blood_group"/><Text label="Marital status" name="marital_status"/><Text label="Emergency contact name" name="emergency_contact_name"/><Text label="Relationship" name="emergency_contact_relationship"/><Text label="Emergency phone" name="emergency_contact_phone"/><Select label="Payment type" name="payment_type" options={[["cash", "Cash"], ["insurance", "Insurance / HMO"], ["corporate", "Corporate"]]}/><Text label="Occupation" name="occupation"/><Text label="Religion" name="religion"/><Text label="Preferred language" name="preferred_language"/><Text label="Photo URL" name="photo_url" wide/></>}
      {modal === "admission" && <AdmissionFields patients={patients} selectedPatient={selectedPatient} wards={wards} beds={beds}/>} 
      {modal === "encounter" && <><PatientSelect /><Select label="Branch" name="branch_id" required options={branches.map((b) => [b.id, `${b.name} (${b.code})`])}/><Select label="Type" name="encounter_type" options={[["outpatient", "Outpatient"], ["emergency", "Emergency"], ["inpatient", "Inpatient"]]}/><Text label="Diagnosis" name="diagnosis" wide/><Text label="Notes" name="notes" textarea wide/></>}
      {modal === "nursing" && <><PatientSelect /><Select label="Active admission" name="admission_id" required options={activeAdmissions.map((a) => [a.id, `${a.patient_name} · Bed ${a.bed_number}`])}/><Select label="Note type" name="note_type" options={[["progress", "Progress"], ["observation", "Observation"], ["handover", "Handover"]]}/><Text label="Clinical note" name="content" textarea required wide/></>}
      {modal === "ward" && <><Select label="Branch" name="branch_id" required options={branches.map((b) => [b.id, `${b.name} (${b.code})`])}/><Text label="Ward name" name="name" required/><Select label="Ward type" name="ward_type" options={[["general", "General"], ["emergency", "Emergency"], ["maternity", "Maternity"], ["icu", "ICU"]]}/></>}
      {modal === "bed" && <><Select label="Ward" name="ward_id" required options={wards.map((w) => [w.id, `${w.name} · ${branchName(branches, w.branch_id)}`])}/><Text label="Bed number" name="bed_number" required/></>}
      {(modal === "radiology" || modal === "invoice") && <PatientSelect />}{modal === "radiology" && <EncounterSelect />}
      {modal === "lab" && <DiagnosticOrderFields patients={patients} encounters={encounters}/>} {modal === "radiology" && <><Text label="Study name" name="study_name" required/><Text label="Charge amount" name="charge_amount" type="number" required/><Priority /></>}
      {modal === "invoice" && <><Select label="Encounter (optional)" name="encounter_id" wide options={openEncounters.map((e) => [e.id, `${e.patient_name} · ${e.encounter_type}`])}/><Select label="Admission (optional)" name="admission_id" wide options={activeAdmissions.map((a) => [a.id, `${a.patient_name} · Bed ${a.bed_number}`])}/><Text label="Description" name="description" required/><Text label="Amount" name="amount" type="number" required/></>}
    </div></RecordModal>}
    {selectedAdmission && <Confirm admission={selectedAdmission} close={() => setSelectedAdmission(null)} confirm={discharge}/>}{selectedRadiology && <ResultModal title={`Report: ${selectedRadiology.study_name}`} field="report" close={() => setSelectedRadiology(null)} submit={reportRadiology}/>} 
    {recordPatient && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex justify-between gap-4"><div><h2 className="text-xl font-bold">Patient record</h2><p className="mt-1 text-sm text-slate-500">{recordPatient.full_name} · {recordPatient.patient_number}</p></div><button onClick={() => setRecordPatient(null)}><X size={18}/></button></div>{!record ? <div className="mt-5"><p className="text-sm text-slate-600">Clinical access is recorded. State why this record is needed before opening it.</p><label className="mt-4 block text-xs font-bold text-slate-600">Purpose<textarea value={recordPurpose} onChange={(event) => setRecordPurpose(event.target.value)} minLength={2} rows={3} placeholder="e.g. Review before ward round" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/></label><button onClick={() => void openRecord()} className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Open audited record</button></div> : <div className="mt-5 space-y-5"><div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3"><p><span className="block text-xs text-slate-400">Date of birth</span>{record.patient.date_of_birth || "—"}</p><p><span className="block text-xs text-slate-400">Phone</span>{record.patient.phone || "—"}</p><p><span className="block text-xs text-slate-400">Sex</span>{record.patient.sex || "—"}</p></div><RecordSection title="Encounters" rows={record.encounters.map((item) => `${item.status} · ${item.diagnosis || "No diagnosis"}`)}/><RecordSection title="Admissions" rows={record.admissions.map((item) => `${item.status} · Bed ${item.bed_id}`)}/><RecordSection title="Prescriptions" rows={record.prescriptions.map((item) => item.status)}/><RecordSection title="Laboratory" rows={record.laboratory.map((item) => `${item.test_name} · ${item.status}${item.result ? `: ${item.result}` : ""}`)}/><RecordSection title="Radiology" rows={record.radiology.map((item) => `${item.study_name} · ${item.status}${item.report ? `: ${item.report}` : ""}`)}/><RecordSection title="Nursing" rows={record.nursing.map((item) => `${item.note_type}: ${item.content}`)}/></div>}</div></div>}
  </div></PermissionGate></DashboardShell>;
}
function Message({ color, text }: {
    color: "rose" | "emerald";
    text: string;
}) { return <div className={`rounded-2xl border px-4 py-3 text-sm ${color === "rose" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{text}</div>; }
function Metric({ label, value }: {
    label: string;
    value: number;
}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
function TabButton({ active, click, icon, label }: {
    active: boolean;
    click: () => void;
    icon: React.ReactNode;
    label: string;
}) { return <button onClick={click} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${active ? "bg-teal-50 text-teal-700" : "text-slate-500"}`}>{icon}{label}</button>; }
function Panel({ title, action, click, children }: {
    title: string;
    action?: string;
    click?: () => void;
    children: React.ReactNode;
}) { return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2>{action && <button onClick={click} className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white">{action}</button>}</div><div className="mt-5">{children}</div></section>; }
function Text({ label, name, type = "text", required = false, textarea = false, wide = false }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    textarea?: boolean;
    wide?: boolean;
}) { return <label className={`text-xs font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}>{label}{textarea ? <textarea name={name} required={required} className={inputClass}/> : <input name={name} type={type} required={required} min={type === "number" ? "0.01" : undefined} step={type === "number" ? "0.01" : undefined} className={inputClass}/>}</label>; }
function Select({ label, name, options, required = false, defaultValue = "", wide = false, hint }: {
    label: string;
    name: string;
    options: string[][];
    required?: boolean;
    defaultValue?: string;
    wide?: boolean;
    hint?: string;
}) { const [value, setValue] = useState(defaultValue); return <label className={`text-xs font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}>{label}<AppSelect name={name} required={required} value={value} onChange={setValue} className="mt-1" buttonClassName="px-3 py-2 text-sm" options={[{ value: "", label: `Select ${label.toLowerCase()}` }, ...options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))]}/>{hint && <span className="mt-1 block font-normal text-slate-400">{hint}</span>}</label>; }
function Priority() { return <Select label="Priority" name="priority" options={[["routine", "Routine"], ["urgent", "Urgent"], ["stat", "STAT"]]}/>; }
function AdmissionFields({ patients, selectedPatient, wards, beds }: { patients: Patient[]; selectedPatient: string; wards: Ward[]; beds: Bed[] }) {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [wardId, setWardId] = useState("");
    useEffect(() => { void api.get<Provider[]>("/api/v1/hospital/admissions/clinicians").then(setProviders).catch(() => setProviders([])); }, []);
    const availableBeds = beds.filter((bed) => bed.status === "available" && bed.ward_id === wardId);
    const doctors = providers.filter((provider) => /doctor|consultant|physician|medical officer/i.test(provider.job_title || ""));
    const clinicians = doctors.length ? doctors : providers;
    const now = new Date();
    const localAdmissionTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const optionField = (label: string, name: string, options: Array<{ value: string; label: string }>, value: string, change: (value: string) => void, required = false, disabled = false) => <label className="text-xs font-bold text-slate-600">{label}<AppSelect name={name} required={required} disabled={disabled} value={value} onChange={change} className="mt-1" buttonClassName="px-3 py-2 text-sm" options={[{ value: "", label: `Select ${label.toLowerCase()}` }, ...options]} /></label>;
    const [patientId, setPatientId] = useState(selectedPatient);
    const [clinicianId, setClinicianId] = useState("");
    const [bedId, setBedId] = useState("");
    const [admissionType, setAdmissionType] = useState("elective");
    const [paymentType, setPaymentType] = useState("");
    return <>
      {optionField("Patient", "patient_id", patients.map((patient) => ({ value: patient.id, label: `${patient.full_name} (${patient.patient_number})` })), patientId, setPatientId, true)}
      {optionField("Admitting doctor / consultant", "admitting_clinician_id", clinicians.map((provider) => ({ value: provider.id, label: `${provider.name}${provider.job_title ? ` · ${provider.job_title}` : ""}` })), clinicianId, setClinicianId, true)}
      {optionField("Ward / department", "ward_id", wards.map((ward) => ({ value: ward.id, label: `${ward.name} · ${ward.ward_type}` })), wardId, (value) => { setWardId(value); setBedId(""); }, true)}
      {optionField("Available bed", "bed_id", availableBeds.map((bed) => ({ value: bed.id, label: bed.bed_number })), bedId, setBedId, true, !wardId)}
      {optionField("Admission type", "admission_type", [{ value: "emergency", label: "Emergency" }, { value: "elective", label: "Elective" }, { value: "transfer", label: "Transfer" }], admissionType, setAdmissionType, true)}
      {optionField("Payment type", "payment_type", [{ value: "cash", label: "Cash" }, { value: "insurance", label: "Insurance / HMO" }, { value: "corporate", label: "Corporate" }, { value: "government", label: "Government" }, { value: "other", label: "Other" }], paymentType, setPaymentType, true)}
      <Text label="Provisional diagnosis" name="provisional_diagnosis" required wide/>
      <Text label="Reason for admission" name="reason" textarea required wide/>
      <label className="text-xs font-bold text-slate-600">Admission date & time<input name="admitted_at" type="datetime-local" defaultValue={localAdmissionTime} className={inputClass} /></label>
      <Text label="Referring doctor (optional)" name="referring_doctor" />
      <label className="text-xs font-bold text-slate-600">Expected stay (days)<input name="expected_length_of_stay_days" type="number" min="1" max="365" className={inputClass} /></label>
      <Text label="Attendant / companion name" name="attendant_name" />
      <Text label="Attendant phone" name="attendant_phone" />
      <Text label="Relationship to patient" name="attendant_relationship" />
    </>;
}
function DiagnosticOrderFields({ patients, encounters }: { patients: Patient[]; encounters: Encounter[] }) {
    const [catalog, setCatalog] = useState<TestCatalog[]>([]);
    const [patientId, setPatientId] = useState("");
    const [encounterId, setEncounterId] = useState("");
    const [testIds, setTestIds] = useState<string[]>([]);
    useEffect(() => { void api.get<TestCatalog[]>("/api/v1/hospital/lab/catalog").then(setCatalog).catch(() => setCatalog([])); }, []);
    const availableEncounters = encounters.filter((encounter) => encounter.status === "open" && (!patientId || encounter.patient_id === patientId));
    const selectedTests = catalog.filter((test) => testIds.includes(test.id));
    const toggleTest = (id: string) => setTestIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    const field = (label: string, name: string, value: string, change: (value: string) => void, options: Array<{ value: string; label: string }>, required = false, disabled = false, wide = false) => <label className={`text-xs font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}>{label}<AppSelect name={name} required={required} disabled={disabled} value={value} onChange={change} className="mt-1" buttonClassName="px-3 py-2 text-sm" options={[{ value: "", label: `Select ${label.toLowerCase()}` }, ...options]} /></label>;
    return <>
      {field("Patient", "patient_id", patientId, (value) => { setPatientId(value); setEncounterId(""); }, patients.map((patient) => ({ value: patient.id, label: `${patient.full_name} (${patient.patient_number})` })), true)}
      {field("Open encounter", "encounter_id", encounterId, setEncounterId, availableEncounters.map((encounter) => ({ value: encounter.id, label: `${encounter.patient_name} · ${encounter.encounter_type}` })), true, !patientId)}
      <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-slate-600">Catalog tests</legend><div className="mt-1 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2">{catalog.map((test) => <label key={test.id} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm ${testIds.includes(test.id) ? "bg-teal-50 text-teal-950" : "hover:bg-slate-50"}`}><input name="test_catalog_ids" type="checkbox" value={test.id} checked={testIds.includes(test.id)} onChange={() => toggleTest(test.id)} className="mt-1 h-4 w-4 accent-teal-600"/><span><strong>{test.code} · {test.name}</strong><span className="mt-1 block text-xs text-slate-500">{test.standard_price} · {test.specimen_type || "Specimen not specified"}{test.turnaround_hours ? ` · ${test.turnaround_hours}h turnaround` : ""}</span></span></label>)}{!catalog.length && <p className="p-3 text-sm text-slate-500">No active catalog tests are configured.</p>}</div></fieldset>
      {selectedTests.length ? <div className="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900 sm:col-span-2"><strong>{selectedTests.length} test{selectedTests.length === 1 ? "" : "s"} selected.</strong> Each creates its own order, invoice, and clearance gate.</div> : <p className="text-xs text-slate-400 sm:col-span-2">Select one or more configured catalog tests. Price is controlled by the test catalog.</p>}
      <Text label="Provisional diagnosis / clinical indication" name="provisional_diagnosis" textarea wide/>
      <Priority />
    </>;
}
function RecordModal({ title, close, submit, submitting, children }: {
    title: string;
    close: () => void;
    submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
    submitting: boolean;
    children: React.ReactNode;
}) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void submit(event)} className="scrollbar-hidden max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl sm:p-7"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button type="button" onClick={close} disabled={submitting}><X size={18}/></button></div><div className="mt-5">{children}</div><button disabled={submitting} className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Saving…" : "Save record"}</button></form></div>; }
function Confirm({ admission, close, confirm }: {
    admission: Admission;
    close: () => void;
    confirm: () => Promise<void>;
}) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Discharge patient?</h2><p className="mt-2 text-sm text-slate-500">This releases bed {admission.bed_number}.</p><div className="mt-5 flex gap-2"><button onClick={close} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">Cancel</button><button onClick={() => void confirm()} className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">Discharge</button></div></div></div>; }
function ResultModal({ title, field, close, submit }: {
    title: string;
    field: string;
    close: () => void;
    submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button type="button" onClick={close}><X size={18}/></button></div><textarea name={field} required rows={5} className="mt-5 w-full rounded-xl border border-slate-200 p-3 text-sm"/><button className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Save</button></form></div>; }
function RecordSection({ title, rows }: {
    title: string;
    rows: string[];
}) { return <section><h3 className="text-sm font-bold text-slate-800">{title}</h3><div className="mt-2 space-y-2">{rows.map((row, index) => <p key={`${title}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{row}</p>)}{!rows.length && <p className="text-sm text-slate-400">No {title.toLowerCase()} recorded.</p>}</div></section>; }
function DiagnosticPanel({ title, rows, create, select }: {
    title: "Laboratory" | "Radiology";
    rows: Lab[] | Radiology[];
    create: () => void;
    select: (row: never) => void;
}) { return <Panel title={title} action={`Order ${title === "Laboratory" ? "test" : "study"}`} click={create}><div className="divide-y divide-slate-100">{rows.map((row) => { const isLaboratory = "test_name" in row; const name = isLaboratory ? row.test_name : row.study_name; const result = isLaboratory ? row.result : row.report; const clinicianCanSeeResult = !isLaboratory || ["validated", "reviewed"].includes(row.status); return <div key={row.id} className="py-4"><div className="flex items-center justify-between"><p className="font-bold">{name}</p><span className="text-xs font-bold capitalize text-slate-500">{row.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-slate-400">{row.patient_name} · {row.priority}</p>{result && clinicianCanSeeResult ? <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p> : isLaboratory ? <p className="mt-2 text-xs text-slate-400">Laboratory is processing this request. The ordering clinician is notified when a result is validated.</p> : row.status === "ordered" && <button onClick={() => select(row as never)} className="mt-3 text-xs font-bold text-teal-700">Enter report</button>}</div>; })}{!rows.length && <p className="py-8 text-sm text-slate-500">No {title.toLowerCase()} orders.</p>}</div></Panel>; }
