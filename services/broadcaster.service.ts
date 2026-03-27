import { getEvmProviderForChain } from '@/lib/evm-rpc';
import { walletTxSignedV1Schema, walletTopicsV1 } from '@/infra/agentic/kafka';
import { logError, logInfo, logWarn } from '@/lib/security/logging';
import { createConsumer, createProducer } from '@/infra/kafka';

const broadcasterGroupId = process.env.KAFKA_BROADCASTER_GROUP_ID ?? 'wallet-broadcaster';

export async function startBroadcaster() {
  const consumer = createConsumer(broadcasterGroupId);
  const producer = createProducer();

  logInfo('broadcaster', 'Starting wallet broadcaster', {
    groupId: broadcasterGroupId,
    sourceTopic: walletTopicsV1.signed,
    destinationTopic: walletTopicsV1.broadcast,
  });

  await consumer.connect();
  logInfo('broadcaster', 'Kafka consumer connected', { groupId: broadcasterGroupId });
  await producer.connect();
  logInfo('broadcaster', 'Kafka producer connected', { groupId: broadcasterGroupId });

  await consumer.subscribe({ topic: walletTopicsV1.signed });
  logInfo('broadcaster', 'Kafka consumer subscribed to signed transaction events', {
    groupId: broadcasterGroupId,
    topic: walletTopicsV1.signed,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const messageKey = message.key?.toString('utf8') ?? null;
      const messageBytes = message.value?.byteLength ?? 0;

      if (!message.value) {
        logWarn(
          'broadcaster:message',
          { message: 'Skipping signed transaction event because the Kafka message had no value' },
          {
            groupId: broadcasterGroupId,
            topic: walletTopicsV1.signed,
            messageKey,
          },
        );
        return;
      }

      try {
        const payload = JSON.parse(message.value.toString('utf8'));
        const signedEvent = walletTxSignedV1Schema.parse(payload);

        logInfo('broadcaster:message', 'Broadcasting signed wallet transaction', {
          groupId: broadcasterGroupId,
          topic: walletTopicsV1.signed,
          messageKey,
          messageBytes,
          correlationId: signedEvent.correlationId,
          chainId: signedEvent.chainId,
          walletId: signedEvent.walletId,
        });

        const provider = await getEvmProviderForChain(signedEvent.chainId);
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

        logInfo('broadcaster:message', 'Published wallet broadcast event', {
          groupId: broadcasterGroupId,
          topic: walletTopicsV1.broadcast,
          correlationId: signedEvent.correlationId,
          chainId: signedEvent.chainId,
          txHash,
        });
      } catch (error) {
        logError('broadcaster:message', error, {
          groupId: broadcasterGroupId,
          topic: walletTopicsV1.signed,
          messageKey,
          messageBytes,
        });
        throw error;
      }
    },
  });
}

if (process.env.BROADCASTER_AUTO_START === 'true') {
  startBroadcaster().catch((error) => {
    logError('broadcaster', error as unknown);
    process.exitCode = 1;
  });
}
