import { prismaCrdb } from '@/lib/prisma-crdb'
import type { VaultScope, WalletAccountPolicy, XrplKeyType, XrplEnvSignerRole } from '@/lib/signing/types'
import { prepareManagedXrplWalletProvisioning } from '@/services/signer.service'

type ProvisionRole = Exclude<XrplEnvSignerRole, 'default'>

type ProvisionConfig = {
  role: ProvisionRole
  seed: string
  keyType: XrplKeyType
  networkId: string | null
  vaultId: VaultScope
  dryRun: boolean
  policy: Partial<WalletAccountPolicy>
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function readRole(): ProvisionRole {
  const raw = readArg('--role')?.trim() || process.env.XRPL_PROVISION_ROLE?.trim() || 'distributor'
  if (raw === 'issuer' || raw === 'distributor') {
    return raw
  }
  throw new Error('XRPL provision role must be issuer or distributor')
}

function readKeyType(): XrplKeyType {
  const raw = readArg('--key-type')?.trim() || process.env.XRPL_PROVISION_KEY_TYPE?.trim() || 'ed25519'
  if (raw === 'ed25519' || raw === 'secp256k1') {
    return raw
  }
  throw new Error('XRPL key type must be ed25519 or secp256k1')
}

function readVaultScope(): VaultScope {
  const raw = readArg('--vault')?.trim() || process.env.XRPL_PROVISION_VAULT_ID?.trim() || 'vault'
  if (raw === 'vault' || raw === 'public') {
    return raw
  }
  throw new Error('XRPL vault scope must be public or vault')
}

function readBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`${name} must be true or false`)
}

function readConfig(): ProvisionConfig {
  const seed = readArg('--seed')?.trim() || process.env.XRPL_PROVISION_SEED?.trim()
  if (!seed) {
    throw new Error('Provide an XRPL seed with --seed or XRPL_PROVISION_SEED')
  }

  return {
    role: readRole(),
    seed,
    keyType: readKeyType(),
    networkId: readArg('--network')?.trim() || process.env.XRPL_PROVISION_NETWORK_ID?.trim() || null,
    vaultId: readVaultScope(),
    dryRun: hasFlag('--dry-run') || process.env.XRPL_PROVISION_DRY_RUN === 'true',
    policy: {
      ...(readBooleanEnv('XRPL_PROVISION_REQUIRE_SECOND_FACTOR') !== undefined
        ? { requiresSecondFactor: readBooleanEnv('XRPL_PROVISION_REQUIRE_SECOND_FACTOR') }
        : {}),
      ...(readBooleanEnv('XRPL_PROVISION_REQUIRE_PQ_ATTESTATION') !== undefined
        ? { requiresPQAttestation: readBooleanEnv('XRPL_PROVISION_REQUIRE_PQ_ATTESTATION') }
        : {}),
    },
  }
}

function printUsage() {
  console.log(`Usage: pnpm wallet:provision:xrpl --role distributor --seed sEd...

Options:
  --role issuer|distributor
  --seed <xrpl-seed>
  --key-type ed25519|secp256k1
  --network <network-id>
  --vault public|vault
  --dry-run

Env fallbacks:
  XRPL_PROVISION_ROLE
  XRPL_PROVISION_SEED
  XRPL_PROVISION_KEY_TYPE
  XRPL_PROVISION_NETWORK_ID
  XRPL_PROVISION_VAULT_ID
  XRPL_PROVISION_DRY_RUN
  XRPL_PROVISION_REQUIRE_SECOND_FACTOR
  XRPL_PROVISION_REQUIRE_PQ_ATTESTATION
`)
}

async function main() {
  if (hasFlag('--help')) {
    printUsage()
    return
  }

  const config = readConfig()
  const prepared = await prepareManagedXrplWalletProvisioning({
    seed: config.seed,
    keyType: config.keyType,
    networkId: config.networkId,
    vaultId: config.vaultId,
    policy: config.policy,
  })

  const record = config.dryRun ? null : await prepared.persist()
  const envVar = config.role === 'issuer' ? 'XRPL_ISSUER_WALLET_ID' : 'XRPL_DISTRIBUTOR_WALLET_ID'

  console.log(JSON.stringify({
    ok: true,
    role: config.role,
    walletId: record?.id ?? null,
    address: prepared.address,
    publicKey: prepared.publicKey,
    keyType: prepared.keyType,
    networkId: config.networkId,
    vaultId: config.vaultId,
    dryRun: config.dryRun,
    nextEnv: record ? { [envVar]: record.id } : null,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('xrpl wallet provisioning failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prismaCrdb.$disconnect()
  })
