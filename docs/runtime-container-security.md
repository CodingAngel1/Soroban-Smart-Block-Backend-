# Runtime Container Privileges

The production image runs as the dedicated unprivileged UID/GID 1001
(`appuser`). Both maintained Kubernetes API deployments require a non-root
identity, disable privilege escalation, drop all Linux capabilities, and use
the container runtime's `RuntimeDefault` seccomp profile. CI verifies the
Dockerfile and Kubernetes declarations and launches a disposable Node container
as UID 1001 with all capabilities dropped and `no-new-privileges`; the check
fails if the observed UID, effective capability mask, or `NoNewPrivs` status
does not match the expected posture.

The application continues to use its existing writable `/tmp` and P2P data
paths; this change does not make the root filesystem read-only. Kubernetes
clusters must support seccomp `RuntimeDefault` and enforce the pod/container
security contexts in `k8s/api-deployment.yaml` and
`k8s/multi-network-deployment.yaml`. Apply equivalent settings to any additional
network-specific deployment manifests. No Stellar network or application
protocol behavior changes.

For a direct Docker deployment, specify runtime restrictions explicitly because
an image cannot drop Linux capabilities or set `no-new-privileges` on its own:

```sh
docker run --cap-drop=ALL --security-opt=no-new-privileges ...
```
