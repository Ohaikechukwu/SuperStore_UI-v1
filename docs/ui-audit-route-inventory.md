# Route inventory — UI audit, 9 September 2026

This is a static inventory of all 90 route files, not an assertion that all 90 have passed manual visual review. Counts are source-level review candidates. Controls inside composed field components may already have valid labels.

“Sampled” means desktop/mobile fixture coverage in the browser audit. “Error state” means report requests were deliberately rejected. All other routes require browser/workflow review. The 404 fallback was also browser-tested but is not a page route below.

See [findings and release criteria](ui-audit-2026-09-09.md).

| Route | Browser coverage | Legacy overlays | Controls to review | Browser prompts |
| --- | --- | ---: | ---: | ---: |
| `/a/[adminPublicId]/login` | Source inventory only | 0 | 0 | 0 |
| `/accounting` | Sampled | 6 | 15 | 1 |
| `/billing/status` | Source inventory only | 0 | 2 | 0 |
| `/change-password` | Source inventory only | 0 | 0 | 0 |
| `/contacts` | Sampled | 1 | 1 | 0 |
| `/crm` | Source inventory only | 0 | 8 | 0 |
| `/expenses` | Source inventory only | 1 | 2 | 0 |
| `/forgot-password` | Source inventory only | 0 | 0 | 0 |
| `/hospital/appointments` | Source inventory only | 2 | 8 | 2 |
| `/hospital/availability` | Source inventory only | 1 | 5 | 0 |
| `/hospital/billing-settings` | Source inventory only | 0 | 0 | 0 |
| `/hospital/clinical` | Source inventory only | 1 | 0 | 0 |
| `/hospital/communication-settings` | Source inventory only | 0 | 0 | 0 |
| `/hospital/communications` | Source inventory only | 2 | 8 | 0 |
| `/hospital/contacts` | Source inventory only | 1 | 6 | 0 |
| `/hospital/discharge` | Source inventory only | 1 | 0 | 0 |
| `/hospital/documents` | Source inventory only | 1 | 6 | 0 |
| `/hospital/emergency` | Source inventory only | 1 | 6 | 1 |
| `/hospital/hmo-verifications` | Source inventory only | 1 | 0 | 0 |
| `/hospital/insurance-claims` | Source inventory only | 0 | 3 | 0 |
| `/hospital/insurance` | Source inventory only | 1 | 7 | 0 |
| `/hospital/maternity` | Source inventory only | 1 | 10 | 0 |
| `/hospital/medications` | Source inventory only | 1 | 6 | 0 |
| `/hospital/nursing` | Source inventory only | 1 | 5 | 0 |
| `/hospital` | Sampled | 4 | 4 | 1 |
| `/hospital/patient-accounts` | Source inventory only | 0 | 0 | 0 |
| `/hospital/payment-verifications` | Source inventory only | 0 | 0 | 1 |
| `/hospital/problems` | Source inventory only | 1 | 5 | 0 |
| `/hospital/providers` | Source inventory only | 0 | 0 | 0 |
| `/hospital/queue` | Source inventory only | 0 | 0 | 0 |
| `/hospital/radiology-approval` | Source inventory only | 0 | 0 | 0 |
| `/hospital/radiology` | Source inventory only | 1 | 1 | 0 |
| `/hospital/referrals` | Source inventory only | 0 | 1 | 0 |
| `/hospital/reports` | Source inventory only | 0 | 1 | 0 |
| `/hospital/schedule` | Source inventory only | 1 | 1 | 0 |
| `/hospital/theatre` | Source inventory only | 1 | 8 | 1 |
| `/hospital/treatment-plans` | Source inventory only | 1 | 5 | 0 |
| `/hospital/wallets` | Source inventory only | 0 | 1 | 0 |
| `/inventory` | Sampled | 2 | 8 | 0 |
| `/laboratory` | Source inventory only | 3 | 5 | 0 |
| `/laboratory/quality-control` | Source inventory only | 1 | 6 | 0 |
| `/laboratory/specimens` | Source inventory only | 0 | 2 | 1 |
| `/login` | Source inventory only | 0 | 0 | 0 |
| `/messages` | Source inventory only | 0 | 0 | 0 |
| `/` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/activate` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/appointments/manage` | Source inventory only | 1 | 0 | 1 |
| `/patient-portal/appointments` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/care` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/documents` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/family/[dependentId]` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/family` | Source inventory only | 0 | 0 | 1 |
| `/patient-portal/invoices/[invoiceId]` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/invoices` | Source inventory only | 2 | 0 | 0 |
| `/patient-portal/messages` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/payment-settings` | Source inventory only | 0 | 0 | 0 |
| `/patient-portal/profile` | Source inventory only | 0 | 10 | 0 |
| `/patient-portal/refills` | Source inventory only | 0 | 2 | 0 |
| `/patient-portal/wallet` | Source inventory only | 1 | 1 | 0 |
| `/payroll` | Source inventory only | 1 | 0 | 0 |
| `/people` | Source inventory only | 1 | 1 | 0 |
| `/pharmacy` | Source inventory only | 4 | 7 | 3 |
| `/platform/activity` | Source inventory only | 0 | 0 | 0 |
| `/platform/command-center` | Source inventory only | 0 | 0 | 0 |
| `/platform` | Source inventory only | 5 | 7 | 0 |
| `/platform/payments` | Source inventory only | 0 | 1 | 0 |
| `/platform/plans` | Source inventory only | 0 | 0 | 0 |
| `/platform/store-nodes` | Source inventory only | 0 | 0 | 0 |
| `/platform/tenant-portals` | Source inventory only | 0 | 0 | 0 |
| `/platform/tenants` | Source inventory only | 0 | 0 | 0 |
| `/pos` | Sampled | 8 | 17 | 0 |
| `/pricing` | Source inventory only | 0 | 0 | 0 |
| `/products` | Sampled | 0 | 0 | 0 |
| `/purchasing` | Sampled | 4 | 34 | 0 |
| `/reports` | Error state | 0 | 0 | 0 |
| `/reset-password` | Source inventory only | 0 | 0 | 0 |
| `/returns` | Source inventory only | 1 | 3 | 0 |
| `/security` | Source inventory only | 1 | 1 | 0 |
| `/settings/hmo` | Source inventory only | 0 | 1 | 0 |
| `/settings` | Sampled | 4 | 4 | 0 |
| `/settings/payment` | Source inventory only | 0 | 0 | 0 |
| `/signup` | Source inventory only | 0 | 0 | 0 |
| `/stock` | Source inventory only | 0 | 0 | 0 |
| `/subscribe` | Source inventory only | 0 | 0 | 0 |
| `/sync` | Source inventory only | 0 | 0 | 0 |
| `/t/[tenantPublicId]/login` | Source inventory only | 0 | 0 | 0 |
| `/t/[tenantPublicId]/logout` | Source inventory only | 0 | 0 | 0 |
| `/terminal-sessions` | Source inventory only | 1 | 1 | 0 |
| `/verify-email` | Source inventory only | 0 | 0 | 0 |
