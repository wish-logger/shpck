# 🚀 SHPCK - Wish Packer

**Ultra-fast, multi-threaded file compression tool for images, videos, and media files**

SHPCK (Wish Packer) is a high-performance compression tool designed to dramatically reduce file sizes while maintaining quality. Built with speed in mind, featuring multi-threading, worker threads, and intelligent auto-optimization for maximum performance. 

**Built specifically for [Wish Logger](https://wishlogger.xyz/) - a Discord logging bot that requires efficient compression of user-uploaded files & videos**

## ✨ Features

- **🖼️ Image Compression**: JPEG, PNG, WebP, AVIF support with quality control
- **🎥 Video Compression**: MP4, AVI, MOV, MKV with advanced encoding options
- **🧵 Multi-Threading**: Worker threads for maximum CPU utilization
- **⚡ Ultra-Fast Mode**: Speed-optimized compression with quality trade-offs
- **📊 Batch Processing**: Compress multiple files and folders at once
- **🤖 Smart Auto-Detection**: Auto-enables multi-threading for 4+ files or >3GB files
- **📈 Progress Tracking**: Real-time compression progress and statistics
- **🎛️ Configurable**: Extensive customization options for different use cases
- **📦 Multiple Formats**: Convert between different file formats
- **💾 Size Targets**: Set target file sizes (e.g., 2GB → 200MB)
- **🔧 System Optimization**: Automatic CPU core detection and optimization warnings

## 🚀 Quick Start

### Installation

```bash
# Global installation (CLI usage)
npm install -g shpck

# Local installation (API usage with TypeScript support)
npm install shpck
```

### Basic Usage (CLI)

```bash
# Compress a single image
shpck compress image.jpg --quality 80

# Ultra-fast compression with multi-threading
shpck compress photos/*.jpg --ultrafast --threads 8

# Compress large video (auto-enables multi-threading)
shpck compress huge-video-5GB.mp4 --target-size 200MB

# Speed demon mode (maximum performance)
shpck compress *.* --ultrafast --no-optimize --threads 16 -s
```

### Basic Usage (API)

```javascript
const { compress } = require('shpck');

// Simple compression
await compress(['image.jpg'], {
  quality: 80,
  output: 'compressed.jpg'
});

// Advanced compression with threading
await compress(['video.mp4'], {
  ultrafast: true,
  threads: 4,
  targetSize: '4MB',
  skip: true // quiet mode
});
```

## ⚡ Speed & Performance Features

### Multi-Threading
```bash
# Auto-detection (recommended)
shpck compress photos/*.jpg --ultrafast

# Custom thread count
shpck compress videos/*.mp4 --threads 12

# Force multi-threading for small batches
shpck compress file1.jpg file2.png --force-threads
```

### Speed Modes
```bash
# Ultra-fast mode (2-3x faster)
shpck compress image.jpg --ultrafast

# No optimizations (4-8x faster for batches)
shpck compress *.jpg --ultrafast --no-optimize

# Quiet mode (minimal output)
shpck compress batch/*.* --ultrafast -s
```

### Auto-Threading Triggers
- **4+ files** in batch processing
- **Single files >3GB** automatically
- **Manual override** with `--multi-thread`

## 📖 Usage Examples

### Image Compression
```bash
# High quality compression with multi-threading
shpck compress photos/*.jpg --quality 95 --threads 8

# Ultra-fast batch processing
shpck compress images/*.png --ultrafast --no-optimize -s

# Resize and compress with target size
shpck compress image.jpg --width 1920 --target-size 5MB
```

### Video Compression
```bash
# Large file (auto-enables multi-threading)
shpck compress movie-4GB.mp4 --target-size 500MB

# Speed-optimized video compression
shpck compress video.avi --ultrafast --bitrate 2000k --codec h264

# Batch video processing
shpck compress videos/*.mov --threads 16 --format mp4 -s
```

### Batch Operations
```bash
# Multi-threaded directory compression
shpck compress ./media/ --recursive --ultrafast --threads 12

# Speed demon mode for large batches
shpck compress "*.{jpg,png,mp4,avi}" --ultrafast --no-optimize --threads 16 -s
```

## 🧵 Multi-Threading Performance

### System Optimization
- **Auto-detection**: Uses optimal thread count based on CPU cores
- **Conservative**: 1.5x CPU cores for normal mode
- **Ultra-fast**: 2x CPU cores for speed mode
- **Over-subscription warning**: Alerts when worker count exceeds optimal
- **Memory monitoring**: Warns about high RAM usage (>85%)
- **Disk I/O detection**: Identifies HDD vs SSD for optimization

### Example Performance (12-core system)
```bash
# System detected: 12 cores, 16GB RAM
# Normal Mode: ~18 threads
# Ultra-Fast Mode: ~24 threads  
# Custom: --threads 16 (user specified)
```

### Speed Improvements
- **Normal → Ultra-Fast**: 2-3x faster
- **Normal → Speed Demon**: 4-8x faster  
- **Large batches**: 10-20x faster with multi-threading
- **Single large files**: 8-12x faster with worker threads

## 📋 Installation Options

| Method | CLI Access | TypeScript | IntelliSense | Use Case |
|--------|------------|------------|--------------|----------|
| `npm install -g shpck` | ✅ `shpck compress` | ❌ | ❌ | Command line only |
| `npm install shpck` | ❌ | ✅ | ✅ | API development |
| `npx shpck` | ✅ `npx shpck compress` | ✅ | ✅ | Best of both |

### For API Development

```bash
# Install locally for TypeScript support
npm install shpck
```

```javascript
// Full TypeScript support and IntelliSense
import shpck from 'shpck';

await shpck.compress(['input.jpg'], {
  quality: 100,        // ✅ Type checked
  ultrafast: true,     // ✅ Autocomplete
  threads: 4,          // ✅ Parameter hints
  targetSize: '4MB',   // ✅ Format validation
  skip: true           // ✅ Documentation
});
```

## 🔧 API Reference

### Compression Options

```typescript
interface CompressionOptions {
  quality?: number;          // 1-100, image/video quality
  ultrafast?: boolean;       // Speed optimization mode
  output?: string;           // Output file path
  threads?: number;          // Worker thread count
  skip?: boolean;            // Quiet mode (no logs)
  forceThreads?: boolean;    // Force multi-threading
  targetSize?: string;       // Target file size (e.g., "4MB")
  format?: string;           // Output format (auto, jpg, mp4, etc.)
  strategy?: 'auto' | 'size' | 'quality' | 'speed';
  codec?: 'h264' | 'h265' | 'vp9' | 'av1';
  bitrate?: string;          // Video bitrate (e.g., "2M")
  width?: number;            // Target width
  height?: number;           // Target height
  recursive?: boolean;       // Process directories
  overwrite?: boolean;       // Overwrite existing files
}
```

### API Methods

```javascript
// Compress files
const result = await shpck.compress(files, options);
console.log(`Processed: ${result.processed}`);
console.log(`Saved: ${result.totalSizeReduction} bytes`);

// Analyze files (estimate compression)
const analysis = await shpck.analyze(files, options);
console.log(`Potential savings: ${analysis.estimatedSavings} bytes`);

// Manage configuration
await shpck.config({ init: true });
```

## ⚙️ Configuration

Create a `.shpckrc.json` file for default settings:

```json
{
  "image": {
    "quality": 85,
    "format": "auto",
    "progressive": true,
    "speedOptimized": false
  },
  "video": {
    "codec": "h264",
    "quality": "medium",
    "audio": "aac",
    "preset": "fast"
  },
  "threading": {
    "autoEnable": true,
    "maxThreads": 16,
    "largeFileThreshold": "3GB"
  },
  "output": {
    "suffix": "_compressed",
    "overwrite": false,
    "quiet": false
  }
}
```

## 📊 Performance Benchmarks

### Speed Comparisons
- **Images**: Process 500+ images per minute on 12-core systems
- **Videos**: Up to 8x faster compression with multi-threading
- **Large files**: >3GB files automatically use worker threads
- **Memory**: Optimized for low memory usage during batch operations

### Compression Ratios
- **Images**: Up to 80% size reduction with minimal quality loss
- **Videos**: 70-90% size reduction depending on content
- **Ultra-fast mode**: 60-75% reduction with maximum speed
- **Target size mode**: Precise size control with iterative optimization

## 🛠️ System Requirements

- **Node.js**: 18.17.0+ || 20.3.0+ || 21.0.0+ || 22.0.0+
- **FFmpeg**: Required for video compression
- **Multi-core CPU**: Recommended for optimal performance
- **SSD Storage**: Recommended for large batch operations
- **RAM**: 8GB+ recommended for large file processing

### FFmpeg Installation
```bash
# Windows (via Chocolatey)
choco install ffmpeg

# macOS (via Homebrew)  
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## 🎯 Command Reference

### Speed Optimization Flags
- `--ultrafast`: Maximum speed mode (quality trade-off)
- `--no-optimize`: Skip expensive optimizations
- `--threads <N>`: Custom thread count
- `--multi-thread`: Force multi-threading
- `--force-threads`: Multi-thread even small batches
- `-s, --skip`: Quiet mode (minimal output)

### Common Patterns
```bash
# Discord bot optimized (high speed, good quality)
shpck compress attachment.jpg --quality 80 --ultrafast --threads 4 -s

# Batch processing (maximum speed)
shpck compress uploads/*.* --ultrafast --no-optimize --threads 8 -s

# Size targeting (space optimization)
shpck compress video.mp4 --target-size 8MB --codec h264
```

## 🚨 Performance Tips

### Optimal Settings
- **4-8 core systems**: `--threads 6 --ultrafast`
- **12+ core systems**: `--threads 16 --ultrafast --no-optimize`
- **Large files (>3GB)**: Auto-enabled multi-threading
- **Discord bot usage**: `--ultrafast --threads 4 -s`

### Potential Issues
- **Over-subscription**: Too many threads may slow performance
- **I/O Bottleneck**: HDD may limit speed with many parallel operations
- **Memory Usage**: Large files × many threads = high RAM usage
- **Target size validation**: Tool prevents impossible compression ratios

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

---

**Made with ❤️ for ultra-fast, efficient compression** ⚡🧵🚀