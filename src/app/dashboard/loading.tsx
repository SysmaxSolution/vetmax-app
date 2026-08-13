/**
 * /dashboard é um redirect por papel (recepção/vet/triagem/farmácia) — este
 * boundary cobre a espera da resolução do redirect e as rotas filhas que
 * ainda não têm loading.tsx próprio. A silhueta é a da tela de chegada
 * (Recepção), que também serve de esqueleto genérico (cards + linhas).
 */
export { default } from './reception/loading'
