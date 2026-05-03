#!/usr/bin/env python3
"""
Debug de Agendamentos - Verificação de Vazamento entre Clínicas
Executa queries no Supabase para encontrar o problema
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("❌ psycopg2 não instalado. Instalando...")
    os.system("pip install psycopg2-binary python-dotenv")
    import psycopg2
    from psycopg2.extras import RealDictCursor

# Carregar .env.local
env_path = Path(__file__).parent / '.env.local'
load_dotenv(env_path)

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ DATABASE_URL não encontrada em .env.local")
    sys.exit(1)

PETCARE_CLINIC_ID = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6'

def print_header(title):
    print('\n' + '═' * 80)
    print(title)
    print('═' * 80)

def run_query(conn, query, params=None):
    """Executa uma query e retorna os resultados"""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or [])
            return cur.fetchall()
    except Exception as e:
        print(f"❌ Erro na query: {e}")
        return None

def main():
    try:
        # Conectar
        print("\n🔗 Conectando ao Supabase...")
        conn = psycopg2.connect(DATABASE_URL)
        print("✅ Conectado com sucesso!\n")

        # 1. Quantos agendamentos na PetCare?
        print_header("1️⃣  QUANTOS AGENDAMENTOS NA PETCARE?")
        result = run_query(conn,
            "SELECT COUNT(*) as total FROM appointments WHERE clinic_id = %s::uuid",
            [PETCARE_CLINIC_ID]
        )
        petcare_total = result[0]['total'] if result else 0
        print(f"   Total: {petcare_total}\n")

        # 2. Agendamentos por data na PetCare
        print_header("2️⃣  AGENDAMENTOS POR DATA NA PETCARE")
        result = run_query(conn,
            """SELECT DATE(appointment_datetime) as data, COUNT(*) as total
               FROM appointments
               WHERE clinic_id = %s::uuid
               GROUP BY DATE(appointment_datetime)
               ORDER BY data DESC""",
            [PETCARE_CLINIC_ID]
        )
        if not result:
            print("   ℹ️  Nenhum agendamento\n")
        else:
            for row in result:
                print(f"   📅 {row['data']}: {row['total']} agendamento(s)")
            print()

        # 3. Agendamentos para hoje na PetCare
        print_header("3️⃣  AGENDAMENTOS PARA 2026-04-16 NA PETCARE")
        result = run_query(conn,
            """SELECT COUNT(*) as total FROM appointments
               WHERE clinic_id = %s::uuid AND DATE(appointment_datetime) = '2026-04-16'""",
            [PETCARE_CLINIC_ID]
        )
        print(f"   Total: {result[0]['total'] if result else 0}\n")

        # 4. Usuários da PetCare
        print_header("4️⃣  USUÁRIOS DA PETCARE")
        result = run_query(conn,
            "SELECT id, full_name, role FROM profiles WHERE clinic_id = %s::uuid",
            [PETCARE_CLINIC_ID]
        )
        if not result:
            print("   ℹ️  Nenhum usuário\n")
        else:
            for row in result:
                print(f"   👤 {row['full_name']} ({row['role']})")
                print(f"      ID: {row['id']}\n")

        # 5. **CRÍTICA** - Qual clínica tem os 3 agendamentos?
        print_header("5️⃣  🔴 CRÍTICA: QUAL CLÍNICA TEM AGENDAMENTOS EM 2026-04-16?")
        result = run_query(conn,
            """SELECT clinic_id, COUNT(*) as total FROM appointments
               WHERE DATE(appointment_datetime) = '2026-04-16'
               GROUP BY clinic_id
               ORDER BY total DESC"""
        )
        if not result:
            print("   ℹ️  Nenhum agendamento para 2026-04-16\n")
        else:
            for row in result:
                is_petcare = row['clinic_id'] == PETCARE_CLINIC_ID
                icon = "✅" if is_petcare else "❌"
                print(f"   {icon} Clinic: {row['clinic_id']}")
                print(f"      Total: {row['total']} agendamento(s)")
                if not is_petcare:
                    print(f"      ⚠️  NÃO É A PETCARE!\n")
                else:
                    print(f"      ✅ É A PETCARE\n")

        # 6. Todas as clínicas
        print_header("6️⃣  RESUMO: TODAS AS CLÍNICAS E SEUS AGENDAMENTOS")
        result = run_query(conn,
            """SELECT c.id, c.name,
                      COUNT(a.id) as total_agendamentos,
                      COUNT(CASE WHEN DATE(a.appointment_datetime) = '2026-04-16' THEN 1 END) as agendamentos_hoje
               FROM clinics c
               LEFT JOIN appointments a ON c.id = a.clinic_id
               GROUP BY c.id, c.name
               ORDER BY total_agendamentos DESC"""
        )
        for row in result:
            is_petcare = row['id'] == PETCARE_CLINIC_ID
            icon = "⭐" if is_petcare else "  "
            print(f"   {icon} {row['name']}")
            print(f"      ID: {row['id']}")
            print(f"      Total agendamentos: {row['total_agendamentos']}")
            print(f"      Agendamentos em 2026-04-16: {row['agendamentos_hoje']}\n")

        # 7. Detalhes dos agendamentos
        print_header("7️⃣  DETALHES DOS AGENDAMENTOS DE 2026-04-16")
        result = run_query(conn,
            """SELECT a.id, c.name as clinic_name, a.clinic_id,
                      a.appointment_datetime, a.status, a.reason
               FROM appointments a
               LEFT JOIN clinics c ON a.clinic_id = c.id
               WHERE DATE(a.appointment_datetime) = '2026-04-16'
               ORDER BY a.appointment_datetime"""
        )
        if not result:
            print("   ℹ️  Nenhum agendamento\n")
        else:
            for row in result:
                print(f"   📌 Agendamento: {str(row['id'])[:8]}...")
                print(f"      Clínica: {row['clinic_name']}")
                print(f"      Data/Hora: {row['appointment_datetime']}")
                print(f"      Status: {row['status']}")
                print(f"      Razão: {row['reason']}\n")

        # CONCLUSÃO
        print_header("🎯 CONCLUSÃO")
        if petcare_total == 0:
            print("✅ PetCare está VAZIA (correto - é nova)\n")

            # Verificar qual clínica tem os 3
            result = run_query(conn,
                """SELECT clinic_id FROM appointments
                   WHERE DATE(appointment_datetime) = '2026-04-16'
                   GROUP BY clinic_id HAVING COUNT(*) = 3"""
            )
            if result:
                clinic_with_3 = result[0]['clinic_id']
                if clinic_with_3 != PETCARE_CLINIC_ID:
                    print(f"❌ Os 3 agendamentos de 2026-04-16 pertencem a OUTRA clínica!")
                    print(f"   Clinic ID: {clinic_with_3}\n")
                    print("🔴 PROBLEMA IDENTIFICADO:")
                    print("   A função getMonthAppointmentCounts() está retornando dados errados!")
                    print("   Vazamento entre clínicas confirmado!\n")
        else:
            print(f"❌ PROBLEMA: PetCare tem {petcare_total} agendamentos!")
            print("   Ela deveria estar vazia (é nova)\n")

        print('═' * 80)
        print('\n')

        conn.close()

    except Exception as e:
        print(f"\n❌ ERRO: {e}\n")
        sys.exit(1)

if __name__ == '__main__':
    main()
