import { describe, expect, it } from 'vitest';
import { validateOpenApiExamples } from '../src/lib/openapi/validate-examples';
import { swaggerSpec } from '../src/indexer/swaggerSpec';

describe('OpenAPI examples', () => {
  it('validates every declared schema, request, and response example', () => {
    const result = validateOpenApiExamples(swaggerSpec);

    expect(result.checked).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it('reports request and response examples that do not match their schemas', () => {
    const result = validateOpenApiExamples({
      openapi: '3.0.0',
      components: {
        schemas: {
          Payload: {
            type: 'object',
            required: ['count'],
            properties: { count: { type: 'integer' } },
          },
        },
      },
      paths: {
        '/items': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Payload' },
                  example: { count: 'not-an-integer' },
                },
              },
            },
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Payload' },
                    example: {},
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(result.checked).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.join('\n')).toContain('POST /items.requestBody.application/json.example');
    expect(result.errors.join('\n')).toContain(
      'POST /items.responses.200.application/json.example',
    );
  });

  it('validates nullable OpenAPI schema examples', () => {
    const result = validateOpenApiExamples({
      openapi: '3.0.0',
      components: {
        schemas: {
          NullableField: { type: 'string', nullable: true, example: null },
        },
      },
      paths: {},
    });

    expect(result.errors).toEqual([]);
  });
});
