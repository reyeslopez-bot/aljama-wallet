import { describe, expect, it } from 'vitest'
import {
  DeterministicVault,
  UserDeterministicWallet,
  discoverAndLockChainPaths,
  discoverAccountsAndAddresses,
} from '@/lib/crypto/deterministic-key-engine'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('deterministic-key-engine', () => {
  it('creates passphrase-isolated vault universes for plausible deniability', () => {
    const user = new UserDeterministicWallet(TEST_MNEMONIC)
    const publicEth = user.publicVault.derive({
      chain: 'ETH',
      account: 0,
      index: 0,
      change: 0,
    })

    user.unlockPrivateVault('Hidden vault passphrase')
    const privateEth = user.privateVault.derive({
      chain: 'ETH',
      account: 0,
      index: 0,
      change: 0,
    })

    expect(publicEth.address).not.toBe(privateEth.address)
    expect(publicEth.privateKey).toBeDefined()
    expect(privateEth.privateKey).toBeDefined()
  })

  it('derives deterministic addresses for the same mnemonic/passphrase/path', () => {
    const a = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )
    const b = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )

    const keyA = a.derive({ chain: 'ETH', account: 0, index: 0, change: 0 })
    const keyB = b.derive({ chain: 'ETH', account: 0, index: 0, change: 0 })

    expect(keyA.address).toBe(keyB.address)
    expect(keyA.path).toBe("m/44'/60'/0'/0/0")
  })

  it('keeps counters isolated per chain/account namespace', () => {
    const vault = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )

    const eth0 = vault.nextReceiveAddress('ETH', 0)
    const eth1 = vault.nextReceiveAddress('ETH', 0)
    const xrpl0 = vault.nextReceiveAddress('XRPL_SECP', 0)

    expect(eth0.index).toBe(0)
    expect(eth1.index).toBe(1)
    expect(xrpl0.index).toBe(0)
  })

  it('enforces hardened-only derivation for ed25519 paths', () => {
    const vault = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )

    expect(() =>
      vault.deriveAtPath('XRPL_ED', "m/44'/144'/0'/0/0", {
        account: 0,
        change: 0,
        index: 0,
      }),
    ).toThrow(/hardened/)

    const derived = vault.derive({ chain: 'XRPL_ED', account: 0, index: 0 })
    expect(derived.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
    expect(derived.publicKey.length).toBe(32)
  })

  it('supports BTC compatibility purposes (44/49/84)', () => {
    const vault = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )

    const p44 = vault.deriveAtPath('BTC', "m/44'/0'/0'/0/0")
    const p49 = vault.deriveAtPath('BTC', "m/49'/0'/0'/0/0")
    const p84 = vault.deriveAtPath('BTC', "m/84'/0'/0'/0/0")

    expect(p44.address.startsWith('1')).toBe(true)
    expect(p49.address.startsWith('3')).toBe(true)
    expect(p84.address.startsWith('bc1')).toBe(true)
  })

  it('discovers funded accounts using compatibility path scanning', async () => {
    const vault = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )
    const funded = vault.deriveAtPath('ETH', "m/44'/60'/0'/0/1")

    const found = await discoverAccountsAndAddresses({
      vault,
      chains: ['ETH'],
      maxAccounts: 1,
      maxAddrsPerAccount: 3,
      getBalance: async (_chain, address) => (address === funded.address ? 5n : 0n),
    })

    expect(found).toHaveLength(1)
    expect(found[0]?.chain).toBe('ETH')
    expect(found[0]?.discovered.some((item) => item.address === funded.address)).toBe(true)
  })

  it('silently locks the strongest discovered path per chain during import scan', async () => {
    const vault = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )

    const addrLow = vault.deriveAtPath('BTC', "m/44'/0'/0'/0/0")
    const addrHigh = vault.deriveAtPath('BTC', "m/84'/0'/0'/0/0")

    const result = await discoverAndLockChainPaths({
      vault,
      chains: ['BTC'],
      maxAccounts: 1,
      maxAddrsPerAccount: 1,
      getBalance: async (_chain, address) => {
        if (address === addrLow.address) return 1n
        if (address === addrHigh.address) return 3n
        return 0n
      },
    })

    expect(result.locks.BTC?.address).toBe(addrHigh.address)
    expect(result.locks.BTC?.path).toBe("m/84'/0'/0'/0/0")
  })

  it('locks and blocks key derivation until unlocked again', () => {
    const vault = new DeterministicVault(
      { id: 'public', mnemonic: TEST_MNEMONIC },
      { passphrase: '' },
    )
    vault.lock()

    expect(vault.isUnlocked()).toBe(false)
    expect(() => vault.derive({ chain: 'ETH', account: 0, index: 0, change: 0 })).toThrow(/locked/)

    vault.unlock('')
    expect(vault.isUnlocked()).toBe(true)
    expect(() => vault.derive({ chain: 'ETH', account: 0, index: 0, change: 0 })).not.toThrow()
  })
})
