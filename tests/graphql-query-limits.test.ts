import { buildSchema, parse } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import { afterEach, describe, expect, it } from 'vitest';
import { complexityPlugin, depthLimitPlugin } from '../src/graphql/plugins';

const schema = buildSchema(`
  type Query {
    a: A!
    items(limit: Int): [Item!]!
  }
  type A {
    value: String!
    child: B!
  }
  type B {
    value: String!
    child: C!
  }
  type C {
    value: String!
  }
  type Item {
    value: String!
  }
`);

const previousDepth = process.env.GQL_MAX_DEPTH;
const previousComplexity = process.env.GQL_MAX_COMPLEXITY;

function invokePlugin(plugin: Plugin, query: string): unknown {
  if (!plugin.onExecute) {
    throw new Error('Expected plugin to define onExecute');
  }

  const args = {
    args: {
      schema,
      document: parse(query),
    },
  } as Parameters<typeof plugin.onExecute>[0];

  return plugin.onExecute(args);
}

afterEach(() => {
  if (previousDepth === undefined) {
    delete process.env.GQL_MAX_DEPTH;
  } else {
    process.env.GQL_MAX_DEPTH = previousDepth;
  }

  if (previousComplexity === undefined) {
    delete process.env.GQL_MAX_COMPLEXITY;
  } else {
    process.env.GQL_MAX_COMPLEXITY = previousComplexity;
  }
});

describe('GraphQL depth limits', () => {
  it('allows queries at the configured depth', () => {
    process.env.GQL_MAX_DEPTH = '2';

    expect(() => invokePlugin(depthLimitPlugin, '{ a { value } }')).not.toThrow();
  });

  it('rejects selections exceeding the configured depth', () => {
    process.env.GQL_MAX_DEPTH = '2';

    expect(() => invokePlugin(depthLimitPlugin, '{ a { child { child { value } } } }')).toThrow(
      'Query exceeds maximum depth of 2',
    );
  });

  it('enforces depth through fragment spreads', () => {
    process.env.GQL_MAX_DEPTH = '2';

    expect(() =>
      invokePlugin(
        depthLimitPlugin,
        `
          query {
            a { ...NestedFields }
          }
          fragment NestedFields on A {
            child { child { value } }
          }
        `,
      ),
    ).toThrow('Query exceeds maximum depth of 2');
  });
});

describe('GraphQL complexity limits', () => {
  it('allows query complexity at the configured limit', () => {
    process.env.GQL_MAX_COMPLEXITY = '3';

    expect(() => invokePlugin(complexityPlugin, '{ a { value } }')).not.toThrow();
  });

  it('rejects list fan-out that exceeds the configured complexity', () => {
    process.env.GQL_MAX_COMPLEXITY = '50';

    expect(() => invokePlugin(complexityPlugin, '{ items(limit: 100) { value } }')).toThrow(
      'Query too complex',
    );
    expect(() => invokePlugin(complexityPlugin, '{ items(limit: 1) { value } }')).not.toThrow();
  });
});
