#!/bin/bash
# Container-side test runner script
# Executes tests in git-worktree-runner environment using `git gtr run`
# Aligned with PHASE2_RESEARCH.md specification

set -euo pipefail

# Colors for output (disabled by GIT_GTR_ENABLE_COLORS=false)
log_info() {
  echo "[INFO] $(date -Iseconds) $1" >&2
}

log_error() {
  echo "[ERROR] $(date -Iseconds) $1" >&2
}

log_success() {
  echo "[SUCCESS] $(date -Iseconds) $1" >&2
}

log_progress() {
  # Output progress for SSE streaming
  echo "{\"type\":\"progress\",\"phase\":\"$1\",\"percent\":$2,\"message\":\"$3\"}"
}

# Validate required environment variables
if [ -z "${REPO_URL:-}" ]; then
  log_error "REPO_URL environment variable is required"
  exit 1
fi

if [ -z "${BRANCH:-}" ]; then
  log_error "BRANCH environment variable is required"
  exit 1
fi

if [ -z "${TEST_COMMAND:-}" ]; then
  log_error "TEST_COMMAND environment variable is required"
  exit 1
fi

JOB_ID="${JOB_ID:-$(date +%s)}"
WORKTREE_NAME="job-${JOB_ID}"
MAIN_REPO_DIR="/workspace/repo"
R2_ARTIFACTS="${R2_ARTIFACTS_PATH:-/mnt/r2}"
ARTIFACTS_DIR="${R2_ARTIFACTS}/test-artifacts/${JOB_ID}"

log_info "Starting test execution for job ${JOB_ID}"
log_info "Branch: ${BRANCH}"
log_info "Command: ${TEST_COMMAND}"
log_info "R2 artifacts path: ${R2_ARTIFACTS}"

log_progress "cloning" 10 "Initializing repository..."

# Step 1: Clone repository if not exists
if [ ! -d "${MAIN_REPO_DIR}" ]; then
  log_info "Cloning repository: ${REPO_URL}"
  log_progress "cloning" 20 "Cloning repository..."
  git clone "${REPO_URL}" "${MAIN_REPO_DIR}" || {
    log_error "Failed to clone repository"
    exit 1
  }
  cd "${MAIN_REPO_DIR}"
else
  log_info "Repository already cloned, fetching updates..."
  cd "${MAIN_REPO_DIR}"
  git fetch --all --prune || {
    log_error "Failed to fetch updates"
    exit 1
  }
fi

log_progress "cloning" 40 "Repository ready"

# Step 2: Create worktree using git-gtr (research pattern)
log_info "Creating worktree for branch ${BRANCH} with name ${WORKTREE_NAME}"
log_progress "cloning" 50 "Creating worktree..."

# Clean up existing worktree if exists
if git gtr list --porcelain 2>/dev/null | grep -q "${WORKTREE_NAME}"; then
  log_info "Cleaning existing worktree: ${WORKTREE_NAME}"
  git gtr rm "${WORKTREE_NAME}" --force 2>/dev/null || true
fi

# Create new worktree using gtr (--no-copy skips config file copying)
git gtr new "${BRANCH}" --name "${WORKTREE_NAME}" --no-copy || {
  log_error "Failed to create worktree"
  exit 1
}

log_success "Worktree created: ${WORKTREE_NAME}"
log_progress "installing" 60 "Worktree ready, installing dependencies..."

# Step 3: Install dependencies using git gtr run (research pattern)
WORKTREE_PATH=$(git gtr go "${WORKTREE_NAME}")
log_info "Worktree path: ${WORKTREE_PATH}"

if [ -f "${WORKTREE_PATH}/package.json" ]; then
  log_info "Installing npm dependencies..."
  git gtr run "${WORKTREE_NAME}" npm install || {
    log_error "Failed to install dependencies"
    # Continue anyway, tests might still work
  }
  log_success "Dependencies installed"
fi

log_progress "testing" 70 "Running tests..."

# Step 4: Execute test command using git gtr run (research pattern)
log_info "Executing: git gtr run ${WORKTREE_NAME} ${TEST_COMMAND}"
START_TIME=$(date +%s)

# Run test with timeout using git gtr run
set +e
timeout "${TIMEOUT_SECONDS:-300}" git gtr run "${WORKTREE_NAME}" ${TEST_COMMAND}
TEST_EXIT_CODE=$?
set -e

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ ${TEST_EXIT_CODE} -eq 0 ]; then
  log_success "Tests passed (duration: ${DURATION}s)"
  log_progress "testing" 90 "Tests passed!"
elif [ ${TEST_EXIT_CODE} -eq 124 ]; then
  log_error "Tests timed out after ${TIMEOUT_SECONDS:-300}s"
  log_progress "testing" 90 "Tests timed out"
else
  log_error "Tests failed with exit code ${TEST_EXIT_CODE} (duration: ${DURATION}s)"
  log_progress "testing" 90 "Tests failed"
fi

# Step 5: Save artifacts to R2 FUSE mount (if mounted)
log_progress "cleanup" 95 "Saving artifacts..."
if mountpoint -q "${R2_ARTIFACTS}" 2>/dev/null; then
  log_info "Saving artifacts to R2: ${ARTIFACTS_DIR}"
  mkdir -p "${ARTIFACTS_DIR}"
  
  # Copy coverage reports if they exist
  if [ -d "${WORKTREE_PATH}/coverage" ]; then
    cp -r "${WORKTREE_PATH}/coverage" "${ARTIFACTS_DIR}/" 2>/dev/null || true
    log_info "Coverage reports saved"
  fi
  
  # Save test summary
  echo "{\"jobId\":\"${JOB_ID}\",\"branch\":\"${BRANCH}\",\"exitCode\":${TEST_EXIT_CODE},\"duration\":${DURATION},\"timestamp\":\"$(date -Iseconds)\"}" > "${ARTIFACTS_DIR}/summary.json"
else
  log_info "R2 not mounted, skipping artifact persistence"
fi

# Step 6: Cleanup worktree using git gtr rm (research pattern)
log_info "Cleaning up worktree: ${WORKTREE_NAME}"
log_progress "cleanup" 98 "Cleaning up..."
cd "${MAIN_REPO_DIR}"
git gtr rm "${WORKTREE_NAME}" --force || {
  log_error "Failed to clean up worktree (non-fatal)"
}

log_progress "cleanup" 100 "Complete"
log_info "Test execution completed with exit code ${TEST_EXIT_CODE}"
exit ${TEST_EXIT_CODE}
