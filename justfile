# CodexOS Developer Workflows & Build Recipes
# Modeled after VoiceBox production standards
# Install: cargo install just (or choco install just / winget install just)
# Usage: just --list

# Shell selection: use PowerShell on Windows
set windows-shell := ["powershell", "-NoProfile", "-Command"]

# Default recipe: show available commands
default:
    @just --list

# Full project setup
setup:
    npm install
    cargo check --manifest-path src-tauri/Cargo.toml
    @Write-Host "CodexOS development environment is ready."

# Launch Tauri desktop application in development mode
dev:
    npm run tauri dev

# Start frontend Vite server only
dev-ui:
    npm run dev

# Full production build: compiles frontend assets and creates Windows NSIS installer
build:
    npm run build
    npm run tauri build

# Run all test suites (Rust backend + Vitest frontend)
test: test-backend test-frontend

# Run Rust unit and integration tests
test-backend:
    cargo test --manifest-path src-tauri/Cargo.toml

# Run Vitest frontend component and property tests
test-frontend:
    npx vitest run

# Run fast linter (oxlint)
lint:
    npm run lint
    cargo clippy --manifest-path src-tauri/Cargo.toml -- -A clippy::all

# Run TypeScript typecheck across all modules
typecheck:
    npx tsc -b

# Comprehensive QA: lint + typecheck + test + build check
check: lint typecheck test
    @Write-Host "All CodexOS QA checks passed successfully!"

# Clean build artifacts
clean:
    if (Test-Path dist) { Remove-Item -Recurse -Force dist }
    cargo clean --manifest-path src-tauri/Cargo.toml