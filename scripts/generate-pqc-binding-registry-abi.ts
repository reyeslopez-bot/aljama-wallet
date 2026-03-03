import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseAbi } from 'viem'

const abi = parseAbi([
  'function bindingOf(address account) view returns ((bytes32 bindingHash, bytes32 statementHash, bytes32 signatureHash, bytes32 publicKeyHash, bytes32 uriHash, uint64 version, uint64 updatedAt))',
  'function commitBinding(bytes32 statementHash, bytes32 signatureHash, bytes32 publicKeyHash, bytes32 uriHash, string uri) returns (bytes32 bindingHash)',
  'function clearBinding()',
  'event BindingCommitted(address indexed account, bytes32 indexed bindingHash, bytes32 indexed statementHash, bytes32 signatureHash, bytes32 publicKeyHash, bytes32 uriHash, string uri, uint64 version, bytes32 previousBindingHash)',
  'event BindingCleared(address indexed account, bytes32 previousBindingHash)',
])

const targetPath = path.resolve(
  process.cwd(),
  'lib/contracts/generated/pqc-binding-registry.abi.json',
)

await writeFile(targetPath, `${JSON.stringify(abi, null, 2)}\n`, 'utf8')
