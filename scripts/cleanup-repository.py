#!/usr/bin/env python3
"""
Repository Cleanup Script
Reorganizes files and folders to match the standard QuickStart structure
"""

import os
import shutil
from pathlib import Path

# Get repository root
REPO_ROOT = Path(__file__).parent.parent

def create_directories():
    """Create necessary directory structure"""
    dirs = [
        "docs/deployment",
        "docs/troubleshooting",
        "docs/architecture",
        "scripts/utilities",
        "scripts/deployment",
        "scripts/testing"
    ]
    for dir_path in dirs:
        (REPO_ROOT / dir_path).mkdir(parents=True, exist_ok=True)
        print(f"✓ Created directory: {dir_path}")

def move_documentation():
    """Move .md files from root to docs/"""
    doc_files = {
        # Deployment docs
        "AMPLIFY_DEPLOYMENT.md": "docs/deployment/",
        "AMPLIFY-DEPLOYMENT-CRISIS.md": "docs/troubleshooting/",
        "AMPLIFY-ZIP-BUG-RESOLVED.md": "docs/troubleshooting/",
        "CACHE-BUSTING-FIXES.md": "docs/deployment/",
        "DOCUMENT-UPLOAD-STATUS.md": "docs/troubleshooting/",
        "DOCUMENT-UPLOAD-TEST-RESULTS.md": "docs/testing/",

        # Architecture/audit docs
        "ACTIVITY-LOG-FIX-SUMMARY.md": "docs/architecture/",
        "ACTIVITY-LOGGING-AUDIT.md": "docs/architecture/",
        "CHAT-API-FIX-REPORT.md": "docs/troubleshooting/",
        "COST-MONITORING.md": "docs/architecture/",
        "FAMILY-MEMBERS-AUDIT-REPORT.md": "docs/architecture/",
        "FAMILY-MEMBERS-FLOW-DIAGRAM.md": "docs/architecture/",
        "FAMILY-MEMBERS-SUMMARY.md": "docs/architecture/",
        "claude-folder-config-architecture.md": "docs/architecture/",
        "demo-quick-win-output.md": "docs/testing/",
        "SIGNUP-PRIVACY-POLICY-CHANGES.md": "docs/architecture/",
        "TESTING-ACTIVITY-LOGS.md": "docs/testing/",
    }

    for filename, dest_dir in doc_files.items():
        src = REPO_ROOT / filename
        if src.exists():
            dest = REPO_ROOT / dest_dir / filename
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            print(f"✓ Moved {filename} → {dest_dir}")

def move_scripts():
    """Move Python utility scripts to scripts/utilities/"""
    script_patterns = [
        "check-*.py",
        "cleanup-*.py",
        "create-*.py",
        "debug-*.py",
        "add-*.py",
        "test-*.py",
        "verify-*.py"
    ]

    for pattern in script_patterns:
        for script_file in REPO_ROOT.glob(pattern):
            if script_file.name == "cleanup-repository.py":
                continue  # Don't move this script
            dest = REPO_ROOT / "scripts" / "utilities" / script_file.name
            shutil.move(str(script_file), str(dest))
            print(f"✓ Moved {script_file.name} → scripts/utilities/")

def move_deployment_scripts():
    """Move deployment scripts"""
    deployment_scripts = [
        "deploy-to-amplify.py",
    ]

    for script in deployment_scripts:
        src = REPO_ROOT / script
        if src.exists():
            dest = REPO_ROOT / "scripts" / "deployment" / script
            shutil.move(str(src), str(dest))
            print(f"✓ Moved {script} → scripts/deployment/")

def cleanup_temp_files():
    """Remove temporary files and artifacts"""
    patterns_to_remove = [
        "*.zip",
        "*deploy*.out",
        "*deployment*.json",
        "dashboard-*.png",
        "family-profile-issue.png",
        "upload-button-screenshot.png",
        "payload.json",
        "response.json",
        "profile-logs.json",
        "upload-url*.txt",
        "*.ps1",  # PowerShell scripts
        "cors-config.json",
        "amplify-custom-rules.json",
    ]

    # Scan files with weird paths (Windows path issues)
    for item in REPO_ROOT.glob("C:*"):
        if item.is_file():
            item.unlink()
            print(f"✓ Removed temp file: {item.name}")

    for pattern in patterns_to_remove:
        for file_path in REPO_ROOT.glob(pattern):
            if file_path.is_file():
                file_path.unlink()
                print(f"✓ Removed: {file_path.name}")

def cleanup_temp_directories():
    """Remove temporary directories"""
    temp_dirs = [
        "%USERPROFILE%",
        "react-frontend/.amplify-artifacts",
        "react-frontend/test-correct",
        "react-frontend/test-mfa-toggle-zip",
        "react-frontend/test-unzip",
        "react-frontend/coverage",
    ]

    for dir_path in temp_dirs:
        full_path = REPO_ROOT / dir_path
        if full_path.exists() and full_path.is_dir():
            shutil.rmtree(full_path)
            print(f"✓ Removed directory: {dir_path}")

def update_gitignore():
    """Add additional patterns to .gitignore"""
    gitignore_path = REPO_ROOT / ".gitignore"

    additional_patterns = """
# Deployment artifacts
*.zip
deployment*.json
upload-url*.txt
*.out

# Screenshots and images (temporary)
dashboard-*.png
*-screenshot.png

# Test data files
payload.json
response.json
profile-logs.json
*-scan.json

# Frontend build artifacts
react-frontend/build/
react-frontend/.amplify-artifacts/
react-frontend/test-*/
frontend/build/
frontend/.amplify-artifacts/
frontend/test-*/

# E2E test artifacts
e2e-tests/playwright-report/
e2e-tests/test-results/
e2e-tests/reports/

# CDK outputs
infra/cdk.out/
infra/cdk-*.out/
infra/outputs.json

# Branding (if not needed in git)
branding/

# Sample docs (can be recreated)
sample-docs/

# Config files
pyproject.toml
"""

    with open(gitignore_path, 'a') as f:
        f.write(additional_patterns)

    print("✓ Updated .gitignore with additional patterns")

def main():
    """Run all cleanup operations"""
    print("=" * 60)
    print("Repository Cleanup Script")
    print("=" * 60)
    print()

    try:
        print("Step 1: Creating directory structure...")
        create_directories()
        print()

        print("Step 2: Moving documentation files...")
        move_documentation()
        print()

        print("Step 3: Moving utility scripts...")
        move_scripts()
        print()

        print("Step 4: Moving deployment scripts...")
        move_deployment_scripts()
        print()

        print("Step 5: Cleaning up temporary files...")
        cleanup_temp_files()
        print()

        print("Step 6: Cleaning up temporary directories...")
        cleanup_temp_directories()
        print()

        print("Step 7: Updating .gitignore...")
        update_gitignore()
        print()

        print("=" * 60)
        print("✅ Repository cleanup complete!")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Review the changes with 'git status'")
        print("2. Rename 'react-frontend' to 'frontend' manually if desired")
        print("3. Update any path references in scripts and docs")
        print("4. Commit the cleanup changes")

    except Exception as e:
        print(f"\n❌ Error during cleanup: {str(e)}")
        raise

if __name__ == "__main__":
    main()
