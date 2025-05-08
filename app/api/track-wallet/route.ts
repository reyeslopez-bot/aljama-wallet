import { NextResponse } from 'next/server';
import { utils } from 'ethers';

export async function POST(request: Request) {
    try {
        const { address } = await request.json();

        // Validate the address
        if (!utils.isAddress(address)) {
            return NextResponse.json(
                { error: 'Invalid address' },
                { status: 400 }
            );
        }

        // TODO: store or log the address however you need
        console.log(`New user connected: ${address}`);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error in track-wallet handler:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

