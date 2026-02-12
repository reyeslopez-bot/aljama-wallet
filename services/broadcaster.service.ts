import { JsonRpcProvider } from 'ethers';
import { walletTxSignedV1Schema, walletTopicsV1 } from '@/infra/agentic/kafka';
import { logError } from '@/lib/security/logging';
import { createConsumer, createProducer } from '@/infra/kafka';

const broadcasterGroupId = process.env.KAFKA_BROADCASTER_GROUP_ID ?? 'wallet-broadcaster';

function requireRpcUrl() {
  const rpcUrl = process.env.EVM_RPC_URL;
  if (!rpcUrl) throw new Error('Missing EVM_RPC_URL');
  return rpcUrl;
}

export async function startBroadcaster() {
  const provider = new JsonRpcProvider(requireRpcUrl());
  const consumer = createConsumer(broadcasterGroupId);
  const producer = createProducer();

  await consumer.connect();
  await producer.connect();

  await consumer.subscribe({ topic: walletTopicsV1.signed });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const payload = JSON.parse(message.value.toString('utf8'));
      const signedEvent = walletTxSignedV1Schema.parse(payload);

      const txHash = await provider.send('eth_sendRawTransaction', [signedEvent.signedTx]);
      const broadcastEvent = {
        topic: walletTopicsV1.broadcast,
        correlationId: signedEvent.correlationId,
        chainId: signedEvent.chainId,
        txHash,
        createdAt: new Date().toISOString(),
      };

      await producer.send({
        topic: walletTopicsV1.broadcast,
        messages: [
          {
            key: signedEvent.correlationId,
            value: JSON.stringify(broadcastEvent),
          },
        ],
      });
    },
  });
}

if (process.env.BROADCASTER_AUTO_START === 'true') {
  startBroadcaster().catch((error) => {
    logError('broadcaster', error as unknown);
    process.exitCode = 1;
  });
}
