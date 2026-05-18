"""
Gera o PDF do release Conciliação de Convênios Petlove a partir
dos dois Markdown em Marketing/.
"""
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from pathlib import Path

OUT = Path(r'C:\SysMax\Marketing\Conciliacao-Petlove-Release.pdf')
MARKETING = Path(r'C:\SysMax\Marketing')

PURPLE = HexColor('#7c3aed')
PURPLE_LIGHT = HexColor('#f3e8ff')
EMERALD = HexColor('#10b981')
AMBER = HexColor('#f59e0b')
SLATE_900 = HexColor('#0f172a')
SLATE_600 = HexColor('#475569')
SLATE_300 = HexColor('#cbd5e1')

styles = getSampleStyleSheet()

style_h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Helvetica-Bold',
                          fontSize=24, leading=30, textColor=PURPLE,
                          spaceBefore=0, spaceAfter=10, alignment=TA_LEFT)
style_h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Helvetica-Bold',
                          fontSize=16, leading=20, textColor=SLATE_900,
                          spaceBefore=18, spaceAfter=8)
style_h3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName='Helvetica-Bold',
                          fontSize=12, leading=15, textColor=PURPLE,
                          spaceBefore=12, spaceAfter=4)
style_body = ParagraphStyle('Body', parent=styles['BodyText'], fontName='Helvetica',
                            fontSize=10.5, leading=15, textColor=SLATE_900,
                            spaceAfter=6, alignment=TA_LEFT)
style_small = ParagraphStyle('Small', parent=styles['BodyText'], fontName='Helvetica-Oblique',
                             fontSize=9, leading=12, textColor=SLATE_600, alignment=TA_CENTER)
style_list = ParagraphStyle('List', parent=style_body, leftIndent=15, bulletIndent=4)

def md_to_paragraphs(md: str, story: list):
    """Conversor minimalista de Markdown → ReportLab Paragraphs."""
    lines = md.split('\n')
    in_table = False
    table_rows: list[list[str]] = []

    def flush_table():
        nonlocal table_rows
        if not table_rows:
            return
        rows = [[Paragraph(c, style_body) for c in r] for r in table_rows]
        tbl = Table(rows, colWidths=[7*cm, 9*cm])
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), PURPLE),
            ('TEXTCOLOR',  (0,0), (-1,0), white),
            ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID',       (0,0), (-1,-1), 0.5, SLATE_300),
            ('VALIGN',     (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING',(0,0), (-1,-1), 6),
            ('TOPPADDING',  (0,0), (-1,-1), 4),
            ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 0.4*cm))
        table_rows = []

    for raw in lines:
        line = raw.rstrip()

        # Tabela markdown
        if line.startswith('|'):
            # Separador --- pula
            if re.match(r'^\|[\s\-:|]+\|?\s*$', line):
                continue
            cells = [c.strip() for c in line.strip('|').split('|')]
            cells = [_inline(c) for c in cells]
            table_rows.append(cells)
            in_table = True
            continue
        else:
            if in_table:
                flush_table()
                in_table = False

        if not line.strip():
            story.append(Spacer(1, 0.18*cm))
            continue

        if line.startswith('# '):
            story.append(Paragraph(_inline(line[2:]), style_h1))
        elif line.startswith('## '):
            story.append(Paragraph(_inline(line[3:]), style_h2))
        elif line.startswith('### '):
            story.append(Paragraph(_inline(line[4:]), style_h3))
        elif line.startswith('---'):
            story.append(Spacer(1, 0.2*cm))
            story.append(Table([['']], colWidths=[17*cm],
                style=TableStyle([('LINEABOVE',(0,0),(-1,0),0.7,SLATE_300)])))
            story.append(Spacer(1, 0.2*cm))
        elif line.lstrip().startswith(('- ', '* ', '✅', '✓ ', '🟣', '📍', '⚠', '💡', '❓', '🟡')):
            bullet = line.lstrip()
            story.append(Paragraph('• ' + _inline(bullet[2:] if bullet[:2] in ('- ','* ') else bullet), style_list))
        elif re.match(r'^\d+⃣', line.strip()) or re.match(r'^\d+️⃣', line.strip()):
            # passos numerados visuais — trata como H3
            story.append(Paragraph(_inline(line.strip()), style_h3))
        elif line.startswith('> '):
            story.append(_callout(line[2:], 'info'))
        else:
            story.append(Paragraph(_inline(line), style_body))

    if in_table:
        flush_table()

def _inline(text: str) -> str:
    # bold **x**
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # italic *x*  (cuidado para não conflitar com **)
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    # code `x`
    text = re.sub(r'`([^`]+)`', r'<font face="Courier" color="#7c3aed">\1</font>', text)
    return text

def _callout(text: str, tone: str):
    color = AMBER if tone in ('warn', 'info') else EMERALD
    bg = HexColor('#fef3c7' if tone in ('warn','info') else '#d1fae5')
    p = Paragraph(_inline(text), style_body)
    tbl = Table([[p]], colWidths=[17*cm])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING',(0,0), (-1,-1), 12),
        ('TOPPADDING',  (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('LINEBEFORE',  (0,0), (0,-1), 3, color),
    ]))
    return tbl

def build_pdf():
    doc = SimpleDocTemplate(str(OUT), pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm,
                            title='Conciliação Petlove — Release & Guia',
                            author='Sysmax Solutions')
    story = []

    release_md = (MARKETING / 'release-conciliacao-petlove.md').read_text(encoding='utf-8')
    guia_md = (MARKETING / 'guia-pratico-petlove.md').read_text(encoding='utf-8')

    md_to_paragraphs(release_md, story)
    story.append(PageBreak())
    md_to_paragraphs(guia_md, story)

    doc.build(story)
    print(f'PDF gerado: {OUT}')
    print(f'Tamanho: {OUT.stat().st_size / 1024:.1f} KB')

if __name__ == '__main__':
    build_pdf()
