import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'graphql';
import { registry } from '../src/metrics';
import { graphqlMetricsPlugin } from '../src/graphql/plugins';

describe('GraphQL operation metrics', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('records query execution latency and successful outcome', async () => {
    const onExecute = graphqlMetricsPlugin.onExecute as (event: unknown) => {
      onExecuteDone: (event: unknown) => void;
    };
    const hooks = onExecute({
      args: { document: parse('query { __typename }'), operationName: undefined },
    });
    hooks.onExecuteDone({ result: { data: { __typename: 'Query' } } });

    expect(await registry.getSingleMetricAsString('graphql_operation_duration_seconds')).toContain(
      'graphql_operation_duration_seconds_count{operation_type="query",status="success"} 1',
    );
  });

  it('counts resolver errors separately from successful GraphQL HTTP responses', async () => {
    const onExecute = graphqlMetricsPlugin.onExecute as (event: unknown) => {
      onExecuteDone: (event: unknown) => void;
    };
    const hooks = onExecute({
      args: { document: parse('mutation { __typename }'), operationName: undefined },
    });
    hooks.onExecuteDone({
      result: { data: null, errors: [new Error('resolver failed')] },
    });

    expect(await registry.getSingleMetricAsString('graphql_operation_errors_total')).toContain(
      'graphql_operation_errors_total{operation_type="mutation"} 1',
    );
    expect(await registry.getSingleMetricAsString('graphql_operation_duration_seconds')).toContain(
      'graphql_operation_duration_seconds_count{operation_type="mutation",status="error"} 1',
    );
  });
});
