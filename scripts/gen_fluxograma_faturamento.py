# -*- coding: utf-8 -*-
"""
Gera o PDF do fluxograma 'Comportamento do Orçamento por Módulo' (Sprint Faturamento).
Saída vetorial nativa via matplotlib.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon, Rectangle
from matplotlib.backends.backend_pdf import PdfPages

# Paleta
C_START   = "#1d4ed8"   # azul
C_PROCESS = "#0f766e"   # teal
C_DECISION= "#b45309"   # amber escuro
C_DECISION_BG = "#fffbeb"
C_OK      = "#15803d"   # verde
C_END     = "#7c3aed"   # roxo
C_CANCEL  = "#b91c1c"   # vermelho
C_TEXT    = "#0f172a"
C_MUTED   = "#475569"

def box(ax, x, y, w, h, text, fc, ec=None, tc="white", fs=8.5, rounded=True):
    ec = ec or fc
    style = "round,pad=0.02,rounding_size=0.06" if rounded else "square,pad=0.02"
    p = FancyBboxPatch((x - w/2, y - h/2), w, h, boxstyle=style,
                       linewidth=1.2, facecolor=fc, edgecolor=ec, zorder=3)
    ax.add_patch(p)
    ax.text(x, y, text, ha="center", va="center", color=tc, fontsize=fs,
            zorder=4, wrap=True, fontweight="medium")
    return (x, y, w, h)

def diamond(ax, x, y, w, h, text, fs=8.0):
    pts = [(x, y + h/2), (x + w/2, y), (x, y - h/2), (x - w/2, y)]
    poly = Polygon(pts, closed=True, facecolor=C_DECISION_BG,
                   edgecolor=C_DECISION, linewidth=1.4, zorder=3)
    ax.add_patch(poly)
    ax.text(x, y, text, ha="center", va="center", color=C_DECISION,
            fontsize=fs, zorder=4, fontweight="bold")
    return (x, y, w, h)

def arrow(ax, p1, p2, label=None, color=C_MUTED, lx=0, ly=0, rad=0.0):
    a = FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=12,
                        linewidth=1.3, color=color, zorder=2,
                        connectionstyle=f"arc3,rad={rad}")
    ax.add_patch(a)
    if label:
        mx, my = (p1[0]+p2[0])/2 + lx, (p1[1]+p2[1])/2 + ly
        ax.text(mx, my, label, ha="center", va="center", fontsize=7.2,
                color=color, zorder=5,
                bbox=dict(boxstyle="round,pad=0.18", fc="white", ec="none", alpha=0.95))

# ───────────────────────── PÁGINA 1: FLUXOGRAMA ─────────────────────────
def page_flow(pdf):
    fig, ax = plt.subplots(figsize=(8.27, 11.69))  # A4 retrato
    ax.set_xlim(0, 100); ax.set_ylim(0, 140); ax.axis("off")

    # Título
    ax.text(50, 136, "Fluxograma — Comportamento do Orçamento por Módulo",
            ha="center", va="center", fontsize=14.5, fontweight="bold", color=C_TEXT)
    ax.text(50, 132, "VetMax · Módulo Faturamento (Orçamento de Serviços + NFS-e)",
            ha="center", va="center", fontsize=9.5, color=C_MUTED)

    # Faixa lateral com nome do módulo de cada etapa
    def lane(y, label):
        ax.text(3, y, label, ha="left", va="center", fontsize=7.5,
                color=C_MUTED, fontweight="bold", rotation=0)

    BW, BH = 46, 7   # box padrão
    cx = 56          # coluna central

    # 1. Criação (Faturamento)
    lane(124, "FATURAMENTO")
    b1 = box(ax, cx, 124, BW, BH, "+ Novo Documento → cria ORÇAMENTO (rascunho)\nnúmero atômico ORC-AAAA-NNNN", C_START)

    # Decisão enviar ao tutor
    d1 = diamond(ax, cx, 114, 22, 9, "Enviar ao\ntutor?")
    arrow(ax, (cx, 124-BH/2), (cx, 114+9/2))

    # Orçamento 'sent'
    b2 = box(ax, cx, 104, BW, BH, "Orçamento 'enviado' (sem compromisso)\nPDF por WhatsApp ao tutor", C_PROCESS)
    arrow(ax, (cx, 114-9/2), (cx, 104+BH/2), "Sim (WhatsApp PDF)", lx=18, ly=1)
    arrow(ax, (cx-11, 114), (cx-30, 114), "Não", lx=0, ly=1.4)
    arrow(ax, (cx-30, 114), (cx-30, 104), color=C_MUTED)
    arrow(ax, (cx-30, 104), (cx-BW/2, 104), color=C_MUTED)

    # Decisão comparece
    d2 = diamond(ax, cx, 93, 24, 9, "Tutor\ncomparece?")
    arrow(ax, (cx, 104-BH/2), (cx, 93+9/2))

    # Cancelado / expirado
    bC = box(ax, 90, 93, 16, 8, "Cancelado /\nExpirado", C_CANCEL, fs=8)
    arrow(ax, (cx+12, 93), (90-16/2, 93), "Não / expira", lx=-2, ly=1.4, color=C_CANCEL)

    # Recepção
    lane(82, "RECEPÇÃO")
    b3 = box(ax, cx, 82, BW, BH, "Busca tutor/pet exibe BADGE 'N orçamentos\npendentes' → lista no perfil do tutor", C_PROCESS)
    arrow(ax, (cx, 93-9/2), (cx, 82+BH/2), "Sim", lx=4, ly=1)

    # Check-in
    lane(71, "CHECK-IN")
    b4 = box(ax, cx, 71, BW, BH, "Seleciona 1+ orçamentos → itens entram em\nconsultation_services · vincula consultation_id", C_PROCESS)
    arrow(ax, (cx, 82-BH/2), (cx, 71+BH/2))

    # Triagem/Consultório
    lane(60, "TRIAGEM / CONSULTÓRIO")
    b5 = box(ax, cx, 60, BW, BH, "Exibe Nº do Orçamento no cabeçalho do pet\nMV edita preços / adiciona itens", C_PROCESS)
    arrow(ax, (cx, 71-BH/2), (cx, 60+BH/2))

    # Cirurgia/Internação
    lane(49, "CIRURGIA / INTERNAÇÃO")
    b6 = box(ax, cx, 49, BW, BH, "Herdam serviços (mesmo consultation_services)\nSomam diárias / itens adicionais", C_PROCESS)
    arrow(ax, (cx, 60-BH/2), (cx, 49+BH/2))

    # Caixa
    lane(38, "CAIXA")
    b7 = box(ax, cx, 38, BW, BH, "Recebimento (processSplitPayment)\nBaixa de estoque SÓ de itens físicos", C_PROCESS)
    arrow(ax, (cx, 49-BH/2), (cx, 38+BH/2))

    # Validação tutor (gate)
    bV = box(ax, cx, 30, BW, 6, "GATE: cadastro do tutor completo p/ nota?\n(alerta antes do fechamento)", C_DECISION, ec=C_DECISION, tc="white", fs=7.6)
    arrow(ax, (cx, 38-BH/2), (cx, 30+3))

    # Baixa automática
    b8 = box(ax, cx, 22, BW, 6.5, "BAIXA AUTOMÁTICA do orçamento\nis_billed = true · status 'faturado'", C_OK, fs=8)
    arrow(ax, (cx, 30-3), (cx, 22+6.5/2))

    # Decisão config fiscal
    d3 = diamond(ax, cx, 13.5, 24, 8, "Config fiscal\nválida?")
    arrow(ax, (cx, 22-6.5/2), (cx, 13.5+8/2))

    # Faturado sem nota
    bL = box(ax, 22, 13.5, 22, 7, "Faturado SEM nota", C_OK, fs=8)
    arrow(ax, (cx-12, 13.5), (22+22/2, 13.5), "Não", lx=0, ly=1.3)

    # Decisão emitir
    d4 = diamond(ax, cx, 5.5, 22, 7.5, "Emitir\nNFS-e?")
    arrow(ax, (cx, 13.5-8/2), (cx, 5.5+7.5/2), "Sim", lx=3, ly=0.6)
    arrow(ax, (cx, 5.5), (22, 5.5), "Não", lx=0, ly=1.2)
    arrow(ax, (22, 5.5), (22, 13.5-7/2), color=C_MUTED)

    # NFS-e
    bN = box(ax, 90, 5.5, 16, 8, "NFS-e via gateway\nrelated_id = orçamento", C_END, fs=7.6)
    arrow(ax, (cx+11, 5.5), (90-16/2, 5.5), "Sim", lx=0, ly=1.2, color=C_END)

    # Feed do pet (destino comum) — seta de bL e bN para um nó textual
    ax.text(50, 1.2, "→ Feed do Pet: documento (O.S./NFS-e) vinculado — abrir · baixar · enviar por WhatsApp",
            ha="center", va="center", fontsize=7.8, color=C_END, fontweight="bold",
            bbox=dict(boxstyle="round,pad=0.3", fc="#f5f3ff", ec=C_END, lw=1))

    # Legenda
    ly0 = 130
    items = [("Início", C_START), ("Processo", C_PROCESS), ("Decisão", C_DECISION),
             ("Conclusão OK", C_OK), ("NFS-e", C_END), ("Cancelado", C_CANCEL)]
    x0 = 6
    for i,(lab,col) in enumerate(items):
        ax.add_patch(Rectangle((x0+i*15.5, ly0), 1.6, 1.6, facecolor=col, edgecolor="none"))
        ax.text(x0+i*15.5+2.2, ly0+0.8, lab, ha="left", va="center", fontsize=6.8, color=C_MUTED)

    pdf.savefig(fig, bbox_inches="tight"); plt.close(fig)

# ───────────────────────── PÁGINA 2: EXPLICAÇÃO ─────────────────────────
def page_explain(pdf):
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    ax.set_xlim(0, 100); ax.set_ylim(0, 140); ax.axis("off")
    ax.text(50, 136, "Comportamento do Orçamento em cada Módulo",
            ha="center", va="center", fontsize=14, fontweight="bold", color=C_TEXT)

    rows = [
        ("FATURAMENTO (módulo novo)",
         "Criação do documento (+ Novo Documento), listagem do mês com filtros (data inicial/final, "
         "tutor/pet, profissional, nº do documento, espécie), detalhamento em tela, geração de PDF, "
         "cancelamento e baixa manual. Espécie = Orçamento de Serviços ou Nota Fiscal de Serviços."),
        ("RECEPÇÃO",
         "Ao buscar tutor/pet, exibe badge com a quantidade de orçamentos ainda não faturados. "
         "Clicando, abre a lista com as mesmas colunas do módulo Faturamento."),
        ("CHECK-IN",
         "Se o pet/tutor tiver orçamentos em aberto, permite selecionar um ou mais. Os serviços do "
         "orçamento são incluídos no atendimento (consultation_services) e o orçamento é vinculado à consulta."),
        ("TRIAGEM / CONSULTÓRIO",
         "Junto às informações do pet (nome, telefone, foto) é exibido o Nº do Orçamento. "
         "Os serviços já aparecem carregados; o Médico Veterinário pode alterar preços ou adicionar itens."),
        ("CENTRO CIRÚRGICO / INTERNAÇÃO",
         "Herdam os serviços do orçamento (derivam do mesmo atendimento). Diárias e itens adicionais "
         "são somados normalmente, mantendo o vínculo ao orçamento."),
        ("CAIXA",
         "No recebimento, faz a BAIXA AUTOMÁTICA do orçamento (marca como faturado). A baixa de estoque "
         "ocorre SOMENTE para itens físicos inventariáveis (serviços não mexem no estoque). Se a config "
         "fiscal estiver válida, pergunta 'Deseja emitir Nota Fiscal de Serviço?'. ANTES do fechamento, "
         "alerta o operador caso o cadastro do tutor esteja incompleto para emissão de nota."),
        ("FEED DO PET",
         "Todo documento gerado (Orçamento ou NFS-e) é vinculado ao feed do pet, permitindo abrir, "
         "baixar ou enviar como anexo PDF via WhatsApp."),
        ("NFS-e (Fase 3 · gateway agregador)",
         "Emissão via gateway (PlugNotas/Focus NFe) com validador pré-emissão (CNAE, código de serviço, "
         "alíquota ISS, RPS e numeração) para evitar rejeição e duplicidade. A NFS-e referencia o "
         "orçamento de origem (e vice-versa) na coluna 'Documento faturado/anterior'."),
    ]

    y = 128
    for title, desc in rows:
        ax.add_patch(FancyBboxPatch((4, y-1.2), 92, 2.6, boxstyle="round,pad=0.1,rounding_size=0.2",
                     facecolor="#eff6ff", edgecolor="#bfdbfe", linewidth=0.8))
        ax.text(6, y, title, ha="left", va="center", fontsize=9.5, fontweight="bold", color=C_START)
        # wrap descrição
        import textwrap
        wrapped = textwrap.fill(desc, width=104)
        nlines = wrapped.count("\n") + 1
        ax.text(6, y-3.0, wrapped, ha="left", va="top", fontsize=8.0, color=C_TEXT, linespacing=1.35)
        y -= (3.2 + nlines*2.55 + 1.6)

    ax.text(50, 3, "Desenvolvido por Sysmax Software", ha="center", va="center",
            fontsize=8, color=C_MUTED, style="italic")
    pdf.savefig(fig, bbox_inches="tight"); plt.close(fig)

out = r"C:\SysMax\Fluxograma_Faturamento_Orcamento.pdf"
with PdfPages(out) as pdf:
    page_flow(pdf)
    page_explain(pdf)
print("OK:", out)
