# Modulo Medico Veterinario — regras do modulo

Detalhamento das regras 2 (integridade clinica) e 3 (legal/CFMV) do `CLAUDE.md`
da raiz. Este modulo tem exigencia legal: erro aqui e risco de conformidade,
nao apenas defeito de software.

## Integridade clinica (regra 2)

A cadeia e **Tutor -> Pet -> Consulta**, nessa ordem. Nao existe consulta sem
pet, nem pet sem tutor. Nao crie atalho que instancie consulta solta.

Triagem exige `weight_kg` e `temperature_rectal`. Sem os dois, a triagem nao
esta completa — o peso e insumo de calculo de dose.

## Legal / CFMV (regra 3)

- **Prontuario so fecha com `is_reviewed_by_vet`.** O registro clinico e
  responsabilidade do Medico Veterinario; nenhum fluxo automatico, nem de IA,
  pode marcar isso em nome dele.
- **Prontuario fechado e imutavel.** Correcao posterior entra como adendo
  datado, nunca como edicao do registro original.
- **Medicamento controlado exige sinalizacao de Receituario Azul** na emissao.

## IA neste modulo e ESCRIBA, nunca diagnostica

Transcricao e sugestao de texto sao auxilio de redacao. Qualquer saida de modelo
passa por revisao humana do MV antes de entrar no prontuario como definitiva.
Nao adicione fluxo que grave conteudo gerado direto no registro clinico.

## Fluxo express

Ha um bypass legitimo do prontuario completo para atendimento pontual
(microchipagem, por exemplo): `visit_reason` + early-return no
`ConsultationDetail` + action atomica. Nao confunda com burlar a revisao do MV —
o express reduz etapas de digitacao, nao a responsabilidade tecnica.
