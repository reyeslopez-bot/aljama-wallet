// pages/api/track-wallet.ts
export default function handler(req, res) {
    const { address } = req.body
    // Store or log address activity
    console.log(`New user connected: ${address}`)
    res.status(200).json({ ok: true })
}

