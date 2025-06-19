const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { FileUtils } = require('../utils/fileUtils');

class VideoCompressor {
  constructor(options = {}) {
    this.options = options;
    
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
      const targetBitrate = Math.floor((targetBytes * 8) / duration / 1024);
      
      command = command.videoBitrate(`${Math.max(100, targetBitrate)}k`);
      command = command.audioBitrate('128k');
    } else if (options.bitrate) {
      command = command.videoBitrate(options.bitrate);
    } else {
      const quality = options.quality || 'medium';
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
    
    command = command
      .addOption('-preset', 'fast')
      .addOption('-movflags', 'faststart')
      .addOption('-pix_fmt', 'yuv420p');
    
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
      'ultrafast': { crf: 28, preset: 'ultrafast' },
      'fast': { crf: 23, preset: 'fast' },
      'medium': { crf: 20, preset: 'medium' },
      'slow': { crf: 18, preset: 'slow' },
      'high': { crf: 15, preset: 'slow' }
    };
    
    const setting = settings[quality] || settings.medium;
    
    if (codec === 'h264' || codec === 'h265') {
      command = command
        .addOption('-crf', setting.crf.toString())
        .addOption('-preset', setting.preset);
    } else {
      const bitrates = {
        'ultrafast': '500k',
        'fast': '1000k',
        'medium': '1500k',
        'slow': '2000k',
        'high': '3000k'
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