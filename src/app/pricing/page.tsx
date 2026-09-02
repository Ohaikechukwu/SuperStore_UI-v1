"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, BarChart3, Building2, Check, CheckCircle2, ChevronRight,
  ClipboardCheck, CloudOff, CreditCard, FlaskConical, HeartPulse,
  LockKeyhole, PackageCheck, Pill, ShieldCheck, Stethoscope, UsersRound,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";

type LicensePlan = {
  id: string; name: string; description: string; company_limit: number;
  cash_point_limit: number; modules: string[]; amount: number; currency: string;
  branding_available: boolean; branding_addon_amount: number; billing_period_days: number;
};

const moduleIcons: Record<string, typeof Pill> = {
  store: PackageCheck, inventory: PackageCheck, stock: PackageCheck, accounting: BarChart3,
  pharmacy: Pill, hospital: Stethoscope, laboratory: FlaskConical,
};

const capabilities = [
  { icon: PackageCheck, title: "Stock that stays accountable", text: "Receive, transfer, count, write off, and monitor stock with batch and expiry visibility." },
  { icon: CreditCard, title: "Faster, controlled checkout", text: "Run terminals, sales, refunds, held baskets, cash reconciliation, and receipt history in one flow." },
  { icon: HeartPulse, title: "Care operations in context", text: "Run pharmacy, hospital, and laboratory workflows in dedicated licensed workspaces." },
  { icon: BarChart3, title: "Decisions, not just data", text: "Surface sales, margins, stock exposure, terminal variance, and operational exceptions in one command centre." },
];

const controls = [
  "Role-aware access and branch controls",
  "Audit trails for accountable operations",
  "Offline-aware workflow with sync review",
  "Company-wide settings and reporting timezone",
];

function formatPrice(plan: LicensePlan) {
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency: plan.currency, maximumFractionDigits: 2,
  }).format(plan.amount / 100);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PricingPage() {
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.get<LicensePlan[]>("/api/v1/billing/plans")
      .then(setPlans)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Our pricing is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, []);

  return <main className="min-h-screen bg-[#f7faf9] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/pricing" className="flex min-w-0 items-center gap-3" aria-label="Superstore Health Suite pricing home">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-600 text-white shadow-lg shadow-teal-600/20"><ShieldCheck size={21} /></span>
          <span className="min-w-0"><strong className="block truncate text-sm tracking-tight">Superstore Health Suite</strong><span className="block truncate text-xs text-slate-500">Connected operations for care and commerce</span></span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex" aria-label="Pricing navigation">
          <a href="#plans" className="hover:text-teal-700">Plans</a><a href="#product-areas" className="hover:text-teal-700">Product areas</a><a href="#how-it-works" className="hover:text-teal-700">How it works</a><a href="#questions" className="hover:text-teal-700">FAQ</a>
        </nav>
        <Link href="/signup" className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700">Create workspace</Link>
      </div>
    </header>

    <section className="relative overflow-hidden bg-slate-950 px-5 pb-20 pt-16 text-white sm:px-8 sm:pb-28 sm:pt-24">
      <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" /><div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-300"><CheckCircle2 size={15} /> Annual software plans</p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">One operational backbone for every place your business serves.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Bring stock, checkout, pharmacy, clinical operations, and financial control into a connected workspace. Choose the annual capacity and modules that fit your company today.</p>
          <div className="mt-9 flex flex-wrap gap-3"><a href="#plans" className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold shadow-lg shadow-teal-500/20 transition hover:bg-teal-400">Explore plans <ArrowRight size={17} /></a><a href="#how-it-works" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold transition hover:border-white hover:bg-white/5">See how activation works</a></div>
          <p className="mt-5 text-xs leading-5 text-slate-400">Every live plan shows its annual price, company allowance, POS-terminal capacity, and licensed modules.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <HeroSignal icon={<Building2 size={20} />} label="Capacity-led" text="Company and terminal limits are explicit before checkout." />
          <HeroSignal icon={<CloudOff size={20} />} label="Hybrid-ready" text="Offline work is tracked and surfaced for review when the connection returns." />
          <HeroSignal icon={<LockKeyhole size={20} />} label="Controlled access" text="Roles, branch scope, terminal sessions, and audit history support accountable teams." />
        </div>
      </div>
    </section>

    <section className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div className="mx-auto grid max-w-[1240px] gap-3 text-sm sm:grid-cols-3"><TrustPoint icon={<ClipboardCheck size={18} />} text="Clear annual entitlement" /><TrustPoint icon={<UsersRound size={18} />} text="Built for multi-role teams" /><TrustPoint icon={<ShieldCheck size={18} />} text="Security and audit-aware by design" /></div></section>

    <section id="plans" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24"><div className="mx-auto max-w-[1240px]">
      <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div className="max-w-xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Available plans</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Make capacity part of the decision.</h2><p className="mt-4 text-sm leading-6 text-slate-600">The live pricing catalog below is managed by your platform administrator. Each price covers one annual subscription period and the exact capabilities shown on the card.</p></div><aside className="rounded-2xl border border-teal-100 bg-teal-50 p-5 text-sm text-teal-950"><p className="font-bold">Already have a workspace?</p><p className="mt-1 leading-6 text-teal-800">Sign in to review your current entitlement, manage your company, or proceed to the configured checkout provider.</p><Link href="/login" className="mt-3 inline-flex items-center gap-1 font-bold text-teal-800 hover:text-teal-950">Go to sign in <ChevronRight size={16} /></Link></aside></div>
      {error && <div role="alert" className="mt-9 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}
      {loading ? <PlanSkeletons /> : <PlanGrid plans={plans} />}
    </div></section>

    <ProductAreas />

    <section id="included" className="scroll-mt-24 border-y border-slate-200 bg-white px-5 py-16 sm:px-8 sm:py-24"><div className="mx-auto max-w-[1240px]">
      <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">What the platform gives your team</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Operate with a single version of the truth.</h2><p className="mt-4 text-sm leading-6 text-slate-600">Your plan defines the licensed modules and operational capacity available to your company, so every workflow is controlled in one connected workspace.</p></div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{capabilities.map((capability) => <CapabilityCard key={capability.title} {...capability} />)}</div>
      <div className="mt-10 grid gap-5 rounded-3xl bg-slate-950 p-7 text-white md:grid-cols-[.8fr_1.2fr] md:p-9"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Across the workspace</p><h3 className="mt-3 text-2xl font-bold tracking-tight">Controls that do not disappear when work gets busy.</h3></div><ul className="grid gap-3 sm:grid-cols-2">{controls.map((item) => <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-200"><CheckCircle2 className="mt-0.5 shrink-0 text-teal-300" size={18} />{item}</li>)}</ul></div>
    </div></section>

    <section className="px-5 py-16 sm:px-8 sm:py-24"><div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
      <div className="rounded-[2rem] bg-teal-600 p-8 text-white shadow-xl shadow-teal-600/15 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-100">Designed around the work</p><h2 className="mt-4 text-3xl font-bold tracking-tight">Start with the operating core. Add specialist workflows when they matter.</h2><p className="mt-5 text-sm leading-6 text-teal-50">Keep a coherent operational foundation while matching the licensed modules to the services you deliver.</p><Link href="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-teal-800 transition hover:bg-teal-50">Sign in to review options <ArrowRight size={17} /></Link></div>
      <div className="grid gap-4 sm:grid-cols-2"><ModuleExplanation icon={<PackageCheck size={21} />} title="Store & inventory" text="Products, stock movement, counts, purchase orders, supplier control, expiry, and replenishment signals." /><ModuleExplanation icon={<CreditCard size={21} />} title="Point of sale" text="Numbered terminals, controlled cash sessions, receipt history, refunds, and reconciliation." /><ModuleExplanation icon={<Pill size={21} />} title="Pharmacy" text="Prescription and dispensing workflows, controlled-drug records, claims, and batch-aware medicine operations." /><ModuleExplanation icon={<Stethoscope size={21} />} title="Hospital & laboratory" text="Patient care, encounters, admissions, diagnostics, billing workflows, and role-specific clinical workspaces." /></div>
    </div></section>

    <section id="how-it-works" className="scroll-mt-24 bg-slate-100 px-5 py-16 sm:px-8 sm:py-24"><div className="mx-auto max-w-[1240px]"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">How it works</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">A straightforward path from plan to working workspace.</h2></div><ol className="mt-10 grid gap-5 md:grid-cols-3"><JourneyStep number="01" title="Compare the live plans" text="Review the annual price, companies, POS terminals, and licensed modules that each published plan includes." /><JourneyStep number="02" title="Sign in and choose" text="An authorised owner or administrator selects an eligible plan for the company and continues through the configured payment provider." /><JourneyStep number="03" title="Activate and operate" text="After verified payment, the company receives its plan capacity and module entitlement for the annual period." /></ol></div></section>

    <section id="questions" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24"><div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Questions</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Pricing should be easy to understand.</h2><p className="mt-4 text-sm leading-6 text-slate-600">If you need a plan adjusted or a module added, speak with your platform administrator before checkout.</p></div><div className="space-y-3"><Faq question="Is the displayed price monthly or annual?" answer="Every published plan on this page is billed for the annual period shown on its card. The live plan catalog remains the source of truth for price and included capacity." /><Faq question="What does POS-terminal capacity mean?" answer="It is the number of active numbered checkout terminals the company can provision across all branches. A terminal can be used by one open cash session at a time." /><Faq question="Can we add pharmacy, hospital, or laboratory capabilities later?" answer="Yes, where an eligible plan or licensed module is available. Your platform administrator controls the published catalog and company entitlement." /><Faq question="Who can purchase or change a plan?" answer="Company owners and administrators can proceed with checkout. Platform super administrators manage plan availability and can assign company plans where appropriate." /></div></div></section>

    <section className="px-5 pb-16 sm:px-8 sm:pb-24"><div className="mx-auto flex max-w-[1240px] flex-col gap-6 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-12 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Ready when your team is</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Choose a plan built around your real operating capacity.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Sign in to continue to the company workspace and select an eligible annual plan.</p></div><div className="flex shrink-0 flex-wrap gap-3"><a href="#plans" className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold transition hover:bg-teal-400">View plans</a><Link href="/login" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold transition hover:border-white hover:bg-white/5">Sign in <ChevronRight className="ml-1 inline" size={16} /></Link></div></div></section>
    <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} Superstore Health Suite. <Link href="/login" className="font-bold text-teal-700 hover:text-teal-800">Sign in to manage your workspace</Link>.</footer>
  </main>;
}

function ProductAreas() {
  const areas = [
    { icon: CreditCard, title: "Point of sale & payments", eyebrow: "Store operations", text: "Run fast, controlled checkout with numbered terminals, cashier sessions, receipts, discounts, refunds, held baskets, and reconciliation.", details: ["Cashier accountability by terminal", "Receipts, returns, and payment records", "Offline-aware transaction workflow"] },
    { icon: PackageCheck, title: "Inventory, stock & purchasing", eyebrow: "Operational control", text: "Keep products, suppliers, batches, expiry, transfers, counts, receiving, and replenishment decisions connected to the sale.", details: ["Branch-level stock visibility", "Batch and expiry-aware inventory", "Purchase orders and supplier control"] },
    { icon: UsersRound, title: "Employee management", eyebrow: "People & access", text: "Maintain employee records, job details, supervisor structure, branch scope, system access, custom roles, permissions, and payroll administration.", details: ["Role and permission controls", "Employee access lifecycle and session security", "Compensation, loans, and statutory payroll"] },
    { icon: UsersRound, title: "Customer CRM", eyebrow: "Customer relationships", text: "Keep a clean customer directory with contact details, customer numbers, active status, and receipt-linked purchase history for better service.", details: ["Searchable customer profiles", "Customer-linked sales and returns", "Supplier and customer contacts in one workspace"] },
    { icon: BarChart3, title: "Sales & financial analytics", eyebrow: "Management intelligence", text: "Understand sales, discounts, refunds, gross margin, top products, daily trends, cash variance, purchasing, inventory risk, and financial position.", details: ["Date and branch filters", "CSV export for operational review", "Accounting, stock, clinical, and cash reporting"] },
    { icon: HeartPulse, title: "Hospital, pharmacy & laboratory", eyebrow: "Care delivery", text: "Operate clinical work in dedicated licensed modules: patient care, billing, claims, dispensing, diagnostics, and configurable tenant workflows.", details: ["Tenant-configurable clinical settings", "Integrated patient billing and payment controls", "Dedicated operational reports"] },
  ];
  return <section id="product-areas" className="scroll-mt-24 border-y border-slate-200 bg-slate-950 px-5 py-16 text-white sm:px-8 sm:py-24"><div className="mx-auto max-w-[1240px]"><div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">One platform, clear work areas</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Every team sees the work that matters to them.</h2></div><p className="max-w-2xl text-sm leading-6 text-slate-300">Inspired by the clarity of a product-led homepage, these sections explain the actual operational areas in Superstore Health Suite. A tenant licenses the modules it needs, then controls staff access within them.</p></div><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{areas.map((area) => <article key={area.title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-400/15 text-teal-200"><area.icon size={21} /></span><p className="mt-5 text-[11px] font-bold uppercase tracking-[.16em] text-teal-300">{area.eyebrow}</p><h3 className="mt-2 text-xl font-bold tracking-tight">{area.title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{area.text}</p><ul className="mt-5 space-y-2">{area.details.map((detail) => <li key={detail} className="flex gap-2 text-xs leading-5 text-slate-200"><CheckCircle2 className="mt-0.5 shrink-0 text-teal-300" size={15} />{detail}</li>)}</ul></article>)}</div><aside className="mt-7 rounded-3xl border border-amber-300/20 bg-amber-200/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-8"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-200">Next customer capability</p><h3 className="mt-2 text-xl font-bold">Customer loyalty is the next CRM feature to build.</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Customer profiles and purchase history are live. A full loyalty programme still needs its own tenant-configured earning, redemption, expiry, and reversal rules so rewards remain financially correct.</p></div><a href="#questions" className="mt-4 inline-flex shrink-0 rounded-xl border border-amber-100/30 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-white/10 sm:mt-0">See product questions</a></aside></div></section>;
}

function PlanGrid({ plans }: { plans: LicensePlan[] }) {
  if (!plans.length) return <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><CreditCard className="mx-auto text-slate-400" size={28} /><h3 className="mt-4 text-lg font-bold">Plans will appear here when published.</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Your platform administrator has not published an active annual plan yet. Once available, this page will show the exact annual price and capacity.</p></div>;
  return <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,310px),1fr))] items-stretch gap-6">{plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}</div>;
}

function PlanSkeletons() { return <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,310px),1fr))] gap-6">{[1, 2, 3].map((item) => <div key={item} className="h-[485px] animate-pulse rounded-3xl bg-white shadow-sm" />)}</div>; }

function PlanCard({ plan }: { plan: LicensePlan }) {
  const company = "Up to " + plan.company_limit + (plan.company_limit === 1 ? " company" : " companies");
  const terminal = plan.cash_point_limit + " shared POS terminal" + (plan.cash_point_limit === 1 ? "" : "s");
  return <article className="flex min-h-[485px] flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-950/5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Annual plan</p><h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{plan.name}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{plan.billing_period_days} days</span></div><p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">{plan.description || "A configured annual plan for connected business operations."}</p><div className="mt-7 border-y border-slate-100 py-5"><p className="text-4xl font-bold tracking-tight text-slate-950">{formatPrice(plan)}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">per annual subscription</p></div><ul className="mt-6 space-y-3">{plan.company_limit > 0 && <PlanFeature icon={<Building2 size={18} />} text={company} />}{plan.cash_point_limit > 0 && <PlanFeature icon={<CreditCard size={18} />} text={terminal} />}{plan.modules.map((module) => { const Icon = moduleIcons[module] || Check; return <PlanFeature key={module} icon={<Icon size={18} />} text={titleCase(module) + " module"} />; })}{plan.branding_available && <PlanFeature icon={<ShieldCheck size={18} />} text={`Custom branding add-on — ${new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency, maximumFractionDigits: 2 }).format(plan.branding_addon_amount / 100)}/year`} />}{!plan.modules.length && <PlanFeature icon={<Check size={18} />} text="No modules included" />}</ul><div className="mt-auto pt-8"><Link href={`/subscribe?plan=${encodeURIComponent(plan.id)}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-700">Choose this plan <ArrowRight size={16} /></Link><p className="mt-3 text-center text-xs text-slate-400">Sign in or create a workspace to continue securely.</p></div></article>;
}

function HeroSignal({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur"><div className="flex items-center gap-2 text-teal-300">{icon}<p className="text-sm font-bold text-white">{label}</p></div><p className="mt-2 text-xs leading-5 text-slate-300">{text}</p></div>; }
function TrustPoint({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="flex items-center justify-center gap-2 text-center font-semibold text-slate-600"><span className="text-teal-600">{icon}</span>{text}</div>; }
function PlanFeature({ icon, text }: { icon: React.ReactNode; text: string }) { return <li className="flex items-start gap-3 text-sm font-semibold leading-5 text-slate-700"><span className="mt-0.5 text-teal-600">{icon}</span>{text}</li>; }
function CapabilityCard({ icon: Icon, title, text }: { icon: typeof PackageCheck; title: string; text: string }) { return <article className="rounded-3xl border border-slate-200 bg-[#f7faf9] p-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-100 text-teal-700"><Icon size={21} /></span><h3 className="mt-5 text-lg font-bold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>; }
function ModuleExplanation({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><span className="text-teal-600">{icon}</span><h3 className="mt-4 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>; }
function JourneyStep({ number, title, text }: { number: string; title: string; text: string }) { return <li className="rounded-3xl bg-white p-7 shadow-sm"><p className="text-sm font-bold text-teal-700">{number}</p><h3 className="mt-6 text-xl font-bold tracking-tight">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{text}</p></li>; }
function Faq({ question, answer }: { question: string; answer: string }) { return <details className="group rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer list-none pr-8 text-sm font-bold text-slate-900 marker:hidden">{question}<span className="float-right text-xl font-normal text-teal-700 transition group-open:rotate-45">+</span></summary><p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p></details>; }
