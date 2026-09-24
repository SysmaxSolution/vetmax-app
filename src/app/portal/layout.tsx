// Layout raiz do Portal do Tutor.
//
// Deliberadamente VAZIO de moldura: o cabeçalho, o rodapé e as cores dependem
// da clínica em contexto, e o contexto só é conhecido nos ramos abaixo
// (`/portal/c/<slug>` e `/portal/pet/<id>`). Cada ramo monta a sua própria
// `PortalShell` com a marca certa — se a moldura ficasse aqui, o portal da
// clínica A apareceria com o cabeçalho genérico por cima.

export const metadata = { title: 'Área do Tutor | SysVetMax' }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
