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
    let originalSize, outputPath, sharpInstance, metadata;

    if (Buffer.isBuffer(inputFile)) {
      originalSize = inputFile.length;
      sharpInstance = sharp(inputFile);
      metadata = await sharpInstance.metadata();
      sharpInstance = await this.applyTransformations(sharpInstance, metadata, mergedOptions);
      if (sharpInstance._targetSize) {
        sharpInstance._originalSize = originalSize;
      }
      const format = this.determineOutputFormat('fragment.jpg', mergedOptions.format);
      let buffer;
      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          buffer = await sharpInstance.jpeg({ quality: mergedOptions.quality || 85 }).toBuffer();
          break;
        case 'png':
          buffer = await sharpInstance.png({ quality: mergedOptions.quality || 85 }).toBuffer();
          break;
        case 'webp':
          buffer = await sharpInstance.webp({ quality: mergedOptions.quality || 85 }).toBuffer();
          break;
        case 'avif':
          buffer = await sharpInstance.avif({ quality: mergedOptions.quality || 50 }).toBuffer();
          break;
        default:
          buffer = await sharpInstance.jpeg({ quality: mergedOptions.quality || 85 }).toBuffer();
      }
      return {
        inputFile,
        outputFile: null,
        originalSize,
        compressedSize: buffer.length,
        buffer,
        reduction: ((originalSize - buffer.length) / originalSize * 100).toFixed(2),
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          hasAlpha: metadata.hasAlpha
        }
      };
    } else {
      const originalStats = await fs.stat(inputFile);
      originalSize = originalStats.size;
      outputPath = this.generateOutputPath(inputFile, mergedOptions);
      sharpInstance = sharp(inputFile);
      metadata = await sharpInstance.metadata();
      sharpInstance = await this.applyTransformations(sharpInstance, metadata, mergedOptions);
      if (sharpInstance._targetSize) {
        sharpInstance._originalSize = originalSize;
      }
      const finalOutputPath = await this.applyCompression(sharpInstance, outputPath, mergedOptions);
      const actualOutputPath = finalOutputPath || outputPath;
      const compressedStats = await fs.stat(actualOutputPath);
      const compressedSize = compressedStats.size;
      return {
        inputFile,
        outputFile: actualOutputPath,
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
    } else if (this.speedOptimized && !options.quality) {
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
          return await this.compressToTargetSize(sharpInstance, outputPath, 'jpeg', compressionOptions, sharpInstance._originalSize);
        } else {
          await sharpInstance.jpeg(compressionOptions).toFile(outputPath);
          return outputPath;
        }
        break;
        
      case 'png':
        const pngCompressionLevel = this.speedOptimized ? 6 : 9;
        const shouldUsePalette = quality < 90 || this.speedOptimized;
        
        if (!this.options.skip) {
          console.log(`🔧 PNG Settings: quality=${quality}, level=${pngCompressionLevel}, palette=${shouldUsePalette}, ultrafast=${this.speedOptimized}`);
        }
        
        compressionOptions = {
          compressionLevel: pngCompressionLevel,
          adaptiveFiltering: !this.skipOptimizations,
          palette: shouldUsePalette,
          quality: Math.min(quality, 95),
          progressive: false
        };
        
        if (sharpInstance._targetSize) {
          return await this.compressToTargetSize(sharpInstance, outputPath, 'png', compressionOptions, sharpInstance._originalSize);
        } else {
          await sharpInstance.png(compressionOptions).toFile(outputPath);
          return outputPath;
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
          return await this.compressToTargetSize(sharpInstance, outputPath, 'webp', compressionOptions, sharpInstance._originalSize);
        } else {
          await sharpInstance.webp(compressionOptions).toFile(outputPath);
          return outputPath;
        }
        break;
        
      case 'avif':
        compressionOptions = {
          quality,
          lossless: false,
          effort: this.speedOptimized ? 1 : 4
        };
        
        if (sharpInstance._targetSize) {
          return await this.compressToTargetSize(sharpInstance, outputPath, 'avif', compressionOptions, sharpInstance._originalSize);
        } else {
          await sharpInstance.avif(compressionOptions).toFile(outputPath);
          return outputPath;
        }
        break;
        
      default:
        await sharpInstance.jpeg({ quality, progressive: true }).toFile(outputPath);
        return outputPath;
    }
  }

  async compressToTargetSize(sharpInstance, outputPath, format, baseOptions, originalSize) {
    const targetSize = sharpInstance._targetSize;
    const maxAttempts = 25;
    
    if (!this.options.skip) {
      console.log(`🎯 Target size: ${(targetSize / 1024).toFixed(1)}KB`);
      const compressionRatio = (targetSize / originalSize * 100).toFixed(2);
      console.log(`📊 Required compression: ${compressionRatio}% of original size`);
      console.log(`🔍 Debug: originalSize=${originalSize}, targetSize=${targetSize}, ratio=${(targetSize / originalSize).toFixed(4)}`);
    }
    
    const compressionRatio = targetSize / originalSize;
    if (compressionRatio < 0.10) {
      console.log(`🚀 EXTREME COMPRESSION MODE TRIGGERED! (ratio: ${(compressionRatio * 100).toFixed(2)}%)`);
      return await this.extremeCompressionStrategy(sharpInstance, outputPath, format, baseOptions, originalSize, targetSize);
    }
    
    if (!this.options.skip) {
      console.log(`📝 Using standard compression (ratio: ${(compressionRatio * 100).toFixed(2)}% >= 10%)`);
    }
    
    return await this.standardCompressionStrategy(sharpInstance, outputPath, format, baseOptions, originalSize, targetSize, maxAttempts);
  }

  async extremeCompressionStrategy(sharpInstance, outputPath, format, baseOptions, originalSize, targetSize) {
    if (!this.options.skip) {
      console.log(`🚀 EXTREME compression mode activated! Parallel processing...`);
    }
    
    const strategies = [
      { format: 'png', quality: 1, compressionLevel: 9, palette: true },
      
      { format: 'jpeg', quality: 1 },
      { format: 'jpeg', quality: 3 },
      { format: 'jpeg', quality: 5 },
      { format: 'jpeg', quality: 8 },
      
      { format: 'webp', quality: 1, effort: 0 },
      { format: 'webp', quality: 3, effort: 0 },
      { format: 'webp', quality: 5, effort: 0 },
      
      { format: 'jpeg', quality: 10, resize: 0.1 },
      { format: 'jpeg', quality: 15, resize: 0.15 },
      { format: 'jpeg', quality: 20, resize: 0.2 },
      { format: 'jpeg', quality: 25, resize: 0.25 },
      { format: 'jpeg', quality: 30, resize: 0.3 },
      
      { format: 'webp', quality: 10, resize: 0.1, effort: 0 },
      { format: 'webp', quality: 15, resize: 0.15, effort: 0 },
      { format: 'webp', quality: 20, resize: 0.2, effort: 0 },
      
      { format: 'png', quality: 1, resize: 0.1, compressionLevel: 9, palette: true },
      { format: 'png', quality: 1, resize: 0.15, compressionLevel: 9, palette: true },
      
      { format: 'jpeg', quality: 5, resize: 0.05 },
      { format: 'webp', quality: 5, resize: 0.05, effort: 0 },
    ];
    
    const keepDims = this.options.keepDimensions || (baseOptions && baseOptions.keepDimensions);
    let usedStrategies = strategies;
    if (keepDims) {
      usedStrategies = strategies.filter(s => !s.resize);
    }
    const promises = usedStrategies.map(async (strategy, index) => {
      try {
        let instance = sharpInstance.clone();
        
        if (strategy.resize && !keepDims) {
          const metadata = await sharpInstance.metadata();
          const newWidth = Math.max(1, Math.floor(metadata.width * strategy.resize));
          const newHeight = Math.max(1, Math.floor(metadata.height * strategy.resize));
          instance = instance.resize(newWidth, newHeight, { 
            fit: 'inside',
            withoutEnlargement: true,
            kernel: 'nearest',
          });
        }
        
        let buffer;
        const startTime = Date.now();
        
        switch (strategy.format) {
          case 'png':
            buffer = await instance.png({
              quality: strategy.quality,
              compressionLevel: strategy.compressionLevel,
              palette: strategy.palette,
              adaptiveFiltering: false,
              progressive: false,
              colours: strategy.resize ? 16 : 256
            }).toBuffer();
            break;
            
          case 'jpeg':
            buffer = await instance.jpeg({
              quality: strategy.quality,
              progressive: false,
              mozjpeg: false,
              optimiseScans: false,
              optimiseCoding: false,
              trellisQuantisation: false,
              overshootDeringing: false,
              optimizeScans: false
            }).toBuffer();
            break;
            
          case 'webp':
            buffer = await instance.webp({
              quality: strategy.quality,
              effort: strategy.effort || 0,
              lossless: false,
              nearLossless: false,
              smartSubsample: false,
              preset: 'picture'
            }).toBuffer();
            break;
        }
        
        const processingTime = Date.now() - startTime;
        
        return {
          index,
          strategy,
          buffer,
          size: buffer.length,
          processingTime,
          success: buffer.length <= targetSize
        };
        
      } catch (error) {
        return {
          index,
          strategy,
          error: error.message,
          success: false
        };
      }
    });
    
    if (!this.options.skip) {
      console.log(`⚡ Testing ${strategies.length} compression strategies in parallel...`);
      console.log(`🎯 Target: ${(targetSize / 1024).toFixed(1)}KB from ${(originalSize / (1024*1024)).toFixed(1)}MB`);
    }
    
    const results = await Promise.all(promises);
    
    const successful = results
      .filter(r => r.success && !r.error)
      .sort((a, b) => a.size - b.size);
      
    const fastest = results
      .filter(r => r.success && !r.error)
      .sort((a, b) => a.processingTime - b.processingTime)[0];
      
    const bestQuality = results
      .filter(r => r.success && !r.error)
      .sort((a, b) => b.size - a.size)[0];
    
    if (!this.options.skip) {
      console.log(`📊 Parallel results (${results.length} strategies tested):`);
      results.forEach((result, i) => {
        if (result.error) {
          console.log(`  ❌ Strategy ${i + 1}: ${result.error}`);
        } else {
          const size = (result.size / 1024).toFixed(1);
          const time = result.processingTime;
          const status = result.success ? '✅' : '❌';
          const desc = this.getStrategyDescription(result.strategy);
          console.log(`  ${status} Strategy ${i + 1}: ${size}KB (${time}ms) - ${desc}`);
        }
      });
      
      if (fastest && !fastest.error) {
        console.log(`⚡ Fastest strategy: ${(fastest.size / 1024).toFixed(1)}KB in ${fastest.processingTime}ms`);
      }
      
      if (bestQuality && bestQuality !== successful[0]) {
        console.log(`🎨 Best quality option: ${(bestQuality.size / 1024).toFixed(1)}KB - ${this.getStrategyDescription(bestQuality.strategy)}`);
      }
    }
    
    if (successful.length > 0) {
      let filteredSuccessful = successful;
      let filteredFastest = fastest;
      let filteredBestQuality = bestQuality;
      
      if (this.options.format && this.options.format !== 'auto') {
        const targetFormat = this.options.format.toLowerCase();
        filteredSuccessful = successful.filter(r => r.strategy.format.toLowerCase() === targetFormat);
        filteredFastest = results
          .filter(r => r.success && !r.error && r.strategy.format.toLowerCase() === targetFormat)
          .sort((a, b) => a.processingTime - b.processingTime)[0];
        filteredBestQuality = filteredSuccessful.length > 0 ? 
          filteredSuccessful.sort((a, b) => b.size - a.size)[0] : null;
          
        if (filteredSuccessful.length === 0) {
          if (!this.options.skip) {
            console.log(`⚠️ No ${targetFormat.toUpperCase()} strategies achieved target. Using best available format.`);
          }
          filteredSuccessful = successful;
          filteredFastest = fastest;
          filteredBestQuality = bestQuality;
        } else {
          if (!this.options.skip) {
            console.log(`🎯 Format restricted to ${targetFormat.toUpperCase()} (${filteredSuccessful.length} options available)`);
          }
        }
      }
      
      let chosen;
      const strategy = this.options.strategy || 'auto';
      
      switch (strategy) {
        case 'size':
          chosen = filteredSuccessful[0];
          break;
        case 'speed':
          chosen = filteredFastest || filteredSuccessful[0];
          break;
        case 'quality':
          chosen = filteredBestQuality || filteredSuccessful[0];
          break;
        case 'auto':
        default:
          chosen = this.selectBestStrategy(filteredSuccessful, filteredFastest, filteredBestQuality, targetSize);
          break;
      }
      
      const ext = this.getExtensionForFormat(chosen.strategy.format);
      const finalOutputPath = outputPath.replace(/\.[^.]+$/, ext);
      
      await fs.writeFile(finalOutputPath, chosen.buffer);
      
      if (!this.options.skip) {
        const compressionAchieved = ((originalSize - chosen.size) / originalSize * 100).toFixed(2);
        console.log(`📏 ${(originalSize / (1024*1024)).toFixed(1)}MB → ${(chosen.size / 1024).toFixed(1)}KB (${compressionAchieved}% reduction)`);
        const strategyName = strategy === 'auto' ? 'auto-optimized' : strategy;
        console.log(`🔧 Strategy used: ${strategyName} - ${this.getStrategyDescription(chosen.strategy)}`);
        console.log(`💾 Saved as: ${path.basename(finalOutputPath)}`);
        console.log(`⚡ Processing time: ${chosen.processingTime}ms`);
        
        if (strategy !== 'size' && successful[0] !== chosen) {
          console.log(`💡 Size strategy would give: ${(successful[0].size / 1024).toFixed(1)}KB`);
        }
        if (strategy !== 'speed' && fastest !== chosen && fastest) {
          console.log(`💡 Speed strategy would give: ${(fastest.size / 1024).toFixed(1)}KB in ${fastest.processingTime}ms`);
        }
        if (strategy !== 'quality' && bestQuality !== chosen) {
          console.log(`💡 Quality strategy would give: ${(bestQuality.size / 1024).toFixed(1)}KB`);
        }
      }
      
      return finalOutputPath;
    }
    
    if (!this.options.skip) {
      console.log(`⚠️ No parallel strategy achieved target. Falling back to iterative approach...`);
    }
    
    return await this.standardCompressionStrategy(sharpInstance, outputPath, format, baseOptions, originalSize, targetSize, 15);
  }

  selectBestStrategy(successful, fastest, bestQuality, targetSize) {
    if (!successful || successful.length === 0) return null;
    
    const smallest = successful[0];
    
    if (successful.length === 1) {
      if (!this.options.skip) {
        console.log(`🤖 Auto-strategy: Only one option - choosing smallest`);
      }
      return smallest;
    }
    
    const sizeRange = bestQuality ? (bestQuality.size - smallest.size) / 1024 : 0;
    const timeRange = fastest ? (smallest.processingTime - fastest.processingTime) : 0;
    const targetSizeKB = targetSize / 1024;
    
    if (fastest === smallest) {
      if (!this.options.skip) {
        console.log(`🤖 Auto-strategy: Perfect combo - fastest AND smallest!`);
        console.log(`   💎 Best of both worlds: ${(smallest.size / 1024).toFixed(1)}KB in ${smallest.processingTime}ms`);
      }
      return smallest;
    }
    
    const qualityUtilization = bestQuality ? (bestQuality.size / targetSize) * 100 : 0;
    const sizeUtilization = (smallest.size / targetSize) * 100;
    
    if (bestQuality && qualityUtilization <= 95) {
      if (!this.options.skip) {
        console.log(`🤖 Auto-strategy: Quality fits budget (${qualityUtilization.toFixed(1)}% of ${targetSizeKB.toFixed(1)}KB) - quality wins!`);
        console.log(`   🎨 Better image: ${(bestQuality.size / 1024).toFixed(1)}KB vs Smallest: ${(smallest.size / 1024).toFixed(1)}KB`);
      }
      return bestQuality;
    } else {
      if (!this.options.skip) {
        if (bestQuality) {
          console.log(`🤖 Auto-strategy: Quality too close to budget (${qualityUtilization.toFixed(1)}% > 95%)`);
        } else {
          console.log(`🤖 Auto-strategy: No quality option available - choosing smallest`);
        }
        console.log(`   💾 Safe choice: ${(smallest.size / 1024).toFixed(1)}KB of ${targetSizeKB.toFixed(1)}KB budget`);
      }
      return smallest;
    }
    
    if (timeRange > 500 && sizeRange < 0.5 && fastest) {
      if (!this.options.skip) {
        console.log(`🤖 Auto-strategy: Huge time saving (${timeRange}ms) for tiny size cost - speed wins!`);
                 console.log(`   ⚡ Time saved: ${timeRange}ms, Size cost: +${((fastest.size - smallest.size) / 1024).toFixed(1)}KB`);
      }
      return fastest;
    }
    
    if (!this.options.skip) {
      console.log(`🤖 Auto-strategy: When in doubt, choose smallest file!`);
      console.log(`   🏆 Winner: ${(smallest.size / 1024).toFixed(1)}KB (size priority)`);
    }
    
    return smallest;
  }
  
  calculateEfficiencyScore(option, smallest, fastest) {
    if (!option || !smallest || !fastest) return 0;
    
    const sizeScore = 1 - ((option.size - smallest.size) / (smallest.size || 1));
    const timeScore = fastest.processingTime > 0 ? 
      1 - ((option.processingTime - fastest.processingTime) / fastest.processingTime) : 1;
    
    return (sizeScore * 0.7) + (timeScore * 0.3);
  }

  getStrategyDescription(strategy) {
    let desc = strategy.format.toUpperCase();
    if (strategy.quality) desc += ` Q${strategy.quality}`;
    if (strategy.resize) desc += ` ${(strategy.resize * 100)}%size`;
    if (strategy.effort) desc += ` E${strategy.effort}`;
    return desc;
  }

  getExtensionForFormat(format) {
    switch (format) {
      case 'jpeg': return '.jpg';
      case 'png': return '.png';
      case 'webp': return '.webp';
      case 'avif': return '.avif';
      default: return '.jpg';
    }
  }

  async standardCompressionStrategy(sharpInstance, outputPath, format, baseOptions, originalSize, targetSize, maxAttempts) {
    if (["jpeg", "jpg", "webp", "avif"].includes(format)) {
      let minQ = 5;
      let maxQ = baseOptions.quality || 85;
      let bestBuffer = null;
      let bestQ = minQ;
      let bestSize = Infinity;
      let lastGoodQ = null;
      let lastGoodBuffer = null;
      let attempts = 0;
      const orig = sharpInstance.clone();
      while (minQ <= maxQ && attempts < maxAttempts) {
        const q = Math.floor((minQ + maxQ) / 2);
        let buffer;
        let inst = orig.clone();
        switch (format) {
          case "jpeg":
          case "jpg":
            buffer = await inst.jpeg({ quality: q, progressive: baseOptions.progressive !== false }).toBuffer();
            break;
          case "webp":
            buffer = await inst.webp({ quality: q, effort: baseOptions.speedOptimized ? 1 : 4 }).toBuffer();
            break;
          case "avif":
            buffer = await inst.avif({ quality: q, effort: baseOptions.speedOptimized ? 1 : 4 }).toBuffer();
            break;
        }
        if (buffer.length <= targetSize) {
          lastGoodQ = q;
          lastGoodBuffer = buffer;
          bestSize = buffer.length;
          minQ = q + 1;
        } else {
          maxQ = q - 1;
        }
        attempts++;
      }
      if (lastGoodBuffer) {
        await fs.writeFile(outputPath, lastGoodBuffer);
        return outputPath;
      } else {
        let inst = orig.clone();
        let buffer;
        switch (format) {
          case "jpeg":
          case "jpg":
            buffer = await inst.jpeg({ quality: minQ, progressive: baseOptions.progressive !== false }).toBuffer();
            break;
          case "webp":
            buffer = await inst.webp({ quality: minQ, effort: baseOptions.speedOptimized ? 1 : 4 }).toBuffer();
            break;
          case "avif":
            buffer = await inst.avif({ quality: minQ, effort: baseOptions.speedOptimized ? 1 : 4 }).toBuffer();
            break;
        }
        await fs.writeFile(outputPath, buffer);
        return outputPath;
      }
    }
    if (format === "png") {
      let bestBuffer = null;
      let bestSize = Infinity;
      const orig = sharpInstance.clone();
      const levels = baseOptions.speedOptimized ? [3, 6] : [6, 9];
      const palettes = [true, false];
      for (const compressionLevel of levels) {
        for (const palette of palettes) {
          let inst = orig.clone();
          let buffer = await inst.png({
            compressionLevel,
            palette,
            quality: Math.min(baseOptions.quality || 85, 95),
            progressive: false
          }).toBuffer();
          if (buffer.length < bestSize) {
            bestSize = buffer.length;
            bestBuffer = buffer;
          }
          if (buffer.length <= targetSize) {
            await fs.writeFile(outputPath, buffer);
            return outputPath;
          }
        }
      }
      await fs.writeFile(outputPath, bestBuffer);
      return outputPath;
    }
    return outputPath;
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