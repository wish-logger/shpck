const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { FileUtils } = require('../utils/fileUtils');

class VideoCompressor {
  constructor(options = {}) {
    this.options = options;
    this.speedOptimized = options.speedOptimized || false;
    this.skipOptimizations = options.skipOptimizations || false;
    
    this.setupFFmpegPath();
  }

  async compress(inputFile, options = {}) {
    const mergedOptions = { ...this.options, ...options };
    
    const originalStats = await fs.stat(inputFile);
    const originalSize = originalStats.size;
    
    const outputPath = this.generateOutputPath(inputFile, mergedOptions);
    
    const metadata = await this.getVideoMetadata(inputFile);
    
    const ffmpegCommand = this.createFFmpegCommand(inputFile, outputPath, metadata, mergedOptions);
    
    await this.executeCompression(ffmpegCommand);
    
    const compressedStats = await fs.stat(outputPath);
    const compressedSize = compressedStats.size;
    
    return {
      inputFile,
      outputFile: outputPath,
      originalSize,
      compressedSize,
      reduction: ((originalSize - compressedSize) / originalSize * 100).toFixed(2),
      metadata: {
        duration: metadata.format?.duration,
        bitrate: metadata.format?.bit_rate,
        size: metadata.format?.size,
        codec: metadata.streams?.[0]?.codec_name,
        resolution: `${metadata.streams?.[0]?.width}x${metadata.streams?.[0]?.height}`
      }
    };
  }

  createFFmpegCommand(inputFile, outputPath, metadata, options) {
    let command = ffmpeg(inputFile);
    
    const codec = options.codec || 'h264';
    command = command.videoCodec(this.getVideoCodec(codec));
    
    command = command.audioCodec('aac');
    
    if (options.targetSize) {
      const targetBytes = this.parseTargetSize(options.targetSize);
      const duration = metadata.format?.duration || 60;
      
      const audioBitrate = 128;
      const overheadFactor = 0.85;
      const targetBitrate = Math.floor(((targetBytes * 8 * overheadFactor) / duration - audioBitrate * 1024) / 1024);
      
      const finalBitrate = Math.max(200, Math.min(targetBitrate, 50000));
      
      command = command.videoBitrate(`${finalBitrate}k`);
      command = command.audioBitrate('128k');
      
      if (targetBytes < 50 * 1024 * 1024) {
        command = command.addOption('-pass', '1');
      }
    } else if (options.bitrate) {
      command = command.videoBitrate(options.bitrate);
    } else {
      let quality = options.quality || 'medium';
      
      if (typeof quality === 'string' && !isNaN(quality)) {
        const numQuality = parseInt(quality);
        if (numQuality >= 90) quality = 'high';
        else if (numQuality >= 75) quality = 'slow';
        else if (numQuality >= 60) quality = 'medium';
        else if (numQuality >= 40) quality = 'fast';
        else quality = 'ultrafast';
      }
      
      if (this.speedOptimized) {
        quality = 'ultrafast';
      }
      command = this.applyQualitySettings(command, quality, codec);
    }
    
    if (options.width && options.height) {
      command = command.size(`${options.width}x${options.height}`);
    } else if (options.width || options.height) {
      const currentWidth = metadata.streams?.[0]?.width || 1920;
      const currentHeight = metadata.streams?.[0]?.height || 1080;
      const aspectRatio = currentWidth / currentHeight;
      
      if (options.width) {
        const newHeight = Math.round(options.width / aspectRatio);
        command = command.size(`${options.width}x${newHeight}`);
      } else {
        const newWidth = Math.round(options.height * aspectRatio);
        command = command.size(`${newWidth}x${options.height}`);
      }
    }
    
    const preset = this.speedOptimized ? 'ultrafast' : 'fast';
    command = command
      .addOption('-preset', preset)
      .addOption('-movflags', this.skipOptimizations ? '' : 'faststart')
      .addOption('-pix_fmt', 'yuv420p');
    
    if (this.speedOptimized) {
      command = command
        .addOption('-tune', 'zerolatency')
        .addOption('-threads', '0');
    }
    
    const outputFormat = this.getOutputFormat(outputPath);
    if (outputFormat === 'mp4') {
      command = command
        .addOption('-f', 'mp4')
        .addOption('-avoid_negative_ts', 'make_zero');
    }
    
    return command.output(outputPath);
  }

  applyQualitySettings(command, quality, codec) {
    const settings = {
      'ultrafast': { crf: 30, preset: 'ultrafast' },
      'fast': { crf: 26, preset: 'fast' },
      'medium': { crf: 23, preset: 'medium' },
      'slow': { crf: 20, preset: 'slow' },
      'high': { crf: 18, preset: 'veryslow' }
    };
    
    const setting = settings[quality] || settings.medium;
    
    if (codec === 'h264' || codec === 'h265') {
      command = command
        .addOption('-crf', setting.crf.toString())
        .addOption('-preset', setting.preset);
        
      if (codec === 'h265') {
        command = command.addOption('-x265-params', 'log-level=error');
      }
    } else {
      const bitrates = {
        'ultrafast': '800k',
        'fast': '1200k',
        'medium': '1800k',
        'slow': '2500k',
        'high': '4000k'
      };
      command = command.videoBitrate(bitrates[quality] || bitrates.medium);
    }
    
    return command;
  }

  getVideoCodec(codec) {
    const codecMap = {
      'h264': 'libx264',
      'h265': 'libx265',
      'hevc': 'libx265',
      'vp9': 'libvpx-vp9',
      'vp8': 'libvpx',
      'av1': 'libaom-av1'
    };
    
    return codecMap[codec.toLowerCase()] || 'libx264';
  }

  getOutputFormat(outputPath) {
    const ext = path.extname(outputPath).toLowerCase();
    
    switch (ext) {
      case '.mp4':
        return 'mp4';
      case '.avi':
        return 'avi';
      case '.mov':
        return 'mov';
      case '.mkv':
        return 'matroska';
      case '.webm':
        return 'webm';
      default:
        return 'mp4';
    }
  }

  async getVideoMetadata(inputFile) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to get video metadata: ${err.message}`));
        } else {
          resolve(metadata);
        }
      });
    });
  }

  async executeCompression(command) {
    return new Promise((resolve, reject) => {
      command
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          reject(new Error(`Video compression failed: ${err.message}`));
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r  Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .run();
    });
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
        case 'mp4':
          return '.mp4';
        case 'avi':
          return '.avi';
        case 'mov':
          return '.mov';
        case 'mkv':
          return '.mkv';
        case 'webm':
          return '.webm';
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

  setupFFmpegPath() {
    try {
      const { execSync } = require('child_process');
      
      try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
      } catch {
        const commonPaths = [
          'C:\\ffmpeg\\bin\\ffmpeg.exe',
          '/usr/local/bin/ffmpeg',
          '/usr/bin/ffmpeg',
          '/opt/homebrew/bin/ffmpeg'
        ];
        
        for (const ffmpegPath of commonPaths) {
          try {
            const fs = require('fs');
            if (fs.existsSync(ffmpegPath)) {
              ffmpeg.setFfmpegPath(ffmpegPath);
              break;
            }
          } catch {
          }
        }
      }
    } catch (error) {
      console.warn('Warning: FFmpeg path detection failed. Please ensure FFmpeg is installed and accessible.');
    }
  }
}

module.exports = { VideoCompressor }; 