import * as dotenv from 'dotenv';
import path from 'path';
import { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } from './helpers/db-seed';
import { exigirBancoDeTestes, consertarNullsDoAuth } from './helpers/auth-repair';

// Roda uma vez antes de toda a suíte. A ordem aqui não é estética:
//
// 1. `dotenv` precisa vir antes de qualquer coisa que leia env.
// 2. `exigirBancoDeTestes` aborta se o alvo for produção — o `.env.local` de
//    C:\SysMax aponta para o banco do cliente, e o seed cria clínicas e
//    usuários. Antes desta linha, nada impedia `npx jest` daquele diretório de
//    escrever lá.
// 3. `consertarNullsDoAuth` vem ANTES do seed porque o seed depende do
//    `listUsers` do Supabase, que falha inteiro ("Database error finding
//    users") se alguma linha de auth.users tiver NULL nas colunas de texto que
//    o GoTrue lê como string. Era a causa de "createUser falhou e usuário não
//    localizável" que deixava a suíte de integração sem rodar.
module.exports = async () => {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

  exigirBancoDeTestes();
  await consertarNullsDoAuth();

  await seedClinics();
  await seedUsers();
  await seedTutorsAndPets();
  await seedProductPrices();
};
