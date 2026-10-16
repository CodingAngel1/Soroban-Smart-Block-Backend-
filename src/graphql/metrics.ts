import { Counter, Histogram } from 'prom-client';
import { registry } from '../metrics';

export const graphqlOperationDuration = new Histogram({
  name: 'graphql_operation_duration_seconds',
  help: 'GraphQL operation execution duration by bounded operation type and outcome',
  labelNames: ['operation_type', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const graphqlOperationErrorsTotal = new Counter({
  name: 'graphql_operation_errors_total',
  help: 'GraphQL operation executions that returned errors',
  labelNames: ['operation_type'],
  registers: [registry],
});
