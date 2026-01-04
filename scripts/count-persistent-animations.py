#!/usr/bin/env python3
"""
Script to count animations that require the persistent setting to be enabled.
Looks for 'settings:persistent' in predicates.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List

def find_json_files(directory: Path) -> List[Path]:
    """Find all JSON files in the animations directory."""
    json_files = []
    for root, dirs, files in os.walk(directory):
        # Skip node_modules and other common ignore directories
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', 'build']]
        for file in files:
            if file.endswith('.json'):
                json_files.append(Path(root) / file)
    return json_files

def has_persistent_predicate(data: Any, path: str = "") -> List[str]:
    """
    Recursively search for 'settings:persistent' in predicates.
    Returns a list of paths where it was found.
    """
    found_paths = []
    
    if isinstance(data, dict):
        # Check if this dict has a predicates array with 'settings:persistent'
        if 'predicates' in data:
            predicates = data['predicates']
            if isinstance(predicates, list):
                # Check if 'settings:persistent' is in the predicates
                if 'settings:persistent' in predicates:
                    found_paths.append(path)
                # Also check nested predicate structures
                for pred in predicates:
                    if isinstance(pred, dict):
                        # Could be a nested predicate object
                        if has_persistent_predicate(pred, f"{path}.predicates"):
                            found_paths.extend(has_persistent_predicate(pred, f"{path}.predicates"))
        
        # Recursively check contents
        if 'contents' in data:
            for i, content in enumerate(data['contents']):
                content_path = f"{path}.contents[{i}]" if path else f"contents[{i}]"
                found_paths.extend(has_persistent_predicate(content, content_path))
        
        # Recursively check all other values
        for key, value in data.items():
            if key not in ['predicates', 'contents']:
                new_path = f"{path}.{key}" if path else key
                found_paths.extend(has_persistent_predicate(value, new_path))
    
    elif isinstance(data, list):
        for i, item in enumerate(data):
            item_path = f"{path}[{i}]" if path else f"[{i}]"
            found_paths.extend(has_persistent_predicate(item, item_path))
    
    return found_paths

def main():
    # Get the animations directory (assuming script is in scripts/)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    animations_dir = project_root / 'animations'
    
    if not animations_dir.exists():
        print(f"Error: Animations directory not found at {animations_dir}")
        return
    
    print(f"Scanning animations in: {animations_dir}")
    print("-" * 80)
    
    json_files = find_json_files(animations_dir)
    print(f"Found {len(json_files)} JSON files\n")
    
    total_animations = 0
    persistent_animations = 0
    files_with_persistent = []
    
    for json_file in sorted(json_files):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Count roll options (top-level keys)
            roll_options = [k for k in data.keys() if isinstance(data[k], (list, dict, str))]
            total_animations += len(roll_options)
            
            # Check for persistent predicate
            persistent_paths = has_persistent_predicate(data)
            
            if persistent_paths:
                persistent_animations += len(roll_options)  # Count all roll options in this file
                relative_path = json_file.relative_to(project_root)
                files_with_persistent.append((relative_path, len(roll_options), persistent_paths))
        
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse {json_file}: {e}")
        except Exception as e:
            print(f"Warning: Error processing {json_file}: {e}")
    
    print(f"Total roll options (animation keys): {total_animations}")
    print(f"Roll options in files with persistent predicate: {persistent_animations}")
    print(f"Files with persistent predicate: {len(files_with_persistent)}\n")
    
    if files_with_persistent:
        print("Files requiring persistent setting:")
        print("-" * 80)
        for file_path, count, paths in files_with_persistent:
            print(f"\n{file_path}")
            print(f"  Roll options: {count}")
            print(f"  Persistent predicate locations: {len(paths)}")
            if len(paths) <= 5:
                for path in paths:
                    print(f"    - {path}")
            else:
                print(f"    - {paths[0]} (and {len(paths) - 1} more)")
    
    print("\n" + "=" * 80)
    print(f"Summary: {persistent_animations} out of {total_animations} animation roll options")
    print(f"         are in files that check for 'settings:persistent'")
    print("=" * 80)

if __name__ == '__main__':
    main()

