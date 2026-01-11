# Multi-stage build for GitHub AI Agent Container
# Phase 2: Container-Based Worktree Integration with R2 FUSE Mount

FROM ubuntu:24.04 as builder

# Install build tools and dependencies
RUN apt-get update && apt-get install -y \
    bash \
    git \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Clone and prepare git-worktree-runner
RUN git clone https://github.com/coderabbitai/git-worktree-runner.git /opt/gtr && \
    chmod +x /opt/gtr/bin/git-gtr

# Final runtime stage
FROM ubuntu:24.04

# Install runtime dependencies including FUSE for R2 mounting
RUN apt-get update && apt-get install -y \
    bash \
    git \
    curl \
    ca-certificates \
    jq \
    fuse \
    libfuse2 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (for testing support)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest && \
    rm -rf /var/lib/apt/lists/*

# Install tigrisfs for R2 FUSE mounting (S3-compatible)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
    if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    VERSION=$(curl -s https://api.github.com/repos/tigrisdata/tigrisfs/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4) && \
    curl -L "https://github.com/tigrisdata/tigrisfs/releases/download/${VERSION}/tigrisfs_${VERSION#v}_linux_${ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz && \
    tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/ && \
    rm /tmp/tigrisfs.tar.gz && \
    chmod +x /usr/local/bin/tigrisfs

# Copy gtr from builder
COPY --from=builder /opt/gtr /opt/gtr

# Set PATH to include gtr
ENV PATH="/opt/gtr/bin:$PATH" \
    CLOUDFLARE_DEPLOYMENT_ID="" \
    PYTHONUNBUFFERED=1 \
    R2_MOUNT_PATH="/mnt/r2"

# Create directories
RUN mkdir -p /workspace /mnt/r2

WORKDIR /workspace

# Copy startup script that mounts R2 and starts server
COPY src/containers/startup.sh /workspace/startup.sh
RUN chmod +x /workspace/startup.sh

# Copy test runner script
COPY src/containers/test-runner.sh /workspace/test-runner.sh
RUN chmod +x /workspace/test-runner.sh

# Health check: Ensure git, gtr, and tigrisfs are functional
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD git --version && git gtr --version && which tigrisfs || exit 1

# Expose container port
EXPOSE 4000

# Default command: Run startup script (mounts R2, starts server)
CMD ["/workspace/startup.sh"]
