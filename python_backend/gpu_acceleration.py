"""
GPU Acceleration Utility for ChordMiniApp Python Backend

Provides centralized GPU detection and device management for all ML models.
Supports CUDA (NVIDIA), MPS (Apple Silicon), and CPU fallback.
"""

import torch
import logging
import os
import platform
import warnings
from typing import Dict, Optional, Tuple, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GPUAccelerationManager:
    """
    Centralized GPU acceleration manager for all ML models in ChordMiniApp.
    
    Features:
    - Automatic device detection (CUDA > MPS > CPU)
    - Memory optimization and error handling
    - Device information logging
    - Singleton pattern for consistent device usage
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        """Singleton pattern to ensure consistent device usage across all models"""
        if cls._instance is None:
            cls._instance = super(GPUAccelerationManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize GPU acceleration manager"""
        if self._initialized:
            return
            
        self._device = None
        self._device_info = {}
        self._memory_fraction = 0.85  # Conservative memory usage
        self._initialized = True
        
        # Initialize device detection
        self._detect_and_configure_device()
    
    def _detect_and_configure_device(self):
        """Detect available hardware and configure optimal device"""
        try:
            # Priority: CUDA > MPS > CPU
            if torch.cuda.is_available():
                self._configure_cuda()
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                self._configure_mps()
            else:
                self._configure_cpu()
                
            # Log device information
            self._log_device_info()
            
        except Exception as e:
            logger.warning(f"Error during device configuration: {e}")
            # Fallback to CPU
            self._configure_cpu()
    
    def _configure_cuda(self):
        """Configure CUDA device with optimizations"""
        try:
            self._device = torch.device("cuda")
            
            # Get device properties
            device_props = torch.cuda.get_device_properties(0)
            self._device_info = {
                "type": "cuda",
                "name": torch.cuda.get_device_name(0),
                "count": torch.cuda.device_count(),
                "memory_total": device_props.total_memory,
                "memory_total_gb": device_props.total_memory / (1024**3),
                "compute_capability": torch.cuda.get_device_capability(0),
                "driver_version": torch.version.cuda
            }
            
            # Apply memory optimizations
            try:
                torch.cuda.set_per_process_memory_fraction(self._memory_fraction)
                logger.info(f"Set CUDA memory fraction to {self._memory_fraction}")
            except Exception as e:
                logger.warning(f"Failed to set CUDA memory fraction: {e}")
            
            # Enable cuDNN optimizations for better performance
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.enabled = True
            
            # Clear cache to start fresh
            torch.cuda.empty_cache()
            
        except Exception as e:
            logger.error(f"CUDA configuration failed: {e}")
            self._configure_cpu()
    
    def _configure_mps(self):
        """Configure MPS (Apple Silicon) device"""
        try:
            self._device = torch.device("mps")
            self._device_info = {
                "type": "mps",
                "name": f"Apple Silicon ({platform.processor()})",
                "count": 1,
                "platform": platform.platform()
            }
            
            # MPS-specific optimizations
            # Note: MPS doesn't have memory fraction control like CUDA
            logger.info("Configured MPS device for Apple Silicon")
            
        except Exception as e:
            logger.error(f"MPS configuration failed: {e}")
            self._configure_cpu()
    
    def _configure_cpu(self):
        """Configure CPU device as fallback"""
        self._device = torch.device("cpu")
        self._device_info = {
            "type": "cpu",
            "name": f"CPU ({platform.processor()})",
            "count": os.cpu_count(),
            "platform": platform.platform()
        }
        
        # CPU optimizations
        torch.set_num_threads(min(os.cpu_count(), 8))  # Limit threads for stability
    
    def _log_device_info(self):
        """Log comprehensive device information"""
        device_type = self._device_info["type"].upper()
        device_name = self._device_info["name"]
        
        logger.info(f"🚀 GPU Acceleration Manager initialized")
        logger.info(f"📱 Device: {device_type} - {device_name}")
        
        if self.is_cuda:
            memory_gb = self._device_info["memory_total_gb"]
            compute_cap = self._device_info["compute_capability"]
            logger.info(f"💾 CUDA Memory: {memory_gb:.1f} GB")
            logger.info(f"⚡ Compute Capability: {compute_cap}")
            logger.info(f"🔧 Memory Fraction: {self._memory_fraction}")
        elif self.is_mps:
            logger.info(f"🍎 Apple Silicon GPU acceleration enabled")
        else:
            cpu_count = self._device_info["count"]
            logger.info(f"🖥️  CPU Cores: {cpu_count}")
    
    @property
    def device(self) -> torch.device:
        """Get the optimal PyTorch device"""
        return self._device
    
    @property
    def device_info(self) -> Dict[str, Any]:
        """Get comprehensive device information"""
        return self._device_info.copy()
    
    @property
    def is_cuda(self) -> bool:
        """Check if using CUDA acceleration"""
        return self._device.type == "cuda"
    
    @property
    def is_mps(self) -> bool:
        """Check if using MPS (Apple Silicon) acceleration"""
        return self._device.type == "mps"
    
    @property
    def is_cpu(self) -> bool:
        """Check if using CPU (no GPU acceleration)"""
        return self._device.type == "cpu"
    
    @property
    def is_gpu_accelerated(self) -> bool:
        """Check if any GPU acceleration is available"""
        return self.is_cuda or self.is_mps
    
    def move_to_device(self, tensor_or_model):
        """
        Move tensor or model to the optimal device with error handling
        
        Args:
            tensor_or_model: PyTorch tensor or model to move
            
        Returns:
            Tensor or model moved to the optimal device
        """
        try:
            return tensor_or_model.to(self._device)
        except Exception as e:
            logger.warning(f"Failed to move to {self._device}: {e}")
            # Fallback to CPU
            if not self.is_cpu:
                logger.info("Falling back to CPU")
                self._configure_cpu()
                return tensor_or_model.to(self._device)
            raise
    
    def get_memory_info(self) -> Dict[str, float]:
        """Get current memory usage information"""
        if self.is_cuda:
            try:
                allocated = torch.cuda.memory_allocated() / (1024**3)
                reserved = torch.cuda.memory_reserved() / (1024**3)
                total = self._device_info["memory_total_gb"]
                return {
                    "allocated_gb": allocated,
                    "reserved_gb": reserved,
                    "total_gb": total,
                    "free_gb": total - reserved,
                    "utilization_percent": (reserved / total) * 100
                }
            except Exception as e:
                logger.warning(f"Failed to get CUDA memory info: {e}")
        
        return {"type": self._device_info["type"], "memory_tracking": "not_available"}
    
    def clear_cache(self):
        """Clear GPU cache to free memory"""
        if self.is_cuda:
            try:
                torch.cuda.empty_cache()
                logger.debug("Cleared CUDA cache")
            except Exception as e:
                logger.warning(f"Failed to clear CUDA cache: {e}")


# Global singleton instance
_gpu_manager = None

def get_gpu_manager() -> GPUAccelerationManager:
    """Get the global GPU acceleration manager instance"""
    global _gpu_manager
    if _gpu_manager is None:
        _gpu_manager = GPUAccelerationManager()
    return _gpu_manager

def get_device() -> torch.device:
    """Get the optimal device for ML inference"""
    return get_gpu_manager().device

def get_device_info() -> Dict[str, Any]:
    """Get comprehensive device information"""
    return get_gpu_manager().device_info

def is_gpu_available() -> bool:
    """Check if GPU acceleration is available"""
    return get_gpu_manager().is_gpu_accelerated

def move_to_device(tensor_or_model):
    """Move tensor or model to optimal device"""
    return get_gpu_manager().move_to_device(tensor_or_model)

def log_device_status():
    """Log current device status for debugging"""
    manager = get_gpu_manager()
    logger.info(f"Current device: {manager.device}")
    logger.info(f"GPU accelerated: {manager.is_gpu_accelerated}")
    
    if manager.is_cuda:
        memory_info = manager.get_memory_info()
        logger.info(f"GPU memory: {memory_info['allocated_gb']:.1f}GB allocated, "
                   f"{memory_info['free_gb']:.1f}GB free")
