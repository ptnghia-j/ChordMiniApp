"""
Import management utilities for ChordMini Flask application.

This module provides utilities for managing imports, lazy loading,
and handling optional dependencies.
"""

import sys
import importlib
from utils.logging import log_info, log_error, log_debug


def lazy_import_librosa():
    """
    Lazy import librosa with patches applied.
    
    This function ensures that scipy patches are applied before importing librosa
    to avoid compatibility issues with certain versions of scipy and librosa.
    
    Returns:
        module: The librosa module
    """
    # Check if librosa is already imported
    if 'librosa' in globals():
        return globals()['librosa']
    
    try:
        # Apply scipy patches before importing librosa
        from scipy_patch import apply_scipy_patches, patch_librosa_beat_tracker, monkey_patch_beat_track
        apply_scipy_patches()
        patch_librosa_beat_tracker()
        monkey_patch_beat_track()

        # Now it's safe to import librosa
        import librosa as _librosa
        globals()['librosa'] = _librosa
        log_debug("Successfully imported librosa with patches applied")
        return _librosa
        
    except ImportError as e:
        log_error(f"Failed to import librosa: {e}")
        raise ImportError(f"librosa is required but not available: {e}")
    except Exception as e:
        log_error(f"Error applying patches or importing librosa: {e}")
        raise


def safe_import(module_name, package=None, fallback=None):
    """
    Safely import a module with optional fallback.
    
    Args:
        module_name: Name of the module to import
        package: Package name for relative imports
        fallback: Fallback value if import fails
        
    Returns:
        module or fallback: The imported module or fallback value
    """
    try:
        if package:
            module = importlib.import_module(module_name, package)
        else:
            module = importlib.import_module(module_name)
        log_debug(f"Successfully imported {module_name}")
        return module
    except ImportError as e:
        log_debug(f"Failed to import {module_name}: {e}")
        if fallback is not None:
            log_debug(f"Using fallback for {module_name}")
            return fallback
        raise


def check_optional_dependency(module_name, feature_name=None):
    """
    Check if an optional dependency is available.
    
    Args:
        module_name: Name of the module to check
        feature_name: Human-readable feature name (optional)
        
    Returns:
        dict: Status information about the dependency
    """
    try:
        importlib.import_module(module_name)
        return {
            'available': True,
            'module': module_name,
            'feature': feature_name or module_name,
            'error': None
        }
    except ImportError as e:
        return {
            'available': False,
            'module': module_name,
            'feature': feature_name or module_name,
            'error': str(e)
        }


def get_module_version(module_name):
    """
    Get the version of an installed module.
    
    Args:
        module_name: Name of the module
        
    Returns:
        str or None: Version string or None if not available
    """
    try:
        module = importlib.import_module(module_name)
        
        # Try different version attributes
        version_attrs = ['__version__', 'version', 'VERSION']
        for attr in version_attrs:
            if hasattr(module, attr):
                version = getattr(module, attr)
                if isinstance(version, str):
                    return version
                elif hasattr(version, '__str__'):
                    return str(version)
        
        # Try using importlib.metadata for newer Python versions
        try:
            import importlib.metadata
            return importlib.metadata.version(module_name)
        except (ImportError, importlib.metadata.PackageNotFoundError):
            pass
            
        return None
        
    except ImportError:
        return None


def lazy_import_with_fallback(primary_module, fallback_modules=None, feature_name=None):
    """
    Lazy import with fallback options.
    
    Args:
        primary_module: Primary module to try importing
        fallback_modules: List of fallback module names
        feature_name: Human-readable feature name
        
    Returns:
        dict: Import result with module and metadata
    """
    fallback_modules = fallback_modules or []
    
    # Try primary module first
    try:
        module = importlib.import_module(primary_module)
        return {
            'success': True,
            'module': module,
            'used_module': primary_module,
            'feature': feature_name or primary_module,
            'is_fallback': False,
            'error': None
        }
    except ImportError as primary_error:
        log_debug(f"Primary module {primary_module} not available: {primary_error}")
        
        # Try fallback modules
        for fallback in fallback_modules:
            try:
                module = importlib.import_module(fallback)
                log_info(f"Using fallback module {fallback} for {feature_name or primary_module}")
                return {
                    'success': True,
                    'module': module,
                    'used_module': fallback,
                    'feature': feature_name or primary_module,
                    'is_fallback': True,
                    'error': None
                }
            except ImportError as fallback_error:
                log_debug(f"Fallback module {fallback} not available: {fallback_error}")
                continue
        
        # No modules available
        error_msg = f"Neither {primary_module} nor fallbacks {fallback_modules} are available"
        log_error(error_msg)
        return {
            'success': False,
            'module': None,
            'used_module': None,
            'feature': feature_name or primary_module,
            'is_fallback': False,
            'error': error_msg
        }


def ensure_module_in_path(module_path):
    """
    Ensure a module path is in sys.path.
    
    Args:
        module_path: Path to add to sys.path
        
    Returns:
        bool: True if path was added or already present
    """
    try:
        import os
        
        if not os.path.exists(module_path):
            log_error(f"Module path does not exist: {module_path}")
            return False
        
        abs_path = os.path.abspath(module_path)
        
        if abs_path not in sys.path:
            sys.path.insert(0, abs_path)
            log_debug(f"Added {abs_path} to sys.path")
        else:
            log_debug(f"Path {abs_path} already in sys.path")
        
        return True
        
    except Exception as e:
        log_error(f"Error adding module path {module_path}: {e}")
        return False


def get_import_diagnostics():
    """
    Get diagnostic information about the import environment.
    
    Returns:
        dict: Diagnostic information
    """
    try:
        import platform
        
        diagnostics = {
            'python_version': platform.python_version(),
            'python_executable': sys.executable,
            'sys_path_length': len(sys.path),
            'sys_path_first_10': sys.path[:10],
            'loaded_modules_count': len(sys.modules),
            'key_modules': {}
        }
        
        # Check key modules
        key_modules = [
            'numpy', 'scipy', 'librosa', 'torch', 'tensorflow',
            'flask', 'requests', 'soundfile', 'matplotlib'
        ]
        
        for module_name in key_modules:
            status = check_optional_dependency(module_name)
            if status['available']:
                version = get_module_version(module_name)
                diagnostics['key_modules'][module_name] = {
                    'available': True,
                    'version': version
                }
            else:
                diagnostics['key_modules'][module_name] = {
                    'available': False,
                    'error': status['error']
                }
        
        return diagnostics
        
    except Exception as e:
        log_error(f"Error getting import diagnostics: {e}")
        return {
            'error': str(e),
            'python_version': sys.version,
            'python_executable': sys.executable
        }
