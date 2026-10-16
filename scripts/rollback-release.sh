#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <namespace> <deployment> [revision]" >&2
  exit 2
fi

namespace=$1
deployment=$2
revision=${3:-}

for name in "$namespace" "$deployment"; do
  if [[ ! $name =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
    echo "Namespace and deployment must be lowercase Kubernetes names." >&2
    exit 2
  fi
done

kubectl_args=(rollout undo "deployment/$deployment" --namespace "$namespace")
if [[ -n $revision ]]; then
  if [[ ! $revision =~ ^[1-9][0-9]*$ ]]; then
    echo "Revision must be a positive integer." >&2
    exit 2
  fi
  kubectl_args+=(--to-revision="$revision")
fi

echo "Rolling back deployment/$deployment in namespace $namespace."
kubectl "${kubectl_args[@]}"

echo "Waiting for the rollback rollout to become healthy."
kubectl rollout status "deployment/$deployment" --namespace "$namespace" --timeout=300s

echo "Rollback completed successfully."
