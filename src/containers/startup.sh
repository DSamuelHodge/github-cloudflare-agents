#!/bin/bash
# Container startup script
# Mounts R2 bucket via FUSE and starts the HTTP server

set -e

echo "[STARTUP] Container starting at $(date -Iseconds)"
echo "[STARTUP] Container ID: ${CLOUDFLARE_DEPLOYMENT_ID:-local}"

# Mount R2 bucket if credentials are provided
if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${R2_BUCKET_NAME:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
    echo "[STARTUP] Mounting R2 bucket: ${R2_BUCKET_NAME}"
    
    # Create mount point
    mkdir -p "${R2_MOUNT_PATH:-/mnt/r2}"
    
    # Construct R2 endpoint
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    
    # Mount bucket using tigrisfs (runs in background)
    /usr/local/bin/tigrisfs --endpoint "${R2_ENDPOINT}" -f "${R2_BUCKET_NAME}" "${R2_MOUNT_PATH:-/mnt/r2}" &
    TIGRISFS_PID=$!
    
    # Wait for mount to be ready
    sleep 3
    
    # Verify mount
    if mountpoint -q "${R2_MOUNT_PATH:-/mnt/r2}"; then
        echo "[STARTUP] R2 bucket mounted successfully at ${R2_MOUNT_PATH:-/mnt/r2}"
        ls -la "${R2_MOUNT_PATH:-/mnt/r2}" 2>/dev/null || echo "[STARTUP] (empty or no read access)"
    else
        echo "[STARTUP] WARNING: R2 mount may not be ready, continuing anyway..."
    fi
else
    echo "[STARTUP] R2 credentials not provided, skipping mount"
    echo "[STARTUP] To enable R2 FUSE mount, set: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ACCOUNT_ID"
fi

# Export R2 mount path for test-runner.sh
export R2_ARTIFACTS_PATH="${R2_MOUNT_PATH:-/mnt/r2}"

# Start HTTP server
# In production, this would be the compiled server.js
# For now, using a simple Node.js server inline or the compiled version
if [ -f "/workspace/server.js" ]; then
    echo "[STARTUP] Starting HTTP server from server.js"
    exec node /workspace/server.js
else
    echo "[STARTUP] No server.js found, starting interactive bash"
    echo "[STARTUP] Run test-runner.sh manually or deploy with compiled server"
    exec /bin/bash
fi
