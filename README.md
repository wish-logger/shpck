# 🚀 SHPCK - Wish Packer

**Fast, efficient file compression tool for images, videos, and media files**

SHPCK (Wish Packer) is a high-performance compression tool designed to dramatically reduce file sizes while maintaining quality. Perfect for optimizing media files, reducing storage costs, and speeding up file transfers.

## ✨ Features

- **🖼️ Image Compression**: JPEG, PNG, WebP, AVIF support with quality control
- **🎥 Video Compression**: MP4, AVI, MOV, MKV with advanced encoding options
- **⚡ Lightning Fast**: Optimized for speed with parallel processing
- **📊 Batch Processing**: Compress multiple files and folders at once
- **📈 Progress Tracking**: Real-time compression progress and statistics
- **🎛️ Configurable**: Extensive customization options for different use cases
- **📦 Multiple Formats**: Convert between different file formats
- **💾 Size Targets**: Set target file sizes (e.g., 2GB → 200MB)

## 🚀 Quick Start

### Installation

```bash
npm install -g shpck
```

### Basic Usage

```bash
# Compress a single image
shpck compress image.jpg --quality 80

# Compress a video with target size
shpck compress video.mp4 --target-size 200MB

# Batch compress all images in a folder
shpck compress ./photos/*.jpg --output ./compressed

# Advanced video compression
shpck compress video.mp4 --bitrate 1000k --resolution 1080p
```

## 📖 Usage Examples

### Image Compression
```bash
# High quality compression
shpck compress photo.jpg --quality 95 --format webp

# Aggressive compression
shpck compress photo.png --quality 60 --progressive

# Resize and compress
shpck compress image.jpg --width 1920 --height 1080 --quality 85
```

### Video Compression
```bash
# Compress to specific size
shpck compress movie.mp4 --target-size 500MB

# Custom bitrate and codec
shpck compress video.avi --bitrate 2000k --codec h264

# Convert format while compressing
shpck compress video.mov --format mp4 --quality medium
```

### Batch Operations
```bash
# Compress entire directory
shpck compress ./media/ --recursive --output ./compressed

# Multiple file types
shpck compress "*.{jpg,png,mp4,avi}" --quality 80
```

## ⚙️ Configuration

Create a `.shpckrc.json` file for default settings:

```json
{
  "image": {
    "quality": 85,
    "format": "auto",
    "progressive": true
  },
  "video": {
    "codec": "h264",
    "quality": "medium",
    "audio": "aac"
  },
  "output": {
    "suffix": "_compressed",
    "overwrite": false
  }
}
```

## 🔧 API Usage

```javascript
const { compress } = require('shpck');

// Compress image
await compress.image('input.jpg', {
  quality: 80,
  output: 'output.jpg'
});

// Compress video
await compress.video('input.mp4', {
  targetSize: '200MB',
  output: 'output.mp4'
});
```

## 📊 Performance

- **Images**: Up to 80% size reduction with minimal quality loss
- **Videos**: 70-90% size reduction depending on content
- **Speed**: Process 100+ images per minute on modern hardware
- **Memory**: Optimized for low memory usage during batch operations

## 🛠️ Requirements

- Node.js 21+ 
- FFmpeg (for video compression)
- libvips (installed automatically with Sharp)

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

---

**Made with ❤️ for faster, smaller files** 
