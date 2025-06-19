const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { FileUtils } = require('../utils/fileUtils');

class ImageCompressor {
  constructor(options = {}) {
    this.options = options;
    this.speedOptimized = options.speedOptimized || false;
    this.skipOptimizations = options.skipOptimizations || false;
  }

  async compress(inputFile, options = {}) {
    const mergedOptions = { ...this.options, ...options };
    
    const originalStats = await fs.stat(inputFile);
    const originalSize = originalStats.size;
    
    const outputPath = this.generateOutputPath(inputFile, mergedOptions);
    
    let sharpInstance = sharp(inputFile);
    
    const metadata = await sharpInstance.metadata();
    
    sharpInstance = await this.applyTransformations(sharpInstance, metadata, mergedOptions);
    
    await this.applyCompression(sharpInstance, outputPath, mergedOptions);
    
    const compressedStats = await fs.stat(outputPath);
    const compressedSize = compressedStats.size;
    
    return {
      inputFile,
      outputFile: outputPath,
      originalSize,
      compressedSize,
      reduction: ((originalSize - compressedSize) / originalSize * 100).toFixed(2),
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha
      }
    };
  }

  async applyTransformations(sharpInstance, metadata, options) {
    if (options.width || options.height) {
      const resizeOptions = {
        width: options.width ? parseInt(options.width) : null,
        height: options.height ? parseInt(options.height) : null,
        fit: 'inside',
        withoutEnlargement: true
      };
      
      sharpInstance = sharpInstance.resize(resizeOptions);
    }
    
    if (options.targetSize) {
      const targetBytes = this.parseTargetSize(options.targetSize);
      sharpInstance._targetSize = targetBytes;
    }
    
    return sharpInstance;
  }

  async applyCompression(sharpInstance, outputPath, options) {
    const format = this.determineOutputFormat(outputPath, options.format);
    let quality = parseInt(options.quality) || 85;
    
    quality = Math.max(1, Math.min(100, quality));
    
    if (format.toLowerCase() === 'png') {
      if (quality > 95) {
        quality = 90;
      }
    } else if (this.speedOptimized) {
      quality = Math.min(quality, 70);
    }
    
    let compressionOptions = {};
    
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        compressionOptions = {
          quality,
          progressive: this.speedOptimized ? false : (options.progressive || true),
          mozjpeg: !this.speedOptimized,
          optimiseScans: !this.skipOptimizations,
          optimiseCoding: !this.skipOptimizations
        };
        
        if (sharpInstance._targetSize) {
          await this.compressToTargetSize(sharpInstance, outputPath, 'jpeg', compressionOptions);
        } else {
          await sharpInstance.jpeg(compressionOptions).toFile(outputPath);
        }
        break;
        
      case 'png':
        const pngCompressionLevel = this.speedOptimized ? 6 : 9;
        const shouldUsePalette = quality < 90 || this.speedOptimized;
        
        compressionOptions = {
          compressionLevel: pngCompressionLevel,
          adaptiveFiltering: !this.skipOptimizations,
          palette: shouldUsePalette,
          quality: Math.min(quality, 95),
          progressive: false
        };
        
        if (sharpInstance._targetSize) {
          await this.compressToTargetSize(sharpInstance, outputPath, 'png', compressionOptions);
        } else {
          await sharpInstance.png(compressionOptions).toFile(outputPath);
        }
        break;
        
      case 'webp':
        compressionOptions = {
          quality,
          lossless: false,
          effort: this.speedOptimized ? 1 : 4,
          nearLossless: false
        };
        
        if (sharpInstance._targetSize) {
          await this.compressToTargetSize(sharpInstance, outputPath, 'webp', compressionOptions);
        } else {
          await sharpInstance.webp(compressionOptions).toFile(outputPath);
        }
        break;
        
      case 'avif':
        compressionOptions = {
          quality,
          lossless: false,
          effort: this.speedOptimized ? 1 : 4
        };
        
        if (sharpInstance._targetSize) {
          await this.compressToTargetSize(sharpInstance, outputPath, 'avif', compressionOptions);
        } else {
          await sharpInstance.avif(compressionOptions).toFile(outputPath);
        }
        break;
        
      default:
        await sharpInstance.jpeg({ quality, progressive: true }).toFile(outputPath);
    }
  }

  async compressToTargetSize(sharpInstance, outputPath, format, baseOptions) {
    const targetSize = sharpInstance._targetSize;
    let quality = baseOptions.quality || 85;
    let attempts = 0;
    const maxAttempts = 15;
    
    if (format === 'png') {
      let compressionLevel = baseOptions.compressionLevel || 9;
      let usePalette = baseOptions.palette;
      
      while (attempts < maxAttempts) {
        const options = { 
          ...baseOptions, 
          quality: Math.min(quality, 95),
          compressionLevel,
          palette: usePalette
        };
        
        const buffer = await sharpInstance.png(options).toBuffer();
        
        if (buffer.length <= targetSize || quality <= 10) {
          await fs.writeFile(outputPath, buffer);
          break;
        }
        
        if (attempts < 5) {
          quality = Math.max(10, quality - 15);
        } else if (attempts < 10) {
          usePalette = true;
          compressionLevel = Math.min(9, compressionLevel + 1);
        } else {
          quality = Math.max(10, quality - 5);
        }
        
        attempts++;
      }
    } else {
      while (attempts < maxAttempts) {
        const options = { ...baseOptions, quality };
        
        let buffer;
        
        switch (format) {
          case 'jpeg':
            buffer = await sharpInstance.jpeg(options).toBuffer();
            break;
          case 'webp':
            buffer = await sharpInstance.webp(options).toBuffer();
            break;
          case 'avif':
            buffer = await sharpInstance.avif(options).toBuffer();
            break;
        }
        
        if (buffer.length <= targetSize || quality <= 10) {
          await fs.writeFile(outputPath, buffer);
          break;
        }
        
        const compressionRatio = buffer.length / targetSize;
        if (compressionRatio > 2) {
          quality = Math.max(10, quality - 20);
        } else if (compressionRatio > 1.5) {
          quality = Math.max(10, quality - 15);
        } else {
          quality = Math.max(10, quality - 10);
        }
        
        attempts++;
      }
    }
  }

  determineOutputFormat(outputPath, formatOption) {
    if (formatOption && formatOption !== 'auto') {
      return formatOption;
    }
    
    const ext = path.extname(outputPath).toLowerCase();
    
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'jpeg';
      case '.png':
        return 'png';
      case '.webp':
        return 'webp';
      case '.avif':
        return 'avif';
      default:
        return 'png';
    }
  }

  generateOutputPath(inputFile, options) {
    if (options.output) {
      if (options.output.endsWith('/') || options.output.endsWith('\\')) {
        const basename = path.basename(inputFile, path.extname(inputFile));
        const ext = this.getOutputExtension(inputFile, options.format);
        const suffix = options.overwrite ? '' : '_compressed';
        return path.join(options.output, `${basename}${suffix}${ext}`);
      } else {
        return options.output;
      }
    } else {
      const dir = path.dirname(inputFile);
      const basename = path.basename(inputFile, path.extname(inputFile));
      const ext = this.getOutputExtension(inputFile, options.format);
      const suffix = options.overwrite ? '' : '_compressed';
      return path.join(dir, `${basename}${suffix}${ext}`);
    }
  }

  getOutputExtension(inputFile, formatOption) {
    if (formatOption && formatOption !== 'auto') {
      switch (formatOption.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          return '.jpg';
        case 'png':
          return '.png';
        case 'webp':
          return '.webp';
        case 'avif':
          return '.avif';
        default:
          return path.extname(inputFile);
      }
    }
    
    return path.extname(inputFile);
  }

  parseTargetSize(targetSize) {
    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };
    
    const match = targetSize.toString().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
    
    if (!match) {
      throw new Error(`Invalid target size format: ${targetSize}`);
    }
    
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    return Math.floor(value * units[unit]);
  }
}

module.exports = { ImageCompressor }; 