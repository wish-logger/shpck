const path = require('path');
const fs = require('fs').promises;
const { FileUtils } = require('../utils/fileUtils');
const { spawnSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

class VideoCompressor {
  constructor(options = {}) {
    this.options = options;
    this.speedOptimized = options.speedOptimized || false;
    this.skipOptimizations = options.skipOptimizations || false;
    this.ffmpegPath = options.ffmpegPath || null;
    this.ffprobePath = options.ffprobePath || null;
    this.isFFmpegLimited = options.isLimited || false;
    this.hasFFprobe = options.hasFFprobe !== undefined ? options.hasFFprobe : false;
    
    if (!this.ffmpegPath) {
      this.setupFFmpegPaths();
    } else {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
      if (this.ffprobePath && this.hasFFprobe) {
        ffmpeg.setFfprobePath(this.ffprobePath);
      }
      if (!this.options.skip) {
        console.log(`🎥 FFmpeg configured via options: ${this.ffmpegPath}`);
        if (this.isFFmpegLimited) {
          console.log(`⚠️ Using limited FFmpeg version (${this.hasFFprobe ? 'with' : 'without'} ffprobe), using compatible codecs.`);
        }
      }
    }
  }

  setupFFmpegPaths() {
    try {
      const currentFFmpegPath = require('fluent-ffmpeg')().options.ffmpeg_path || null;
      if (currentFFmpegPath) {
        this.ffmpegPath = currentFFmpegPath;
        try {
          const currentFFprobePath = require('fluent-ffmpeg')().options.ffprobe_path || null;
          this.ffprobePath = currentFFprobePath;
          this.hasFFprobe = !!currentFFprobePath;
        } catch (e) {
          this.ffprobePath = null;
          this.hasFFprobe = false;
        }
        this.isFFmpegLimited = currentFFmpegPath.toLowerCase().includes('steelseries') || 
                              currentFFmpegPath.toLowerCase().includes('gg-');
        if (!this.options.skip) {
          console.log(`🎥 FFmpeg already configured: ${currentFFmpegPath}`);
          if (this.isFFmpegLimited) {
            console.log(`⚠️ Detected limited FFmpeg version (${this.hasFFprobe ? 'with' : 'without'} ffprobe), using compatible codecs.`);
          }
        }
        return;
      }
    } catch (e) {
    }

    try {
      const { ffmpegPath, ffprobePath, isLimited, hasFFprobe, detectionSource } = VideoCompressor.detectFFmpegPaths();
      if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath);
        if (ffprobePath && hasFFprobe) {
          ffmpeg.setFfprobePath(ffprobePath);
        }
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
        this.isFFmpegLimited = isLimited;
        this.hasFFprobe = hasFFprobe;
        if (!this.options.skip) {
          console.log(`🎥 FFmpeg detected via ${detectionSource}: ${ffmpegPath}`);
          if (isLimited) {
            console.log(`⚠️ Detected limited FFmpeg version (${hasFFprobe ? 'with' : 'without'} ffprobe), using compatible codecs.`);
          }
        }
      } else {
        const errorMessage = `FFmpeg/ffprobe not found in PATH or common locations. Please install FFmpeg to process video files.\nDownload from: https://ffmpeg.org/download.html\nOr install via package manager:\n- Windows: choco install ffmpeg / scoop install ffmpeg\n- macOS: brew install ffmpeg\n- Linux: sudo apt install ffmpeg (Debian/Ubuntu) / sudo dnf install ffmpeg (Fedora)`;
        if (!this.options.skip) {
          console.error(`🚨 Fatal Error: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      throw error;
    }
  }

  async compress(inputFile, options = {}) {
    this.setupFFmpegPaths();
    const originalStats = await fs.stat(inputFile);
    const originalSize = originalStats.size;
    const outputPath = this.generateOutputPath(inputFile, options);
    const metadata = await this.getVideoMetadata(inputFile);
    let finalOutputPath = outputPath;
    if (options.targetSize) {
      const targetBytes = typeof options.targetSize === 'string' ? 
        this.parseTargetSize(options.targetSize) : 
        options.targetSize;
      
      if ((targetBytes / originalSize) < 0.15) {
        finalOutputPath = await this.extremeCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetBytes);
      } else {
        finalOutputPath = await this.standardCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetBytes);
      }
    } else {
      const ffmpegCommand = this.createFFmpegCommand(inputFile, outputPath, metadata, options);
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
    let command = require('fluent-ffmpeg')(inputFile);
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
    if (!this.isFFmpegLimited) {
      const preset = this.speedOptimized ? 'ultrafast' : 'fast';
      command = command.addOption('-preset', preset);
    }
    
    command = command
      .addOption('-movflags', this.skipOptimizations ? '' : 'faststart')
      .addOption('-pix_fmt', 'yuv420p')
      .addOption('-threads', '0');
    if (this.speedOptimized) {
      command = command
        .addOption('-tune', 'zerolatency');
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
    if (this.isFFmpegLimited) {
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
      command = command.addOption('-crf', setting.crf.toString());
      if (codec === 'h265') {
        command = command.addOption('-x265-params', 'log-level=error');
      }
    } else if (codec === 'av1') {
      command = command.addOption('-cpu-used', '8');
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
    if (this.isFFmpegLimited) {
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

  getAudioCodec() {
    return this.isFFmpegLimited ? 'aac_mf' : 'aac';
  }

  async getVideoMetadata(inputFile) {
    this.setupFFmpegPaths();
    
    if (!this.hasFFprobe) {
      return {
        format: {
          duration: 60,
          bit_rate: '2000000',
          size: 1000000
        },
        streams: [{
          codec_name: 'h264',
          width: 1920,
          height: 1080
        }]
      };
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputFile, (err, metadata) => {
        if (err) {
          reject(new Error(`FFmpeg error: ${err.message}`));
        } else {
          resolve(metadata);
        }
      });
    });
  }

  async extremeCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize) {
    if (!this.options.skip) {
      console.log('🚀 EXTREME VIDEO COMPRESSION MODE: parallel strategies...');
    }
    const duration = metadata.format?.duration || 60;
    const resolutions = [1.0, 0.7, 0.5, 0.3];
    const crfs = [18, 23, 28, 32, 36, 40, 45, 50];
    const presets = ['ultrafast', 'fast', 'medium'];
    const codecs = ['h264', 'h265', 'vp9', 'av1'];
    let strategies = [];
    for (const codec of codecs) {
      for (const preset of presets) {
        for (const crf of crfs) {
          for (const scale of resolutions) {
            strategies.push({ codec, preset, crf, scale });
          }
        }
      }
    }
    const results = await Promise.all(strategies.map(async (s, i) => {
      const tempOut = outputPath.replace(/\.[^.]+$/, `_extreme${i}.${s.codec === 'vp9' ? 'webm' : s.codec === 'av1' ? 'mkv' : 'mp4'}`);
      let command = require('fluent-ffmpeg')(inputFile)
        .videoCodec(this.getVideoCodec(s.codec))
        .audioCodec(this.getAudioCodec())
        .addOption('-threads', '0')
        .addOption('-movflags', 'faststart')
        .addOption('-pix_fmt', 'yuv420p');
      
      if (this.isFFmpegLimited) {
        const bitrates = { ultrafast: '800k', fast: '1200k', medium: '1800k' };
        command = command.videoBitrate(bitrates[s.preset] || '1200k');
      } else {
        command = command
          .addOption('-crf', s.crf.toString())
          .addOption('-preset', s.preset);
      }
      if (s.codec === 'av1') command = command.addOption('-cpu-used', '8');
      if (s.scale < 1.0) {
        const w = Math.round((metadata.streams?.[0]?.width || 1920) * s.scale);
        const h = Math.round((metadata.streams?.[0]?.height || 1080) * s.scale);
        command = command.size(`${w}x${h}`);
      }
      command = command.output(tempOut);
      try {
        await this.executeCompression(command);
        const stats = await fs.stat(tempOut);
        return { ...s, tempPath: tempOut, size: stats.size };
      } catch (e) {
        return { ...s, tempPath: tempOut, error: e.message, size: Infinity };
      }
    }));
    const successful = results.filter(r => r.size <= targetSize && !r.error).sort((a, b) => a.size - b.size);
    const best = successful[0] || results.sort((a, b) => a.size - b.size)[0];
    const finalExt = this.getExtensionForFormat(best.codec === 'vp9' ? 'webm' : best.codec === 'av1' ? 'mkv' : 'mp4');
    const finalOutputPath = outputPath.replace(/\.[^.]+$/, finalExt);
    if (best && best.tempPath) {
      await fs.rename(best.tempPath, finalOutputPath);
    }
    for (const r of results) {
      if (r.tempPath && r.tempPath !== best.tempPath) {
        try { await fs.unlink(r.tempPath); } catch {}
      }
    }
    if (!this.options.skip) {
      if (successful.length > 0) {
        console.log(`🎯 Extreme: Best result ${((best.size || 0) / (1024*1024)).toFixed(2)}MB (${best.codec}, crf=${best.crf}, preset=${best.preset}, scale=${best.scale})`);
      } else {
        console.log('⚠️  No strategy reached target, using smallest found.');
      }
    }
    return finalOutputPath;
  }

  async standardCompressionStrategy(inputFile, outputPath, metadata, options, originalSize, targetSize) {
    const duration = metadata.format?.duration || 60;
    const audioBitrate = 96;
    const overheadFactor = 0.85;
    const targetBitrate = Math.floor(((targetSize * 8 * overheadFactor) / duration - audioBitrate * 1024) / 1024);
    const finalBitrate = Math.max(100, Math.min(targetBitrate, 10000));
    let command = require('fluent-ffmpeg')(inputFile)
      .videoCodec(this.isFFmpegLimited ? 'h264_nvenc' : 'libx264')
      .audioCodec(this.getAudioCodec())
      .videoBitrate(`${finalBitrate}k`)
      .audioBitrate('96k')
      .addOption('-movflags', 'faststart')
      .addOption('-threads', '0');
    
    if (!this.isFFmpegLimited) {
      command = command.addOption('-preset', this.speedOptimized ? 'ultrafast' : 'medium');
    }
    
    command = command.output(outputPath);
    if (outputPath !== inputFile) {
      try { await fs.unlink(outputPath); } catch {}
    }
    await this.executeCompression(command);
    return outputPath;
  }

  async executeCompression(command) {
    return new Promise((resolve, reject) => {
      let lastPercent = 0;
      command
        .on('progress', (progress) => {
          if (progress.percent && progress.percent - lastPercent >= 5) {
            lastPercent = progress.percent;
            process.stdout.write(`\r  Progress: ${Math.round(progress.percent)}% ${progress.timemark || ''}`);
          }
        })
        .on('end', () => {
          process.stdout.write('\r  Progress: 100%\n');
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error('FFmpeg error:', err.message);
          if (stdout) console.error('FFmpeg stdout:', stdout);
          if (stderr) console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .run();
    });
  }

  getOutputFormat(outputPath) {
    const ext = path.extname(outputPath).toLowerCase();
    switch (ext) {
      case '.mp4': return 'mp4';
      case '.webm': return 'webm';
      case '.avi': return 'avi';
      case '.mov': return 'mov';
      case '.mkv': return 'mkv';
      default: return 'mp4';
    }
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

  static detectFFmpegPaths() {
    if (VideoCompressor._cachedPaths) {
      return VideoCompressor._cachedPaths;
    }

    let ffmpegPath = null;
    let ffprobePath = null;
    let isLimited = false;
    let detectionSource = '';

    const validateFFmpegPath = (ffmpegPath, ffprobePath) => {
      try {
        const ffmpegTest = spawnSync(ffmpegPath, ['-version'], { 
          stdio: 'pipe', 
          timeout: 5000,
          encoding: 'utf8'
        });

        if (ffmpegTest.status === 0) {
          const ffmpegVersion = ffmpegTest.stdout?.match(/ffmpeg version (\S+)/)?.[1] || '';
          const isLimited = ffmpegPath.toLowerCase().includes('steelseries') || 
                           ffmpegVersion.includes('minimal') || 
                           ffmpegVersion.includes('essentials') ||
                           ffmpegVersion.includes('gg-');

          let hasFFprobe = false;
          let actualFFprobePath = ffprobePath;
          try {
            const fsSync = require('fs');
            if (fsSync.existsSync(ffprobePath)) {
              const ffprobeTest = spawnSync(ffprobePath, ['-version'], { 
                stdio: 'pipe', 
                timeout: 5000,
                encoding: 'utf8'
              });
              hasFFprobe = ffprobeTest.status === 0;
            }
          } catch (e) {
          }

          if (isLimited && !hasFFprobe) {
            return { 
              valid: true, 
              version: ffmpegVersion, 
              isLimited: true, 
              hasFFprobe: false,
              ffprobePath: null 
            };
          }

          if (hasFFprobe) {
            return { 
              valid: true, 
              version: ffmpegVersion, 
              isLimited, 
              hasFFprobe: true,
              ffprobePath: actualFFprobePath 
            };
          }
        }
      } catch (e) {
      }
      return { valid: false };
    };

    const checkSystemPath = () => {
      const exeSuffix = process.platform === 'win32' ? '.exe' : '';
      const result = validateFFmpegPath(`ffmpeg${exeSuffix}`, `ffprobe${exeSuffix}`);
      if (result.valid) {
        return {
          ffmpegPath: `ffmpeg${exeSuffix}`,
          ffprobePath: result.ffprobePath || `ffprobe${exeSuffix}`,
          isLimited: result.isLimited,
          hasFFprobe: result.hasFFprobe,
          source: 'PATH'
        };
      }
      return null;
    };

    const checkCommonDirectories = () => {
      const fsSync = require('fs');
      const exeSuffix = process.platform === 'win32' ? '.exe' : '';
      
      let commonDirs = [];
      
      if (process.platform === 'win32') {
        commonDirs = [
          path.join(process.env.USERPROFILE || '', 'scoop', 'apps', 'ffmpeg', 'current', 'bin'),
          path.join(process.env.USERPROFILE || '', 'Desktop', 'ffmpeg*', 'bin'),
          path.join(process.env.USERPROFILE || '', 'Downloads', 'ffmpeg*', 'bin'),
          'C:\\ffmpeg\\bin',
          'C:\\Program Files\\ffmpeg\\bin',
          'C:\\Program Files (x86)\\ffmpeg\\bin',
          'C:\\ProgramData\\chocolatey\\lib\\ffmpeg\\tools\\ffmpeg\\bin',
          path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', '*ffmpeg*', 'bin'),
          'C:\\Program Files\\SteelSeries\\GG\\apps\\moments',
          'C:\\Program Files (x86)\\SteelSeries\\GG\\apps\\moments'
        ];
      } else if (process.platform === 'darwin') {
        commonDirs = [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          '/usr/bin',
          '/opt/local/bin',
          '/Applications/ffmpeg/bin'
        ];
      } else {
        commonDirs = [
          '/usr/local/bin',
          '/usr/bin',
          '/snap/bin',
          '/opt/ffmpeg/bin',
          path.join(process.env.HOME || '', '.local', 'bin')
        ];
      }

      const expandedDirs = [];
      for (const dir of commonDirs) {
        if (dir.includes('*')) {
          try {
            const parentDir = path.dirname(dir);
            const pattern = path.basename(dir);
            const entries = fsSync.readdirSync(parentDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && entry.name.match(pattern.replace('*', '.*'))) {
                expandedDirs.push(path.join(parentDir, entry.name));
              }
            }
          } catch (e) {
          }
        } else {
          expandedDirs.push(dir);
        }
      }

      for (const dir of expandedDirs) {
        const ffmpegPath = path.join(dir, `ffmpeg${exeSuffix}`);
        const ffprobePath = path.join(dir, `ffprobe${exeSuffix}`);
        
        try {
          if (fsSync.existsSync(ffmpegPath) && fsSync.existsSync(ffprobePath)) {
            const result = validateFFmpegPath(ffmpegPath, ffprobePath);
            if (result.valid) {
              return {
                ffmpegPath,
                ffprobePath: result.ffprobePath || ffprobePath,
                isLimited: result.isLimited,
                hasFFprobe: result.hasFFprobe,
                source: `common_dir:${dir}`
              };
            }
          }
        } catch (e) {
        }
      }
      return null;
    };

    const checkWindowsRegistry = () => {
      if (process.platform !== 'win32') return null;
      
      try {
        const regPaths = [
          'HKEY_LOCAL_MACHINE\\SOFTWARE\\FFmpeg',
          'HKEY_CURRENT_USER\\SOFTWARE\\FFmpeg',
          'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\FFmpeg'
        ];

        for (const regPath of regPaths) {
          try {
            const result = spawnSync('reg', ['query', regPath, '/v', 'InstallDir'], { 
              encoding: 'utf8', 
              stdio: 'pipe' 
            });
            if (result.status === 0) {
              const match = result.stdout.match(/InstallDir\s+REG_SZ\s+(.+)/);
              if (match) {
                const installDir = match[1].trim();
                const binDir = path.join(installDir, 'bin');
                const ffmpegPath = path.join(binDir, 'ffmpeg.exe');
                const ffprobePath = path.join(binDir, 'ffprobe.exe');
                
                const validation = validateFFmpegPath(ffmpegPath, ffprobePath);
                if (validation.valid) {
                  return {
                    ffmpegPath,
                    ffprobePath: validation.ffprobePath || ffprobePath,
                    isLimited: validation.isLimited,
                    hasFFprobe: validation.hasFFprobe,
                    source: 'registry'
                  };
                }
              }
            }
          } catch (e) {
          }
        }
      } catch (e) {
      }
      return null;
    };

    const intelligentSearch = () => {
      if (process.platform !== 'win32') return null;
      
      try {
        const searchRoots = [
          'C:\\Program Files',
          'C:\\Program Files (x86)',
          process.env.USERPROFILE
        ];

        for (const root of searchRoots) {
          try {
            const result = spawnSync('where', ['/R', root, 'ffmpeg.exe'], { 
              encoding: 'utf8', 
              timeout: 10000,
              stdio: 'pipe'
            });
            
            if (result.status === 0 && result.stdout) {
              const ffmpegPaths = result.stdout.split(/\r?\n/).filter(Boolean);
              for (const ffmpegPath of ffmpegPaths) {
                const ffprobePath = path.join(path.dirname(ffmpegPath), 'ffprobe.exe');
                const validation = validateFFmpegPath(ffmpegPath, ffprobePath);
                if (validation.valid) {
                  return {
                    ffmpegPath,
                    ffprobePath: validation.ffprobePath,
                    isLimited: validation.isLimited,
                    hasFFprobe: validation.hasFFprobe,
                    source: 'system_search'
                  };
                }
              }
            }
          } catch (e) {
          }
        }
      } catch (e) {
      }
      return null;
    };

    const strategies = [
      { name: 'PATH', func: checkSystemPath },
      { name: 'CommonDirs', func: checkCommonDirectories },
      { name: 'Registry', func: checkWindowsRegistry },
      { name: 'SystemSearch', func: intelligentSearch }
    ];

    for (const strategy of strategies) {
      const result = strategy.func();
      if (result) {
        ffmpegPath = result.ffmpegPath;
        ffprobePath = result.ffprobePath;
        isLimited = result.isLimited;
        detectionSource = result.source;
        break;
      }
    }

    const hasFFprobe = ffprobePath !== null;
    const finalResult = { ffmpegPath, ffprobePath, isLimited, hasFFprobe, detectionSource };
    VideoCompressor._cachedPaths = finalResult;
    setTimeout(() => {
      delete VideoCompressor._cachedPaths;
    }, 5 * 60 * 1000);

    return finalResult;
  }

  static clearDetectionCache() {
    delete VideoCompressor._cachedPaths;
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

module.exports = { VideoCompressor };