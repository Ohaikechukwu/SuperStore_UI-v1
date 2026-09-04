import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextVitals,
  ...nextTypescript,
  {
    // Role allowlists caused three owner-lockout drifts (owner forgotten in
    // people, POS terminals, receipt voiding). Authorization must flow from
    // the backend permission context (`permission=` / `can()`), so the
    // `allowedRoles` JSX escape hatch is banned everywhere except the two
    // platform control-plane pages whose APIs are genuinely role-gated.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/platform/plans/page.tsx", "src/app/platform/payments/page.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='allowedRoles']",
          message: "allowedRoles duplicates role names and has drifted before. Gate on the backend-enforced permission code instead (PermissionGate permission=... or can(context, ...)).",
        },
      ],
    },
  },
];
