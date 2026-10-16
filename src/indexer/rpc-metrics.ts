import { Counter, Gauge, Histogram } from 'prom-client';
import { registry } from '../metrics';

export const rpcCallDuration = new Histogram({
  name: 'rpc_call_duration_seconds',
  help: 'Duration of outbound Stellar RPC calls in seconds',
  labelNames: ['network', 'operation', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

export const rpcCallErrorsTotal = new Counter({
  name: 'rpc_call_errors_total',
  help: 'Total number of outbound Stellar RPC call errors',
  labelNames: ['network', 'operation', 'type'],
  registers: [registry],
});

export const rpcCallRetriesTotal = new Counter({
  name: 'rpc_call_retries_total',
  help: 'Total number of RPC call retries performed (rate-limit backoff)',
  labelNames: ['network', 'operation'],
  registers: [registry],
});

export const rpcEndpointFailoversTotal = new Counter({
  name: 'rpc_endpoint_failovers_total',
  help: 'Total number of Stellar RPC endpoint failover transitions attempted',
  labelNames: ['network', 'from_endpoint', 'to_endpoint'],
  registers: [registry],
});

export const rpcEndpointActive = new Gauge({
  name: 'rpc_endpoint_active',
  help: 'Currently selected Stellar RPC endpoint index (1 = active)',
  labelNames: ['network', 'endpoint'],
  registers: [registry],
});

export const horizonCallDuration = new Histogram({
  name: 'horizon_call_duration_seconds',
  help: 'Duration of outbound Horizon REST API calls in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

export const horizonCallErrorsTotal = new Counter({
  name: 'horizon_call_errors_total',
  help: 'Total number of outbound Horizon REST API call errors',
  labelNames: ['operation', 'type'],
  registers: [registry],
});
