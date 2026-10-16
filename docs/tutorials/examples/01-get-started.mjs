// Tutorial 01: create an API key and query the first transaction page.
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const developerId = process.env.DEVELOPER_ID;
let apiKey = process.env.API_KEY;
let createdKeyId;

async function main() {
  if (!apiKey) {
    if (!developerId) {
      throw new Error('Set DEVELOPER_ID to an existing developer account ID, or provide API_KEY.');
    }

    const createResponse = await fetch(`${base}/api/v1/developer/keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ developerId, name: `onboarding-smoke-${Date.now()}` }),
    });
    if (!createResponse.ok) {
      throw new Error(`API-key creation failed: HTTP ${createResponse.status} ${createResponse.statusText}`);
    }

    const createdKey = await createResponse.json();
    if (typeof createdKey.key !== 'string' || createdKey.key.length === 0) {
      throw new Error('API-key creation response did not contain a key.');
    }
    apiKey = createdKey.key;
    createdKeyId = createdKey.id;
  }

  const response = await fetch(`${base}/api/v1/transactions?limit=1`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`First transaction query failed: HTTP ${response.status} ${response.statusText}`);
  }

  console.log(
    JSON.stringify(
      {
        createdKeyId,
        query: '/api/v1/transactions?limit=1',
        result: await response.json(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
