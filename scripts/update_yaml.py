#!/usr/bin/env python3
"""
Script to update local YAML file with the latest version from GitHub.
Preserves original formatting and structure while updating content.
"""

import requests
import os
import shutil
from datetime import datetime

# Configuration
LOCAL_FILE_PATH = "/home/user/PhD_Code/dome-ml-osai-ui/src/assets/ecosystem_components_list.yml"
GITHUB_RAW_URL = "https://raw.githubusercontent.com/BioComputingUP/OSAI_ecosystem/main/data/ecosystem_components_list.yml"
BACKUP_SUFFIX = ".backup"

def create_backup(file_path):
    """Create a backup of the original file with timestamp."""
    if os.path.exists(file_path):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{file_path}{BACKUP_SUFFIX}_{timestamp}"
        shutil.copy2(file_path, backup_path)
        print(f"✓ Backup created: {backup_path}")
        return backup_path
    return None

def download_latest_version(url):
    """Download the latest version from GitHub."""
    try:
        print(f"Downloading from: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()  # Raise an exception for bad status codes
        print("✓ Successfully downloaded latest version")
        return response.text
    except requests.exceptions.RequestException as e:
        print(f"✗ Error downloading file: {e}")
        return None

def update_local_file(file_path, content):
    """Update the local file with new content."""
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Write the new content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✓ Successfully updated: {file_path}")
        return True
    except IOError as e:
        print(f"✗ Error writing to file: {e}")
        return False

def compare_files(file_path, new_content):
    """Compare local file with new content to check if update is needed."""
    if not os.path.exists(file_path):
        print("Local file doesn't exist, will create new file")
        return True
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            local_content = f.read()
        
        if local_content.strip() == new_content.strip():
            print("✓ Local file is already up to date")
            return False
        else:
            print("Local file differs from remote version, updating...")
            return True
    except IOError as e:
        print(f"✗ Error reading local file: {e}")
        return True  # Assume update is needed if we can't read the local file

def main():
    """Main function to orchestrate the update process."""
    print("🔄 Starting YAML file update process...")
    print(f"Local file: {LOCAL_FILE_PATH}")
    print(f"Remote URL: {GITHUB_RAW_URL}")
    print("-" * 60)
    
    # Download the latest version
    new_content = download_latest_version(GITHUB_RAW_URL)
    if new_content is None:
        print("✗ Failed to download latest version. Exiting.")
        return False
    
    # Check if update is needed
    if not compare_files(LOCAL_FILE_PATH, new_content):
        print("✓ No update needed. Process completed.")
        return True
    
    # Create backup of existing file
    backup_path = create_backup(LOCAL_FILE_PATH)
    
    # Update the local file
    success = update_local_file(LOCAL_FILE_PATH, new_content)
    
    if success:
        print("-" * 60)
        print("✅ Update completed successfully!")
        if backup_path:
            print(f"Original file backed up to: {backup_path}")
    else:
        print("✗ Update failed!")
        # Restore from backup if update failed and backup exists
        if backup_path and os.path.exists(backup_path):
            try:
                shutil.copy2(backup_path, LOCAL_FILE_PATH)
                print(f"✓ Restored original file from backup")
            except IOError as e:
                print(f"✗ Failed to restore backup: {e}")
    
    return success

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Process interrupted by user")
    except Exception as e:
        print(f"✗ Unexpected error: {e}")