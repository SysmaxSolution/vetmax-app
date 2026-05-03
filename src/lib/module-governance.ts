import crypto from 'crypto'

/**
 * Module Governance: Verify sysmax_master_key before enabling modules.
 * Uses hashed comparison to avoid exposing raw key in code/logs.
 */

const MASTER_KEY_ENV = process.env.SYSMAX_MASTER_KEY || ''
const MASTER_KEY_HASH = crypto.createHash('sha256').update(MASTER_KEY_ENV).digest('hex')

export interface ModuleGovernanceConfig {
  masterKey?: string
  allowedModules?: string[]
  requireVerification?: boolean
}

/**
 * Verify master key against hashed environment value.
 * Returns true if:
 *  - masterKey matches SYSMAX_MASTER_KEY env
 *  - OR process.env.NODE_ENV === 'development' && no env key set
 */
export function verifyMasterKey(providedKey?: string): boolean {
  if (!providedKey) return false

  const providedHash = crypto.createHash('sha256').update(providedKey).digest('hex')

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(MASTER_KEY_HASH))
}

/**
 * Check if user can enable a specific module.
 * Must pass:
 *  1. Master key verification (if requireVerification = true)
 *  2. User must be clinic admin/owner
 *  3. Module must be in allowedModules list (if whitelist set)
 */
export function canEnableModule(
  userRole: string,
  moduleName: string,
  options: ModuleGovernanceConfig = {}
): { allowed: boolean; reason?: string } {
  // 1. Check role
  if (!['admin', 'owner'].includes(userRole)) {
    return { allowed: false, reason: 'Apenas admins/donos podem habilitar módulos' }
  }

  // 2. Check whitelist (if set)
  const whitelist = options.allowedModules || [
    'reception',
    'triage',
    'consultation',
    'exams',
    'pharmacy',
    'billing',
    'grooming',
    'insurance',
    'hospitalization',
  ]

  if (!whitelist.includes(moduleName)) {
    return { allowed: false, reason: `Módulo "${moduleName}" não permitido` }
  }

  // 3. Check master key if verification required
  if (options.requireVerification && !verifyMasterKey(options.masterKey)) {
    return { allowed: false, reason: 'Chave mestra inválida' }
  }

  return { allowed: true }
}

/**
 * Middleware/helper for Next.js route protection.
 * Blocks module enable if master key validation fails.
 */
export function moduleGovernanceMiddleware(
  req: Request,
  userRole: string,
  requestedModule: string,
  masterKey?: string
): { blocked: boolean; reason?: string } {
  const result = canEnableModule(userRole, requestedModule, {
    masterKey,
    requireVerification: process.env.MODULE_GOVERNANCE_STRICT === 'true',
  })

  if (!result.allowed) {
    return { blocked: true, reason: result.reason }
  }

  return { blocked: false }
}

/**
 * Hash a master key for storage/comparison.
 * Use this to pre-hash environment keys during setup.
 */
export function hashMasterKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}
