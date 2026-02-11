# Copilot Rules for This Project

This project is a managed hosting service for OpenClaw.

CORE PRINCIPLES:
- One workspace = one isolated container
- Never expose OpenClaw directly to the internet
- All access must go through authenticated control plane
- Secrets are never logged or stored in plaintext
- Containers must have CPU and memory limits
- Simplicity over cleverness

ABSOLUTE PROHIBITIONS:
- No shared OpenClaw instances
- No public ports exposed from containers
- No logging of API keys or prompts
- No payment logic inside runtime code
- No skipping authentication for convenience

ARCHITECTURE:
- Control plane manages lifecycle (create/start/stop/destroy)
- OpenClaw runs unmodified inside containers
- Payments only unlock access, never trigger infra directly

STYLE:
- Prefer boring, readable code
- Explicit > implicit
- No magic abstractions
