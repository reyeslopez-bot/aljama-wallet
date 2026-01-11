const defaultRestUrl = 'http://localhost:8082';

export type KafkaMessage = {
  key?: string;
  value: string;
};

export type EachMessageHandler = (payload: {
  message: { key?: Buffer; value?: Buffer };
}) => Promise<void>;

type RestConsumerState = {
  baseUri: string;
  instanceId: string;
};

function kafkaRestUrl() {
  return process.env.KAFKA_REST_URL ?? defaultRestUrl;
}

function consumerInstanceId(groupId: string) {
  return process.env.KAFKA_CONSUMER_INSTANCE ?? `wallet-${groupId}-${Date.now()}`;
}

async function createConsumerInstance(groupId: string): Promise<RestConsumerState> {
  const restUrl = kafkaRestUrl();
  const instanceId = consumerInstanceId(groupId);
  const response = await fetch(`${restUrl}/consumers/${groupId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/vnd.kafka.v2+json' },
    body: JSON.stringify({
      name: instanceId,
      format: 'json',
      'auto.offset.reset': 'latest',
    }),
  });

  if (!response.ok) throw new Error(`Kafka REST consumer create failed: ${response.status}`);
  const data = (await response.json()) as { base_uri: string };
  return { baseUri: data.base_uri, instanceId };
}

export function createProducer() {
  const restUrl = kafkaRestUrl();

  return {
    async connect() {
      return;
    },
    async send(input: { topic: string; messages: KafkaMessage[] }) {
      const response = await fetch(`${restUrl}/topics/${input.topic}`, {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.kafka.json.v2+json' },
        body: JSON.stringify({
          records: input.messages.map((message) => ({
            key: message.key,
            value: JSON.parse(message.value),
          })),
        }),
      });

      if (!response.ok) throw new Error(`Kafka REST produce failed: ${response.status}`);
    },
    async disconnect() {
      return;
    },
  };
}

export function createConsumer(groupId: string) {
  let state: RestConsumerState | null = null;
  let topics: string[] = [];

  return {
    async connect() {
      state = await createConsumerInstance(groupId);
    },
    async subscribe(input: { topic: string }) {
      if (!state) throw new Error('Consumer not connected');
      topics = Array.from(new Set([...topics, input.topic]));
      const response = await fetch(`${state.baseUri}/subscription`, {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.kafka.v2+json' },
        body: JSON.stringify({ topics }),
      });

      if (!response.ok) throw new Error(`Kafka REST subscribe failed: ${response.status}`);
    },
    async run(input: { eachMessage: EachMessageHandler }) {
      if (!state) throw new Error('Consumer not connected');

      while (true) {
        const response = await fetch(`${state.baseUri}/records`, {
          method: 'GET',
          headers: { accept: 'application/vnd.kafka.json.v2+json' },
        });

        if (!response.ok) throw new Error(`Kafka REST poll failed: ${response.status}`);
        const records = (await response.json()) as Array<{
          key?: string;
          value?: unknown;
        }>;

        for (const record of records) {
          const messageValue = record.value ? JSON.stringify(record.value) : undefined;
          await input.eachMessage({
            message: {
              key: record.key ? Buffer.from(record.key) : undefined,
              value: messageValue ? Buffer.from(messageValue) : undefined,
            },
          });
        }

        if (records.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    async disconnect() {
      if (!state) return;
      await fetch(`${state.baseUri}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/vnd.kafka.v2+json' },
      });
      state = null;
    },
  };
}
