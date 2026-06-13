import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─── REGRA DE SEGURANÇA: bloqueia admin client em server actions ──────────────
// As server actions usam admin client (service_role) que bypassa RLS.
// O isolamento multi-tenant depende de WHERE clinic_id manual em cada query.
// Esta regra impede que novos arquivos usem o padrão inseguro.
//
// Severidade: "warn" — cobre os 93 arquivos legados sem quebrar o build agora.
// Meta: migrar actions para um data layer que injete clinic_id obrigatoriamente,
// e então escalar para "error" bloqueando CI.
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
