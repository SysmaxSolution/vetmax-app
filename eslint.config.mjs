import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─── REGRA DE SEGURANÇA: bloqueia admin client em server actions ──────────────
// As server actions usam admin client (service_role) que bypassa RLS.
// O isolamento multi-tenant depende de WHERE clinic_id manual em cada query.
//
// Auditoria 2026-06-12 (LLM Council): todos os 89 arquivos já filtram por
// clinic_id corretamente. O uso remanescente de createAdminClient é legítimo
// (queries que exigem bypassar RLS) e obtém clinicId via getTenantCtx() antes.
//
// Severidade do import: "warn" — sinal de code review para novas adições.
// Severidade mantida em "warn": admin.from('profiles').eq('clinic_id', x) é
// uso legítimo (lista colaboradores — RLS não permite ler outros perfis).
// O antipadrão admin.from('profiles').eq('id', userId) já foi eliminado em
// financial.ts, billing.ts, consultations.ts, petlove-glosas.ts (2026-06-12).
// Ver: tests/integration/cross-tenant-isolation.test.ts
const adminClientRule = {
  files: ["src/lib/actions/**/*.ts", "src/app/api/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "warn",
      {
        patterns: [
          {
            group: ["**/supabase/admin", "@/lib/supabase/admin"],
            message:
              "[SECURITY] server actions não devem importar createAdminClient diretamente. " +
              "Para obter o clinic_id do usuário: use requireTenantCtx() de @/lib/data/context (RLS, sem admin). " +
              "Para queries que precisam bypassar RLS: crie o admin DEPOIS de obter clinicId via getTenantCtx(), " +
              "sempre incluindo .eq('clinic_id', clinicId). TC-CROSS-09 em tests/integration/cross-tenant-isolation.test.ts.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  adminClientRule,
]);

export default eslintConfig;
