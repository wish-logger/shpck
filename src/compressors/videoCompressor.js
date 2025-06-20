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
    
    this.setupFFmpegPath();
    
    const originalStats = await fs.stat(inputFile);
    const originalSize = originalStats.size;

    const outputPath = this.generateOutputPath(inputFile, mergedOptions);
    
    const metadata = await this.getVideoMetadata(inputFile);
    
    let finalOutputPath = outputPath;
    
    if (mergedOptions.targetSize) {
      finalOutputPath = await this.compressToTargetSize(inputFile, outputPath, metadata, mergedOptions);
    } else {
      const ffmpegCommand = this.createFFmpegCommand(inputFile, outputPath, metadata, mergedOptions);
      await this.executeCompression(ffmpegCommand);
    }

    const compressedStats = await fs.stat(finalOutputPath);
    const compressedSize = compressedStats.size;

    return {
      inputFile,
      outputFile: finalOutputPath,
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
    
    command = command.audioCodec(this.getAudioCodec());
    
    if (options.bitrate) {
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
    if (this.isLimitedFFmpeg()) {
      const bitrates = {
        'ultrafast': '800k',
        'fast': '1200k',
        'medium': '1800k',
        'slow': '2500k',
        'high': '4000k'
      };
      command = command.videoBitrate(bitrates[quality] || bitrates.medium);
      return command;
    }
    
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
    if (this.isLimitedFFmpeg()) {
      const limitedCodecMap = {
        'h264': 'h264_nvenc',
        'h265': 'h264_nvenc',
        'hevc': 'h264_nvenc',
        'vp9': 'h264_nvenc',
        'vp8': 'h264_nvenc',
        'av1': 'h264_nvenc'
      };
      return limitedCodecMap[codec.toLowerCase()] || 'h264_nvenc';
    }
    
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
          if (err.message.includes('ENOENT') || err.message.includes('spawn ffmpeg ENOENT') || err.message.includes('not recognized')) {
            reject(new Error(`FFmpeg is not installed or not found in PATH. Please install FFmpeg to process video files.\n\nDownload from: https://ffmpeg.org/download.html\nOr install via package manager:\n- Windows: choco install ffmpeg\n- macOS: brew install ffmpeg\n- Linux: sudo apt install ffmpeg`));
          } else if (err.message.includes('show_streams') || err.message.includes('Option not found')) {
            this.extractMetadataWithFfmpeg(inputFile)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(`Failed to get video metadata: ${err.message}`));
          }
        } else {
          resolve(metadata);
        }
      });
    });
  }

  async extractMetadataWithFfmpeg(inputFile) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      let ffmpegPath = 'ffmpeg';
      
      const commonPaths = [
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\SteelSeries\\GG\\apps\\moments\\ffmpeg.exe',
        '/usr/local/bin/ffmpeg',
        '/usr/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg'
      ];
      
      for (const path of commonPaths) {
        try {
          const fs = require('fs');
          if (fs.existsSync(path)) {
            ffmpegPath = path;
            break;
          }
        } catch {}
      }
      
      const ffmpegProcess = spawn(ffmpegPath, ['-i', inputFile], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let errorOutput = '';
      
      ffmpegProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpegProcess.on('close', (code) => {
        try {
          const metadata = this.parseFFmpegOutput(errorOutput);
          resolve(metadata);
        } catch (parseErr) {
          reject(new Error(`Failed to parse video metadata: ${parseErr.message}`));
        }
      });
      
      ffmpegProcess.on('error', (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });
    });
  }

  parseFFmpegOutput(output) {
    const metadata = {
      format: {},
      streams: []
    };
    
    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseFloat(durationMatch[3]);
      metadata.format.duration = hours * 3600 + minutes * 60 + seconds;
    }
    
    const bitrateMatch = output.match(/bitrate: (\d+) kb\/s/);
    if (bitrateMatch) {
      metadata.format.bit_rate = parseInt(bitrateMatch[1]) * 1000;
    }
    
    const videoMatch = output.match(/Stream #\d+:\d+.*?: Video: (\w+).*?, (\d+)x(\d+)/);
    if (videoMatch) {
      metadata.streams.push({
        codec_name: videoMatch[1],
        width: parseInt(videoMatch[2]),
        height: parseInt(videoMatch[3]),
        codec_type: 'video'
      });
    }
    
    const audioMatch = output.match(/Stream #\d+:\d+.*?: Audio: (\w+)/);
    if (audioMatch) {
      metadata.streams.push({
        codec_name: audioMatch[1],
        codec_type: 'audio'
      });
    }
    
    return metadata;
  }

  async executeCompression(command) {
    return new Promise((resolve, reject) => {
      command
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          if (err.message.includes('ENOENT') || err.message.includes('spawn ffmpeg ENOENT') || err.message.includes('not recognized')) {
            reject(new Error(`FFmpeg is not installed or not found in PATH. Please install FFmpeg to process video files.\n\nDownload from: https://ffmpeg.org/download.html\nOr install via package manager:\n- Windows: choco install ffmpeg\n- macOS: brew install ffmpeg\n- Linux: sudo apt install ffmpeg`));
          } else {
            reject(new Error(`Video compression failed: ${err.message}`));
          }
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r  Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .run();
    });
  }

  async compressToTargetSize(inputFile, outputPath, metadata, options) {
    const targetSize = this.parseTargetSize(options.targetSize);
    const originalSize = (await fs.stat(inputFile)).size;
    
    if (!this.options.skip) {
      console.log(`🎯 Target size: ${(targetSize / (1024*1024)).toFixed(1)}MB`);
      const compressionRatio = (targetSize / originalSize * 100).toFixed(2);
      console.log(`📊 Required compression: ${compressionRatio}% of original size`);
    }
    
    const compressionRatio = targetSize / originalSize;
    if (compressionRatio < 0.15) {
      console.log(`🚀 EXTREME VIDEO COMPRESSION MODE TRIGGERED! (ratio: ${(compressionRatio * 100).toFixed(2)}%)`);
      return await this.extremeCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize);
    }
    
    if (!this.options.skip) {
      console.log(`📝 Using standard video compression (ratio: ${(compressionRatio * 100).toFixed(2)}% >= 15%)`);
    }
    
    return await this.standardCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize);
  }

  async extremeCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize) {
    if (!this.options.skip) {
      console.log(`🚀 EXTREME video compression mode activated! Testing multiple strategies...`);
    }
    
    const duration = metadata.format?.duration || 60;
    
    let strategies = [
      { format: 'mp4', codec: 'h264', crf: 35, scale: 1.0, preset: 'ultrafast' },
      { format: 'mp4', codec: 'h264', crf: 40, scale: 1.0, preset: 'fast' },
      { format: 'mp4', codec: 'h264', crf: 30, scale: 0.8, preset: 'fast' },
      { format: 'mp4', codec: 'h264', crf: 35, scale: 0.7, preset: 'medium' },
      { format: 'mp4', codec: 'h264', crf: 40, scale: 0.6, preset: 'medium' },
      { format: 'mp4', codec: 'h264', crf: 45, scale: 0.5, preset: 'fast' }
    ];
    
    if (!this.isLimitedFFmpeg()) {
      strategies = strategies.concat([
        { format: 'webm', codec: 'vp9', crf: 35, scale: 1.0, preset: 'fast' },
        { format: 'webm', codec: 'vp9', crf: 40, scale: 0.8, preset: 'fast' },
        { format: 'webm', codec: 'vp9', crf: 45, scale: 0.6, preset: 'fast' },
        { format: 'mp4', codec: 'h265', crf: 30, scale: 1.0, preset: 'fast' },
        { format: 'mp4', codec: 'h265', crf: 35, scale: 0.8, preset: 'fast' },
        { format: 'mp4', codec: 'h265', crf: 40, scale: 0.6, preset: 'fast' }
      ]);
    }
    
    const results = [];
    
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      try {
        const startTime = Date.now();
        const tempOutput = outputPath.replace(/\.[^.]+$/, `_strategy${i}.${strategy.format}`);
        
        const result = await this.testStrategy(inputFile, tempOutput, metadata, strategy, targetSize);
        result.index = i;
        result.strategy = strategy;
        result.processingTime = Date.now() - startTime;
        
        results.push(result);
        
        if (!result.success) {
          try {
            await fs.unlink(tempOutput);
          } catch {}
        }
        
      } catch (error) {
        results.push({
          index: i,
          strategy,
          error: error.message,
          success: false
        });
      }
    }
    
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
      console.log(`📊 Video compression results (${results.length} strategies tested):`);
      results.forEach((result, i) => {
        if (result.error) {
          console.log(`  ❌ Strategy ${i + 1}: ${result.error}`);
        } else {
          const size = (result.size / (1024*1024)).toFixed(1);
          const time = Math.round(result.processingTime / 1000);
          const status = result.success ? '✅' : '❌';
          const desc = this.getStrategyDescription(result.strategy);
          console.log(`  ${status} Strategy ${i + 1}: ${size}MB (${time}s) - ${desc}`);
        }
      });
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
      if (finalOutputPath !== inputFile) {
        try {
          await fs.unlink(finalOutputPath);
        } catch {}
      }
      
              await fs.rename(chosen.tempPath, finalOutputPath);
      
      for (const result of results) {
        if (result.tempPath && result.tempPath !== chosen.tempPath) {
          try {
            await fs.unlink(result.tempPath);
          } catch {}
        }
      }
      
      if (!this.options.skip) {
        const compressionAchieved = ((originalSize - chosen.size) / originalSize * 100).toFixed(2);
        console.log(`📏 ${(originalSize / (1024*1024)).toFixed(1)}MB → ${(chosen.size / (1024*1024)).toFixed(1)}MB (${compressionAchieved}% reduction)`);
        const strategyName = strategy === 'auto' ? 'auto-optimized' : strategy;
        console.log(`🔧 Strategy used: ${strategyName} - ${this.getStrategyDescription(chosen.strategy)}`);
        console.log(`💾 Saved as: ${path.basename(finalOutputPath)}`);
        console.log(`⚡ Processing time: ${Math.round(chosen.processingTime / 1000)}s`);
      }
      
      return finalOutputPath;
    }
    
    if (!this.options.skip) {
      console.log(`⚠️ No strategy achieved target. Using standard compression...`);
    }
    
    return await this.standardCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize);
  }

  async testStrategy(inputFile, outputPath, metadata, strategy, targetSize) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputFile);
      
      command = command.videoCodec(this.getVideoCodec(strategy.codec));
      command = command.audioCodec(this.getAudioCodec());
      
      if (this.isLimitedFFmpeg()) {
        const bitrateMap = {
          30: '3000k', 35: '2000k', 40: '1500k', 45: '1000k'
        };
        const bitrate = bitrateMap[strategy.crf] || '1500k';
        command = command.videoBitrate(bitrate);
      } else {
        if (strategy.codec === 'h264' || strategy.codec === 'h265') {
          command = command.addOption('-crf', strategy.crf.toString());
        } else if (strategy.codec === 'vp9') {
          command = command.addOption('-crf', strategy.crf.toString());
          command = command.addOption('-b:v', '0');
        }
      }
      
      if (strategy.scale < 1.0) {
        const currentWidth = metadata.streams?.[0]?.width || 1920;
        const currentHeight = metadata.streams?.[0]?.height || 1080;
        const newWidth = Math.round(currentWidth * strategy.scale);
        const newHeight = Math.round(currentHeight * strategy.scale);
        command = command.size(`${newWidth}x${newHeight}`);
      }
      
      command = command
        .addOption('-preset', strategy.preset)
        .addOption('-movflags', 'faststart')
        .audioBitrate('96k');
        
      if (strategy.format === 'webm') {
        command = command.addOption('-f', 'webm');
      } else {
        command = command.addOption('-f', 'mp4');
      }
      
      const startTime = Date.now();
      
      command
        .output(outputPath)
        .on('end', async () => {
          try {
            const stats = await fs.stat(outputPath);
            const processingTime = Date.now() - startTime;
            
            resolve({
              tempPath: outputPath,
              size: stats.size,
              processingTime,
              success: stats.size <= targetSize
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (err) => {
          reject(new Error(`Strategy failed: ${err.message}`));
        })
        .run();
    });
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
    
    const sizeRange = bestQuality ? (bestQuality.size - smallest.size) / (1024*1024) : 0;
    const timeRange = fastest ? (smallest.processingTime - fastest.processingTime) : 0;
    const targetSizeMB = targetSize / (1024*1024);
    
    if (fastest === smallest) {
      if (!this.options.skip) {
        console.log(`🤖 Auto-strategy: Perfect combo - fastest AND smallest!`);
        console.log(`   💎 Best of both worlds: ${(smallest.size / (1024*1024)).toFixed(1)}MB in ${Math.round(smallest.processingTime / 1000)}s`);
      }
      return smallest;
    }
    
    const qualityUtilization = bestQuality ? (bestQuality.size / targetSize) * 100 : 0;
    
    if (bestQuality && qualityUtilization <= 90) {
      if (!this.options.skip) {
        console.log(`🤖 Auto-strategy: Quality fits budget (${qualityUtilization.toFixed(1)}% of ${targetSizeMB.toFixed(1)}MB) - quality wins!`);
        console.log(`   🎨 Better video: ${(bestQuality.size / (1024*1024)).toFixed(1)}MB vs Smallest: ${(smallest.size / (1024*1024)).toFixed(1)}MB`);
      }
      return bestQuality;
    } else {
      if (!this.options.skip) {
        if (bestQuality) {
          console.log(`🤖 Auto-strategy: Quality too close to budget (${qualityUtilization.toFixed(1)}% > 90%)`);
        } else {
          console.log(`🤖 Auto-strategy: No quality option available - choosing smallest`);
        }
        console.log(`   💾 Safe choice: ${(smallest.size / (1024*1024)).toFixed(1)}MB of ${targetSizeMB.toFixed(1)}MB budget`);
      }
      return smallest;
    }
  }

  async standardCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize) {
    const targetBytes = targetSize;
    const duration = metadata.format?.duration || 60;
    
    const audioBitrate = 96;
    const overheadFactor = 0.85;
    const targetBitrate = Math.floor(((targetBytes * 8 * overheadFactor) / duration - audioBitrate * 1024) / 1024);
    
    const finalBitrate = Math.max(100, Math.min(targetBitrate, 10000));
    
    const command = ffmpeg(inputFile)
      .videoCodec(this.isLimitedFFmpeg() ? 'h264_nvenc' : 'libx264')
      .audioCodec(this.getAudioCodec())
      .videoBitrate(`${finalBitrate}k`)
      .audioBitrate('96k')
      .addOption('-preset', 'fast')
      .addOption('-movflags', 'faststart')
      .output(outputPath);
    
    if (outputPath !== inputFile) {
      try {
        await fs.unlink(outputPath);
      } catch {}
    }
    
          await this.executeCompression(command);
    
    return outputPath;
  }

  getStrategyDescription(strategy) {
    let desc = `${strategy.format.toUpperCase()} ${strategy.codec.toUpperCase()}`;
    if (strategy.crf) desc += ` CRF${strategy.crf}`;
    if (strategy.scale < 1.0) desc += ` ${(strategy.scale * 100)}%scale`;
    if (strategy.preset) desc += ` ${strategy.preset}`;
    return desc;
  }

  getExtensionForFormat(format) {
    switch (format) {
      case 'mp4': return '.mp4';
      case 'webm': return '.webm';
      case 'avi': return '.avi';
      case 'mov': return '.mov';
      case 'mkv': return '.mkv';
      default: return '.mp4';
    }
  }

  isLimitedFFmpeg() {
    const commonPaths = [
      'C:\\Program Files\\SteelSeries\\GG\\apps\\moments\\ffmpeg.exe'
    ];
    
    for (const path of commonPaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(path)) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  getAudioCodec() {
    return this.isLimitedFFmpeg() ? 'aac_mf' : 'aac';
  }

  generateOutputPath(inputFile, options) {
    if (options.output) {
      if (options.output.endsWith('/') || options.output.endsWith('\\')) {
        const basename = path.basename(inputFile, path.extname(inputFile));
        const ext = this.getOutputExtension(inputFile, options.format);
        const suffix = '_compressed';
        return path.join(options.output, `${basename}${suffix}${ext}`);
      } else {
        return options.output;
      }
    } else {
      const dir = path.dirname(inputFile);
      const basename = path.basename(inputFile, path.extname(inputFile));
      const ext = this.getOutputExtension(inputFile, options.format);
      const suffix = '_compressed';
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
      const fs = require('fs');
      const path = require('path');
      const ffmpeg = require('fluent-ffmpeg');

      try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        execSync('ffprobe -version', { stdio: 'ignore' });
        return;
      } catch {}

      const commonDirs = [
        'C:\\ffmpeg\\bin',
        'C:\\Program Files\\SteelSeries\\GG\\apps\\moments',
        'C:\\Program Files\\ffmpeg\\bin',
        'C:\\Program Files (x86)\\ffmpeg\\bin',
        path.join(process.env.USERPROFILE || '', 'Desktop', 'ffmpeg-7.1.1-essentials_build', 'bin'),
        '/usr/local/bin',
        '/usr/bin',
        '/opt/homebrew/bin'
      ];

      let found = false;
      for (const dir of commonDirs) {
        try {
          const ffmpegPath = path.join(dir, 'ffmpeg.exe');
          const ffprobePath = path.join(dir, 'ffprobe.exe');
          if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
            ffmpeg.setFfmpegPath(ffmpegPath);
            ffmpeg.setFfprobePath(ffprobePath);
            found = true;
            break;
          }
        } catch {}
      }

      if (!found && process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          const ffmpegList = execSync('where /R C:\\ ffmpeg*.exe', { encoding: 'utf8' })
            .split(/\r?\n/)
            .filter(Boolean);
          const ffprobeList = execSync('where /R C:\\ ffprobe*.exe', { encoding: 'utf8' })
            .split(/\r?\n/)
            .filter(Boolean);
          if (ffmpegList.length > 0 && ffprobeList.length > 0) {
            ffmpeg.setFfmpegPath(ffmpegList[0]);
            ffmpeg.setFfprobePath(ffprobeList[0]);
            found = true;
          }
        } catch (e) {
        }
      }

      if (!found) {
        console.warn('Warning: FFmpeg/ffprobe not found in PATH or common locations. Please install or add to PATH.');
      }
    } catch (error) {
      console.warn('Warning: FFmpeg path detection failed. Please ensure FFmpeg is installed and accessible.');
    }
  }
}

module.exports = { VideoCompressor };