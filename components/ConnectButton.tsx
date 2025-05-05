import { useAccount, useConnect } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors/injected'

export default function ConnectButton() {
    const { address, isConnected } = useAccount()
    const { connect } = useConnect({
        connector: new InjectedConnector(),
    })

    if (isConnected) return <div>Connected: {address}</div>

    return <button onClick={() => connect()}>Connect Wallet</button>
}

