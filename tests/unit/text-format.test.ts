import {
  escapeHtml, parseInlineMarkdown, getListPrefix, splitIntoTopics,
} from '@/lib/canva/text-format'

describe('text-format', () => {
  describe('escapeHtml', () => {
    it('escapa < > & " e \'', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
      expect(escapeHtml("o' & ello")).toBe('o&#39; &amp; ello')
    })
  })

  describe('parseInlineMarkdown', () => {
    it('aplica negrito', () => {
      expect(parseInlineMarkdown('texto **importante** aqui'))
        .toBe('texto <strong>importante</strong> aqui')
    })
    it('aplica italico (com lookbehind para não conflitar com bold)', () => {
      expect(parseInlineMarkdown('texto *destaque* aqui'))
        .toBe('texto <em>destaque</em> aqui')
    })
    it('preserva negrito quando dentro de palavra com asteriscos múltiplos', () => {
      // **bold** não vira *italic*bold*italic*
      expect(parseInlineMarkdown('**negrito**'))
        .toBe('<strong>negrito</strong>')
    })
    it('aplica sublinhado', () => {
      expect(parseInlineMarkdown('texto __sublinhado__ ok'))
        .toBe('texto <u>sublinhado</u> ok')
    })
    it('aplica tachado', () => {
      expect(parseInlineMarkdown('texto ~~tachado~~ ok'))
        .toBe('texto <s>tachado</s> ok')
    })
    it('combina os 4 estilos numa frase', () => {
      const out = parseInlineMarkdown('**B** *I* __U__ ~~S~~')
      expect(out).toBe('<strong>B</strong> <em>I</em> <u>U</u> <s>S</s>')
    })
    it('escapa HTML antes do parse — não permite injeção', () => {
      expect(parseInlineMarkdown('<script>alert(1)</script>'))
        .toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    })
    it('converte quebras de linha em <br>', () => {
      expect(parseInlineMarkdown('linha 1\nlinha 2'))
        .toBe('linha 1<br>linha 2')
    })
    it('aceita string vazia', () => {
      expect(parseInlineMarkdown('')).toBe('')
    })
  })

  describe('getListPrefix', () => {
    it('decimal usa número 1-indexado', () => {
      expect(getListPrefix('decimal', 1)).toBe('1.')
      expect(getListPrefix('decimal', 7)).toBe('7.')
    })
    it('bullet é •', () => {
      expect(getListPrefix('bullet', 1)).toBe('•')
    })
    it('dash, arrow, check', () => {
      expect(getListPrefix('dash', 1)).toBe('–')
      expect(getListPrefix('arrow', 1)).toBe('→')
      expect(getListPrefix('check', 1)).toBe('✓')
    })
    it('custom usa listChar, fallback para • quando vazio', () => {
      expect(getListPrefix('custom', 1, '🐾')).toBe('🐾')
      expect(getListPrefix('custom', 1, '')).toBe('•')
      expect(getListPrefix('custom', 1, '   ')).toBe('•')
    })
    it('none retorna string vazia', () => {
      expect(getListPrefix('none', 1)).toBe('')
    })
  })

  describe('splitIntoTopics', () => {
    it('divide por \\n e ignora linhas vazias', () => {
      expect(splitIntoTopics('a\n\nb\nc\n\n'))
        .toEqual(['a', 'b', 'c'])
    })
    it('trim em cada linha', () => {
      expect(splitIntoTopics('  topico 1\n  topico 2  '))
        .toEqual(['topico 1', 'topico 2'])
    })
    it('string vazia → array vazio', () => {
      expect(splitIntoTopics('')).toEqual([])
    })
  })
})
