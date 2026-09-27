import { ConfigService } from '@nestjs/config';
import { WhatsappCloudApiClient } from '../../src/whatsapp/whatsapp-cloud-api.client';

describe('WhatsappCloudApiClient', () => {
  let client: WhatsappCloudApiClient;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string) => (key === 'WHATSAPP_GRAPH_API_VERSION' ? 'v25.0' : undefined)),
    } as unknown as ConfigService;
    client = new WhatsappCloudApiClient(config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('retries a rate limited send after honoring Retry-After and records the attempt count', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'rate limited', code: 4 } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.sent' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await expect(
      client.sendMessage('phone-id', 'access-token', { type: 'text', text: { body: 'hello' } }),
    ).resolves.toEqual({ providerMessageId: 'wamid.sent', attempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://graph.facebook.com/v25.0/phone-id/messages');
  });

  it('does not retry permanent Graph API errors', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid recipient', code: 100 } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      client.sendMessage('phone-id', 'access-token', { type: 'text', text: { body: 'hello' } }),
    ).rejects.toMatchObject({ httpStatus: 400, providerCode: '100', attempts: 1, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
