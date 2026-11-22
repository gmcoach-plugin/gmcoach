#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
GM Coach installer for macOS and Linux.
Usage: bash scripts/install-codex-desktop.sh [--update]
       bash scripts/install-codex-desktop.sh --update [--refresh-dependencies]
EOF
}

update=0
refresh_dependencies=0
for arg in "$@"; do
  case "$arg" in
    --update) update=1 ;;
    --refresh-dependencies) refresh_dependencies=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done
if (( refresh_dependencies == 1 && update != 1 )); then
  echo 'Use --refresh-dependencies together with --update.' >&2
  exit 2
fi

plugin_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home_dir="${HOME:?Could not determine your home directory}"
codex_home="${CODEX_HOME:-$home_dir/.codex}"
if [[ "$codex_home" != /* ]]; then codex_home="$PWD/$codex_home"; fi
plugin_dir="$codex_home/plugins/gm-coach"
plugin_parent="$(dirname "$plugin_dir")"
backup_dir=''
marketplace_dir="$home_dir/.agents/plugins"
marketplace_path="$marketplace_dir/marketplace.json"
staging_dir=''
runtime_dir=''
binary_dir=''
marketplace_tmp=''
tmp_dir=''

if [[ -e "$plugin_dir" && $update -ne 1 ]]; then
  echo "GM Coach is already installed at $plugin_dir. Rerun with --update to refresh it." >&2
  exit 1
fi
if [[ -L "$plugin_dir" ]]; then
  echo 'GM Coach install path is a symbolic link. Move it aside and rerun to avoid replacing an unexpected location.' >&2
  exit 1
fi

home_real="$(cd "$home_dir" && pwd -P)"
existing_parent="$plugin_parent"
while [[ ! -d "$existing_parent" ]]; do
  parent_candidate="$(dirname "$existing_parent")"
  [[ "$parent_candidate" != "$existing_parent" ]] || { echo 'Could not verify the Codex plugin directory.' >&2; exit 1; }
  existing_parent="$parent_candidate"
done
existing_parent_real="$(cd "$existing_parent" && pwd -P)"
case "$existing_parent_real/" in "$home_real/"*) ;; *) echo 'CODEX_HOME resolves outside your home folder.' >&2; exit 1 ;; esac
mkdir -p "$plugin_parent"
parent_real="$(cd "$plugin_parent" && pwd -P)"
case "$parent_real/" in "$home_real/"*) ;; *) echo 'CODEX_HOME must resolve under your home folder.' >&2; exit 1 ;; esac

case "$(uname -s)" in
  Darwin) release_os="Darwin"; node_os="darwin" ;;
  Linux) release_os="Linux"; node_os="linux" ;;
  *) echo 'This installer supports macOS and Linux. Use the Windows .bat installer on Windows.' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) release_arch="x86_64"; node_arch="x64" ;;
  arm64|aarch64) release_arch="arm64"; node_arch="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m). GM Coach supports x64 and ARM64." >&2; exit 1 ;;
esac

command -v curl >/dev/null 2>&1 || { echo 'curl is required. Install it, then run this installer again.' >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo 'tar is required. Install it, then run this installer again.' >&2; exit 1; }

if command -v sha256sum >/dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo 'A SHA-256 utility (sha256sum or shasum) is required to verify downloads.' >&2
  exit 1
fi

files_manifest="$plugin_root/scripts/plugin-files.txt"
[[ -f "$files_manifest" ]] || { echo "Missing canonical package file list: $files_manifest" >&2; exit 1; }
files=()
while IFS= read -r relative || [[ -n "$relative" ]]; do
  relative="${relative%$'\r'}"
  [[ -z "$relative" || "$relative" == \#* ]] && continue
  [[ "$relative" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "Unsafe path in canonical package list: $relative" >&2; exit 1; }
  case "/$relative/" in
    */../*|*/accounts/*|*/account/*|*/config.json/*|*/.env/*|*/runtime/*|*/bin/*|*/node_modules/*|*/.git/*|*token*)
      echo "Unsafe or private path in canonical package list: $relative" >&2
      exit 1
      ;;
  esac
  # Bash 3.2 treats an empty array expansion as unset under nounset. Iterate
  # indexes so the first manifest entry does not expand the empty files array.
  for (( existing_index=0; existing_index<${#files[@]}; existing_index++ )); do
    [[ "${files[$existing_index]}" != "$relative" ]] || { echo "Duplicate path in canonical package list: $relative" >&2; exit 1; }
  done
  files+=("$relative")
done < "$files_manifest"
(( ${#files[@]} > 0 )) || { echo 'The canonical package file list is empty.' >&2; exit 1; }
required_files=(
  'completed-session-batch.mjs' 'tests/completed-session-batch.test.mjs'
  'deload-load-policy.mjs' 'tests/deload-load-policy.test.mjs'
  '.codex-plugin/plugin.json' 'assets/gm-coach-icon.svg' '.mcp.json' 'mcp.json'
  'plugin.json' 'mcp_server.mjs' 'exercise-candidate-index.mjs' 'tests/exercise-candidate-index.test.mjs' 'plugin-data-directory.mjs' 'cli-runtime.mjs' 'auth-diagnostics.mjs' 'equipment-inventory.mjs' 'exercise-library.mjs' 'exercise-statistics.mjs' 'preset-mapping.mjs' 'goal-preset-routing.mjs' 'program-payload.mjs' 'imported-rm-selector-policy.mjs' 'tests/imported-rm-selector-policy.test.mjs' 'program-serialization.mjs' 'superset-serialization.mjs' 'program-calendar.mjs' 'saved-templates.mjs' 'saved-template-list.mjs' 'saved-template-unit-memory.mjs' 'training-evidence.mjs' 'science-decision-groups.mjs' 'training-research.mjs' 'research-batch-projection.mjs' 'tests/research-batch-projection.test.mjs' 'unit-interpretation.mjs' 'workout-data.mjs' 'session-recovery.mjs' 'credential-store.mjs' 'native-login.mjs' 'workout-json-interop.mjs' 'portable-plan-codec.mjs' 'portable-source-schema.mjs' 'tests/portable-plan-codec.test.mjs' 'portable-source-adapter.mjs' 'portable-shared-plan.mjs' 'shared-plan-artifact-store.mjs' 'tests/shared-plan-artifact-store.test.mjs' 'tests/portable-shared-plan.test.mjs' 'retained-portable-source.mjs' 'saved-source-reconstruction.mjs' 'saved-execution-match.mjs' 'tests/saved-execution-match.test.mjs' 'tests/saved-export-roundtrip.test.mjs' 'saved-presentation.mjs' 'saved-response-header-diagnostics.mjs' 'saved-preset-display-page.mjs' 'saved-preset-read-scope.mjs' 'tests/saved-preset-display-page.test.mjs' 'tests/saved-header-fixture.mjs' 'tests/saved-response-header-diagnostics.test.mjs' 'imported-candidate-completion.mjs' 'tests/imported-candidate-completion.test.mjs' 'tests/retained-portable-source.test.mjs' 'tests/portable-source-adapter.test.mjs' 'tests/portable-public-dispatch.test.mjs' 'tests/portable-full-stdio.test.mjs' 'tests/shared-plan-instructions.test.mjs' 'native-workout-reader.mjs' 'completed-calendar-identity.mjs' 'tests/completed-calendar-identity.test.mjs' 'tests/completed-calendar-dispatch.test.mjs' 'tests/athlete-history-coverage.test.mjs' 'tests/session-date-binding.test.mjs' 'tests/saved-edit-disclosure.test.mjs' 'tests/history-range-report.test.mjs' 'tests/today-resilience.test.mjs' 'native-health-reader.mjs' 'bounded-read-batch.mjs' 'tests/bounded-health-batch.test.mjs' 'tests/bounded-health-transport.test.mjs' 'recovery-context.mjs' 'tests/recovery-context.test.mjs' 'tests/recovery-context-integration.test.mjs' 'tests/recovery-fixture.mjs' 'tests/native-health-reader.test.mjs' 'tests/reported-health-dispatch.test.mjs' 'native-workout-summary.mjs' 'profile-secret-storage.mjs' 'account-readiness.mjs' 'coaching-profile.mjs' 'coaching-memory.mjs' 'accessory-requirement-confirmation.mjs' 'coaching-memory-lock.mjs' 'preference-compliance.mjs' 'reported-session-summary.mjs' 'tests/reported-session-summary-public.test.mjs' 'period-statistics.mjs' 'tests/period-statistics-public.test.mjs' 'sketch-time.mjs' 'tests/sketch-time.test.mjs' 'tests/sketch-time-dispatch.test.mjs' 'tests/account-unit-conflict.test.mjs' 'time-budget.mjs' 'tests/time-budget.test.mjs' 'tests/native-detail-conflicts.test.mjs' 'tests/executable-preview-rows.test.mjs' 'tests/native-session-unit.test.mjs' 'tests/native-semantics.test.mjs' 'tests/create-response-code.test.mjs'  'history-channel-load.mjs' 'evidence-pack.mjs' 'tests/evidence-pack.test.mjs' 'tests/history-channel-load.test.mjs'  'tests/history-channel-load-dispatch.test.mjs' 'tests/chat-error-guidance.test.mjs' 'tests/saved-edit-676.test.mjs' 'tests/native-customize-boundaries.test.mjs' 'tests/native-unit-identities.test.mjs' 'tests/native-history-scanner.test.mjs' 'tests/time-app-range-preservation.test.mjs' 'tests/preference-preflight.test.mjs' 'tests/technique-entry-identity.test.mjs' 'tests/dose-diagnostics.test.mjs' 'tests/time-side-rest.test.mjs' 'tests/science-workflow-instructions.test.mjs' 'tests/time-budget-public-preview.test.mjs' 'tests/time-budget-late-transport.test.mjs' 'tests/preference-compliance.test.mjs' 'reviewed-plan-record.mjs' 'tests/reviewed-plan-record.test.mjs' 'reviewed-plan-store.mjs' 'tests/reviewed-plan-store.test.mjs' 'cycle-draft-store.mjs' 'cycle-continuation-identity.mjs' 'tests/cycle-continuation-identity.test.mjs' 'tests/cycle-continuation-process.test.mjs' 'tests/fixtures/continuation-process-worker.mjs' 'scalable-cycle-dispatch.mjs' 'bounded-cycle-json.mjs' 'streaming-cycle-preparation.mjs' 'tests/cycle-draft-store.test.mjs' 'tests/scientific-cycle-fixture.mjs' 'training-cycle-executor.mjs' 'tests/training-cycle-executor.test.mjs' 'training-cycle-prescription.mjs' 'tests/training-cycle-prescription.test.mjs' 'tests/training-cycle-preview.test.mjs' 'tests/model-plan-ledger-instructions.test.mjs' 'tests/fixtures/skill-instructions.mjs' 'training-cycle-audit.mjs' 'cycle-style-compliance.mjs' 'tests/training-cycle-audit.test.mjs' 'training-schedule-pattern.mjs' 'tests/training-schedule-pattern.test.mjs' 'injury-safety.mjs' 'equipment-plan-safety.mjs' 'athlete-context.mjs' 'REFERENCE_CLIENT_PARITY_AUDIT.md' 'README.md' 'SKILL.md' 'instructions-core.md' 'instructions-account.md' 'instructions-history.md' 'instructions-catalog.md' 'instructions-design.md' 'instructions-cycle.md' 'instructions-write.md' 'skills/speediance-coach/instructions-core.md' 'skills/speediance-coach/instructions-account.md' 'skills/speediance-coach/instructions-history.md' 'skills/speediance-coach/instructions-catalog.md' 'skills/speediance-coach/instructions-design.md' 'skills/speediance-coach/instructions-cycle.md' 'skills/speediance-coach/instructions-sharing.md' 'skills/speediance-coach/instructions-write.md' 'skills/training-science/instructions-core.md' 'skills/training-science/instructions-science.md' 'tests/injury-safety.test.mjs' 'tests/equipment-plan-safety.test.mjs' 'tests/equipment-inventory.test.mjs' 'tests/coaching-profile.test.mjs' 'tests/coaching-memory.test.mjs' 'tests/installer-cleanup.test.mjs' 'tests/auth-diagnostics.test.mjs' 'tests/session-displacement-diagnostics.test.mjs' 'tests/saved-template-unit-memory.test.mjs' 'tests/saved-template-list.test.mjs' 'tests/saved-template-page-observation.test.mjs' 'tests/accessory-confirmation-full-dispatch.test.mjs' 'tests/goal-preset-routing.test.mjs'
  'skills/speediance-coach/instructions-completed.md' 'skills/speediance-coach/instructions-common.md' 'skills/speediance-coach/instructions-saved.md' 'skills/speediance-coach/instructions-fiction.md' 'skills/speediance-coach/instructions-design-fiction.md' 'skills/speediance-coach/instructions-routing.json' 'skills/speediance-coach/instructions-quicktest.md' 'tests/task-scoped-instructions.test.mjs' 'skills/speediance-coach/instructions-plan-lean.md' 'skills/speediance-coach/instructions-saved-edit-lean.md' 'scripts/saved-edit-lean-atoms.json' 'skills/training-science/instructions-plan-lean.md' 'skills/training-science/instructions-fiction-lean.md' 'tests/lean-plan-routing.test.mjs' 'tests/preview-shape-fastfail.test.mjs' 'tests/quicktest-legacy-pending.test.mjs'
  'skills/speediance-coach/SKILL.md' 'skills/speediance-coach/instructions-router-exceptions.md' 'skills/speediance-coach/references/gym-monster-equipment-and-modes.md' 'skills/training-science/SKILL.md' 'skills/training-science/references/resistance-training-evidence.md' 'science-guidance-index.mjs' 'tests/science-guidance-index.test.mjs'
  'skills/training-science/instructions-public-research.md'
  'scripts/plugin-files.txt' 'scripts/keyring-runtime.json' 'scripts/install-keyring-runtime.mjs' 'scripts/install-codex-desktop.ps1'
  'scripts/install-codex-desktop.bat' 'scripts/install-codex-desktop.sh'
  'scripts/install-codex-desktop.command'
  'template-capacity.mjs' 'training-volume.mjs' 'goal-preset-routing.mjs' 'smart-rm-readiness.mjs' 'tests/smart-rm-readiness.test.mjs'
  'tests/smart-rm-model-contract.test.mjs' 'tests/scientific-saved-edit.test.mjs' 'tests/saved-edit-late-expiry.test.mjs' 'tests/write-approval-replay.test.mjs' 'tests/load-readback-parity.test.mjs' 'tests/fixed-kg-account-units.test.mjs' 'tests/customize-preview-load.test.mjs' 'tests/static-wire-quantization.test.mjs' 'customize-load-step.mjs' 'official-course-reservation.mjs' 'tests/official-course-reservation.test.mjs' 'tests/static-protocol-saved-roundtrip.test.mjs' 'tests/static-protocol-presentation.test.mjs' 'STATIC_PROTOCOL_MCP_AUDIT.md' 'static-load-protocol.mjs' 'static-protocol-context.mjs' 'tests/static-protocol-context.test.mjs' 'tests/workout-cable-display.test.mjs' 'tests/vita-history-semantics.test.mjs' 'tests/saved-vita-readback.test.mjs' 'tests/unilateral-evidence-binding.test.mjs' 'tests/saved-side-presentation.test.mjs' 'tests/unilateral-mcp-roundtrip.test.mjs' 'tests/unilateral-prescription.test.mjs' 'unilateral-prescription.mjs' 'tests/static-load-protocol.test.mjs' 'REFERENCE_CLIENT_UPSTREAM_CONFLICTS.md' 'AUTH_CLIENT_IDENTITY_AUDIT.md' 'saved-plan-identity.mjs' 'tests/saved-plan-identity.test.mjs' 'tests/duplicate-unit-memory.test.mjs' 'saved-edit-diff.mjs' 'tests/saved-edit-diff.test.mjs' 'tests/saved-schedule-science.test.mjs' 'executable-plan-sections.mjs' 'tests/executable-plan-sections.test.mjs' 'tests/executable-plan-sections-serialization.test.mjs' 'tests/training-evidence.test.mjs' 'tests/science-decision-groups.test.mjs' 'tests/selected-accessory-preflight.test.mjs' 'tests/superset-serialization.test.mjs' 'tests/duplicate-saved-patches.test.mjs' 'official-courses.mjs' 'tests/official-courses.test.mjs' 'official-programs.mjs' 'tests/official-programs.test.mjs' 'tests/official-program-day-dispatch.test.mjs' 'static-load-wire-units.mjs' 'tests/static-load-wire-units.test.mjs' 'static-load-limits.mjs' 'tests/static-load-limits.test.mjs' 'cable-load-telemetry.mjs' 'tests/cable-load-telemetry.test.mjs' 'load-channel-presentation.mjs' 'tests/load-channel-presentation.test.mjs' 'free-lift-data.mjs' 'tests/free-lift-data.test.mjs' 'completed-session-reader.mjs' 'session-heart-rate.mjs' 'session-rowing-telemetry.mjs' 'tests/session-rowing-telemetry.test.mjs' 'tests/session-rowing-dispatch.test.mjs' 'tests/session-rowing-transport.test.mjs' 'tests/session-heart-rate.test.mjs' 'tests/session-heart-dispatch.test.mjs' 'tests/session-heart-transport.test.mjs' 'completed-history-comparison.mjs' 'completed-history-comparison-reader.mjs' 'tests/completed-history-comparison.test.mjs' 'tests/completed-history-comparison-reader.test.mjs' 'tests/completed-history-comparison-transport.test.mjs' 'skills/speediance-coach/references/completed-history-comparison.md' 'skills/speediance-coach/references/tools-reference.md' 'tests/tools-reference.test.mjs' 'completed-exercise-history.mjs' 'completed-setting-codes.mjs' 'tests/completed-setting-codes.test.mjs' 'tests/completed-session-reader.test.mjs' 'tests/completed-exercise-history.test.mjs'
  'THIRD_PARTY_NOTICES.md' 'skills/speediance-coach/references/reference-client-feature-parity.md' 'skills/speediance-coach/references/speediance-api-knowledge.md'
)
for required in "${required_files[@]}"; do
  [[ "$required" == tests/* ]] && continue
  found=0
  for relative in "${files[@]}"; do [[ "$relative" == "$required" ]] && found=1; done
  (( found == 1 )) || { echo "Canonical package list is missing required file: $required" >&2; exit 1; }
done
for relative in "${files[@]}"; do
  [[ -f "$plugin_root/$relative" ]] || { echo "Missing GM Coach file: $relative" >&2; exit 1; }
done

cleanup_install() {
  local exit_status=$?
  trap - EXIT
  if [[ -n "$tmp_dir" && -d "$tmp_dir" ]]; then
    if ! rm -rf -- "$tmp_dir"; then
      echo "Could not remove GM Coach installer temporary path: $tmp_dir" >&2
      (( exit_status != 0 )) || exit_status=1
    fi
  fi
  if [[ -n "$staging_dir" && -d "$staging_dir" ]]; then
    if ! rm -rf -- "$staging_dir"; then
      echo "Could not remove GM Coach installer temporary path: $staging_dir" >&2
      (( exit_status != 0 )) || exit_status=1
    fi
  fi
  if [[ -n "$marketplace_tmp" && -f "$marketplace_tmp" ]]; then
    if ! rm -f -- "$marketplace_tmp"; then
      echo "Could not remove GM Coach installer temporary path: $marketplace_tmp" >&2
      (( exit_status != 0 )) || exit_status=1
    fi
  fi
  return "$exit_status"
}
trap cleanup_install EXIT

staging_dir="$(mktemp -d "$plugin_parent/.gm-coach-staging.XXXXXX")"
runtime_dir="$staging_dir/runtime"
binary_dir="$staging_dir/bin"
for relative in "${files[@]}"; do
  destination="$staging_dir/$relative"
  mkdir -p "$(dirname "$destination")"
  cp -f "$plugin_root/$relative" "$destination"
done
mkdir -p "$runtime_dir" "$binary_dir" "$marketplace_dir"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/gm-coach-install.XXXXXX")"

node_bin="$runtime_dir/bin/node"
node_runtime_reused=0
runtime_target_matches() {
  local actual_target
  actual_target="$("$1" -p 'process.platform + "-" + process.arch' 2>/dev/null || true)"
  [[ "$actual_target" == "$node_os-$node_arch" ]]
}
if (( update == 1 && refresh_dependencies == 0 )) && [[ -x "$plugin_dir/runtime/bin/node" ]]; then
  existing_node_version="$("$plugin_dir/runtime/bin/node" --version 2>/dev/null || true)"
  if [[ "$existing_node_version" =~ ^v24\.[0-9]+\.[0-9]+$ ]] && runtime_target_matches "$plugin_dir/runtime/bin/node"; then
    cp -R "$plugin_dir/runtime/." "$runtime_dir/"
    node_runtime_reused=1
    echo "Reusing the installed Node.js 24 runtime ($existing_node_version)."
  fi
fi
if (( update == 1 && refresh_dependencies == 0 )) && [[ -d "$plugin_dir/node_modules" && ! -L "$plugin_dir/node_modules" ]]; then
  cp -R "$plugin_dir/node_modules" "$staging_dir/"
fi
node_major=0
if [[ -x "$node_bin" ]]; then
  node_version="$("$node_bin" --version 2>/dev/null || true)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  [[ "$node_major" =~ ^[0-9]+$ ]] || node_major=0
fi
if [[ ! -x "$node_bin" ]] || (( node_major != 24 )); then
  echo 'Downloading a private Node.js 24 LTS runtime and verifying its SHA-256...'
  node_checksums="$tmp_dir/node-SHA256SUMS.txt"
  curl -fsSL 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$node_checksums"
  node_archive="$(awk -v os="$node_os" -v arch="$node_arch" 'length($1)==64 { name=$2; sub(/^\*/, "", name); suffix="-" os "-" arch ".tar.xz"; if (index(name, "node-v24.")==1 && substr(name, length(name)-length(suffix)+1)==suffix) { print name; exit }' "$node_checksums")"
  [[ -n "$node_archive" ]] || { echo "Node.js 24 LTS has no ${node_os}-${node_arch} download." >&2; exit 1; }
  node_expected="$(awk -v file="$node_archive" '{name=$2; sub(/^\*/, "", name); if (name==file) { print $1; exit }}' "$node_checksums")"
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$tmp_dir/$node_archive"
  node_actual="$(sha256_file "$tmp_dir/$node_archive")"
  node_actual="$(printf '%s' "$node_actual" | tr '[:upper:]' '[:lower:]')"
  node_expected="$(printf '%s' "$node_expected" | tr '[:upper:]' '[:lower:]')"
  [[ "$node_actual" == "$node_expected" ]] || { echo 'Node.js download failed SHA-256 verification.' >&2; exit 1; }
  if ! tar -tJf "$tmp_dir/$node_archive" >/dev/null 2>&1; then
    echo 'This tar installation cannot extract Node.js .tar.xz archives. Install xz support or use a supported macOS/Linux distribution, then retry.' >&2
    exit 1
  fi
  mkdir -p "$runtime_dir"
  tar -xJf "$tmp_dir/$node_archive" -C "$tmp_dir"
  node_folder="${node_archive%.tar.xz}"
  cp -R "$tmp_dir/$node_folder/." "$runtime_dir/"
  node_bin="$runtime_dir/bin/node"
  chmod +x "$node_bin"
fi

runtime_target_matches "$node_bin" || { echo 'Node.js runtime platform/architecture does not match the requested target.' >&2; exit 1; }

cli_bin="$binary_dir/speediance-cli"
if (( update == 1 && refresh_dependencies == 0 && node_runtime_reused == 1 )) && [[ -x "$plugin_dir/bin/speediance-cli" ]]; then
  cp "$plugin_dir/bin/speediance-cli" "$cli_bin"
  chmod +x "$cli_bin"
  echo 'Reusing the installed Speediance CLI.'
fi
if (( refresh_dependencies == 1 )) || [[ ! -x "$cli_bin" ]]; then
  echo 'Downloading Speediance CLI and verifying the published SHA-256...'
  release_json="$tmp_dir/release.json"
  curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: GM-Coach-Installer' \
    'https://api.github.com/repos/stozo04/speediance-cli/releases/latest' -o "$release_json"
  archive_name="speediance-cli_${release_os}_${release_arch}.tar.gz"
  checksum_url="$("$node_bin" - "$release_json" "$archive_name" <<'NODE'
const fs = require('node:fs');
const [releasePath, assetName] = process.argv.slice(2);
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const asset = release.assets.find(item => item.name === assetName);
const checksums = release.assets.find(item => item.name === 'checksums.txt');
if (!asset || !checksums) process.exit(3);
process.stdout.write(JSON.stringify({ archive: asset.browser_download_url, checksums: checksums.browser_download_url }));
NODE
  )" || { echo "The latest Speediance CLI release has no $archive_name or checksums.txt." >&2; exit 1; }
  archive_url="$(printf '%s' "$checksum_url" | "$node_bin" -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).archive))")"
  checksums_url="$(printf '%s' "$checksum_url" | "$node_bin" -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).checksums))")"
  curl -fsSL "$archive_url" -o "$tmp_dir/$archive_name"
  curl -fsSL "$checksums_url" -o "$tmp_dir/cli-checksums.txt"
  cli_expected="$(awk -v file="$archive_name" '$2==file || $2=="*"file { print $1; exit }' "$tmp_dir/cli-checksums.txt")"
  [[ -n "$cli_expected" ]] || { echo "No SHA-256 checksum was published for $archive_name." >&2; exit 1; }
  cli_actual="$(sha256_file "$tmp_dir/$archive_name")"
  cli_actual="$(printf '%s' "$cli_actual" | tr '[:upper:]' '[:lower:]')"
  cli_expected="$(printf '%s' "$cli_expected" | tr '[:upper:]' '[:lower:]')"
  [[ "$cli_actual" == "$cli_expected" ]] || { echo 'Speediance CLI download failed SHA-256 verification.' >&2; exit 1; }
  mkdir -p "$tmp_dir/cli" "$binary_dir"
  tar -xzf "$tmp_dir/$archive_name" -C "$tmp_dir/cli"
  cli_file="$(find "$tmp_dir/cli" -type f -name speediance-cli -print -quit)"
  [[ -n "$cli_file" ]] || { echo 'The verified archive does not contain speediance-cli.' >&2; exit 1; }
  cp "$cli_file" "$cli_bin"
  chmod +x "$cli_bin"
fi

keyring_args=("$staging_dir/scripts/install-keyring-runtime.mjs" --root "$staging_dir" --platform "$node_os" --arch "$node_arch")
if [[ "$node_os" == linux ]]; then
  keyring_libc=gnu
  libc_version="$(ldd --version 2>&1 || true)"
  if grep -qi musl <<<"$libc_version"; then keyring_libc=musl; fi
  keyring_args+=(--libc "$keyring_libc")
fi
if (( refresh_dependencies == 1 )); then keyring_args+=(--force); fi
"$node_bin" "${keyring_args[@]}"

marketplace_tmp="$marketplace_dir/.marketplace.gm-coach-$$-$RANDOM.tmp"
export GM_COACH_PLUGIN_DIR="$staging_dir"
export GM_COACH_INSTALL_PATH="$plugin_dir"
export GM_COACH_CODEX_HOME="$codex_home"
export GM_COACH_MARKETPLACE_PATH="$marketplace_path"
export GM_COACH_MARKETPLACE_TEMP="$marketplace_tmp"
export GM_COACH_HOME_DIR="$home_dir"
data_path="$("$node_bin" - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const pluginDir = process.env.GM_COACH_PLUGIN_DIR;
const homeDir = process.env.GM_COACH_HOME_DIR;
const installPath = process.env.GM_COACH_INSTALL_PATH;
const codexHome = process.env.GM_COACH_CODEX_HOME;
const dataRoot = path.join(codexHome, 'plugins', 'data');
const legacyRoot = path.join(dataRoot, 'agent-plugins');
const matches = [];
for (const directory of [path.join(codexHome, 'plugins'), dataRoot, legacyRoot]) {
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('GM Coach data path contains a symbolic link; refusing to redirect local account data.');
  }
}
if (fs.existsSync(legacyRoot)) {
  for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(legacyRoot, entry.name);
    if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error('GM Coach legacy data contains a symbolic link; refusing to redirect local account data.');
    const accounts = path.join(candidate, 'accounts');
    if (!fs.existsSync(accounts) || !fs.statSync(accounts).isDirectory()) continue;
    const profiles = fs.readdirSync(accounts, { withFileTypes: true });
    const hasCoachData = profiles.some(profile => {
      if (!profile.isDirectory()) return false;
      const profilePath = path.join(accounts, profile.name);
      return ['speediance-config.json', 'training-profile.json']
        .some(name => fs.existsSync(path.join(profilePath, name)));
    });
    if (hasCoachData) matches.push(candidate);
  }
}
if (matches.length > 1) throw new Error('Found more than one existing GM Coach data directory. Update stopped to protect account data.');
const dataPath = matches[0] || path.join(dataRoot, 'gm-coach');
fs.mkdirSync(dataPath, { recursive: true });
const homeReal = fs.realpathSync(codexHome);
const dataReal = fs.realpathSync(dataPath);
if (dataReal !== homeReal && !dataReal.startsWith(homeReal + path.sep)) {
  throw new Error('GM Coach data directory resolves outside CODEX_HOME.');
}
for (let current = dataPath; current !== codexHome && current !== path.dirname(current); current = path.dirname(current)) {
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
    throw new Error('GM Coach data path contains a symbolic link; refusing to redirect local account data.');
  }
}
for (const file of ['.mcp.json', 'mcp.json']) {
  const configPath = path.join(pluginDir, file);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const server = config.mcpServers?.['gm-coach'];
  if (!server) throw new Error(`GM Coach MCP entry is missing in ${file}`);
  // Agent Plugins accepts only a bare executable name or a path contained in the plugin.
  // Keep the executable and script relative to the plugin root; absolute paths are rejected.
  server.command = './runtime/bin/node';
  server.args = ['./mcp_server.mjs'];
  server.cwd = '${PLUGIN_ROOT}';
  server.env ||= {};
  server.env.SPEEDIANCE_CLI = path.join(installPath, 'bin', 'speediance-cli');
  delete server.env.PLUGIN_DATA;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

const marketplacePath = process.env.GM_COACH_MARKETPLACE_PATH;
const marketplaceTempPath = process.env.GM_COACH_MARKETPLACE_TEMP;
let marketplace = { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
if (fs.existsSync(marketplacePath)) marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
marketplace.name ||= 'personal';
marketplace.interface ||= { displayName: 'Personal' };
marketplace.plugins ||= [];
marketplace.plugins = marketplace.plugins.filter(plugin => plugin.name !== 'gm-coach');
const pluginRelativePath = path.relative(homeDir, installPath).split(path.sep).join('/');
if (pluginRelativePath === '..' || pluginRelativePath.startsWith('../')) {
  throw new Error('CODEX_HOME points outside your home folder. Set it to a location under your home folder, then rerun setup.');
}
marketplace.plugins.push({
  name: 'gm-coach',
  source: { source: 'local', path: `./${pluginRelativePath}` },
  policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
  category: 'Health & Fitness'
});
fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
fs.writeFileSync(marketplaceTempPath, `${JSON.stringify(marketplace, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
process.stdout.write(dataPath);
NODE
)"

had_existing_plugin=0
if [[ -e "$plugin_dir" ]]; then
  backup_dir="$(mktemp -d "$plugin_parent/.gm-coach-backup.XXXXXX")"
  rmdir "$backup_dir"
  mv "$plugin_dir" "$backup_dir"
  had_existing_plugin=1
fi
if ! mv "$staging_dir" "$plugin_dir"; then
  if (( had_existing_plugin )); then mv "$backup_dir" "$plugin_dir"; fi
  echo 'Could not promote staged plugin files; the existing installation was restored.' >&2
  exit 1
fi
if ! mv -f "$marketplace_tmp" "$marketplace_path"; then
  rm -rf "$plugin_dir"
  if (( had_existing_plugin )); then mv "$backup_dir" "$plugin_dir"; fi
  echo 'Could not update the personal marketplace; the previous plugin installation was restored.' >&2
  exit 1
fi
marketplace_tmp=''
if (( had_existing_plugin )); then
  # A running MCP can still use the renamed directory through open/mapped files.
  # Its command line may retain the original plugin path, and lsof exit 1 does
  # not by itself establish complete visibility of other processes. Keep this
  # recovery copy until a separate cleanup can positively establish non-use.
  echo "The updated plugin is installed. Keeping the previous GM Coach files at $backup_dir because file-use safety was not positively verified. Codex and MCP were not stopped or restarted." >&2
fi

echo 'GM Coach local package installation completed. Tool availability in the requested chat has not been verified. Any dependencies downloaded in this run passed SHA-256 verification.'
echo "Plugin folder: $plugin_dir"
echo "Marketplace file: $marketplace_path"

installed_node="$plugin_dir/runtime/bin/node"
plugin_data_dir="$data_path"

classify_global_mcp_entry() {
  local mcp_list_json
  if ! mcp_list_json="$(CODEX_HOME="$codex_home" codex mcp list --json 2>/dev/null)"; then
    echo 'inspect-failed'
    return 0
  fi
  printf '%s' "$mcp_list_json" | \
    GM_COACH_EXPECTED_SERVER="$plugin_dir/mcp_server.mjs" \
    GM_COACH_EXPECTED_NODE="$installed_node" \
    GM_COACH_EXPECTED_CLI="$plugin_dir/bin/speediance-cli" \
    GM_COACH_EXPECTED_DATA="$plugin_data_dir" \
    "$installed_node" -e '
// GM_COACH_MCP_ENTRY_CLASSIFIER_START
const path = require("node:path");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const servers = JSON.parse(input);
    const entry = servers.find(server => server.name === "gm_coach_local");
    if (!entry) { process.stdout.write("missing"); return; }

    const transport = entry.transport || {};
    const args = Array.isArray(transport.args) ? transport.args : [];
    const env = transport.env || {};
    const normalizePath = value => {
      if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value)) return null;
      const normalized = path.resolve(value);
      return process.platform === "win32" ? normalized.toLowerCase() : normalized;
    };
    const samePath = (left, right) => {
      const normalizedLeft = normalizePath(left);
      const normalizedRight = normalizePath(right);
      return normalizedLeft !== null && normalizedRight !== null && normalizedLeft === normalizedRight;
    };
    const expectedServer = process.env.GM_COACH_EXPECTED_SERVER;
    const expectedNode = process.env.GM_COACH_EXPECTED_NODE;
    const expectedCli = process.env.GM_COACH_EXPECTED_CLI;
    const expectedData = process.env.GM_COACH_EXPECTED_DATA;
    const hasExpectedServer = args.some(arg => samePath(arg, expectedServer));

    // Only an absolute match to this installed script proves ownership. A generic
    // mcp_server.mjs or speediance-cli basename must never authorize replacement.
    if (transport.type !== "stdio" || !hasExpectedServer) {
      process.stdout.write("name-conflict");
      return;
    }

    const envVars = Array.isArray(transport.env_vars) ? transport.env_vars : [];
    const envNames = Object.keys(env).sort();
    const exactMatch = samePath(transport.command, expectedNode)
      && args.length === 1
      && samePath(args[0], expectedServer)
      && samePath(env.PLUGIN_DATA, expectedData)
      && samePath(env.SPEEDIANCE_CLI, expectedCli)
      && envNames.length === 2
      && envNames.includes("PLUGIN_DATA")
      && envNames.includes("SPEEDIANCE_CLI")
      && envVars.length === 0
      && transport.cwd == null;
    process.stdout.write(exactMatch ? "exact-match" : "stale-gm-coach");
  } catch { process.exit(2); }
});
// GM_COACH_MCP_ENTRY_CLASSIFIER_END
'
}

global_mcp_status='cli-missing'
plugin_added=0
if command -v codex >/dev/null 2>&1; then
  if [[ -z "$plugin_data_dir" ]]; then
    global_mcp_status='inspect-failed'
  else
    global_mcp_status="$(classify_global_mcp_entry)" || global_mcp_status='inspect-failed'
    register_status=''
    case "$global_mcp_status" in
      missing) register_status='registered' ;;
      stale-gm-coach) register_status='updated' ;;
      exact-match|name-conflict|inspect-failed) ;;
      *) global_mcp_status='inspect-failed' ;;
    esac
    if [[ -n "$register_status" ]]; then
      if CODEX_HOME="$codex_home" codex mcp add gm_coach_local \
        --env "PLUGIN_DATA=$plugin_data_dir" \
        --env "SPEEDIANCE_CLI=$plugin_dir/bin/speediance-cli" \
        -- "$installed_node" "$plugin_dir/mcp_server.mjs" >/dev/null; then
        verified_status="$(classify_global_mcp_entry)" || verified_status='inspect-failed'
        if [[ "$verified_status" == 'exact-match' ]]; then
          global_mcp_status="$register_status"
        else
          global_mcp_status='registration-failed'
        fi
      else
        global_mcp_status='registration-failed'
      fi
    fi
  fi

  if CODEX_HOME="$codex_home" codex plugin add gm-coach@personal; then plugin_added=1; fi
fi

case "$global_mcp_status" in
  registered) echo 'Registered the user-level MCP server gm_coach_local. Registration is local configuration only; tool availability in the requested chat has not been verified.' ;;
  exact-match) echo 'The existing user-level gm_coach_local MCP configuration matches the installed GM Coach server, CLI, and data directory.' ;;
  updated) echo 'Updated the recognized stale GM Coach entry gm_coach_local and verified its server, CLI, and data directory.' ;;
  name-conflict) echo 'Warning: an MCP entry named gm_coach_local already exists. Its server identity could not be verified, so it was left unchanged; the GM Coach plugin package was installed separately.' ;;
  cli-missing) echo 'Warning: Codex CLI was not found. Plugin files and the Personal marketplace entry are ready, but automatic plugin activation and global gm_coach_local MCP registration were skipped.' ;;
  inspect-failed) echo 'Warning: Codex CLI could not list MCP servers, so the installer did not risk creating a duplicate gm_coach_local entry.' ;;
  *) echo 'Warning: Codex CLI could not register gm_coach_local. The plugin installation remains available; global MCP registration did not complete.' ;;
esac

if (( plugin_added )); then
  echo 'The Codex CLI reported successful local plugin installation. Attachment of its coaching instructions and bundled gm-coach MCP to the requested chat has not been verified; global gm_coach_local is a separate local connection.'
else
  echo 'The local GM Coach plugin files and Personal marketplace entry are ready. Automatic plugin activation did not complete; verify the installation and attachment controls supported by the application used for the requested chat. This installer does not stop or restart Codex.'
fi
echo 'If GM Coach tools are missing, first verify the tool catalogue and supported controls in that specific chat and application. Only when that application exposes a restart control for the observed GM Coach server, restart that exact server (bundled gm-coach or global gm_coach_local) and open a new chat. This installer does not verify attachment to any chat and does not restart Codex Desktop.'










