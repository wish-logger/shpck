const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');
const chalk = require('chalk');

class ThreadManager {
  constructor(options = {}) {
    this.options = options;
    this.workers = [];
    this.isQuiet = options.skip || false;
    
    this.calculateOptimalThreads();
  }
  
  calculateOptimalThreads() {
    const totalCores = os.cpus().length;
    if (this.options.threads && this.options.ultrafast) {
      this.threadCount = Math.max(2, Math.min(parseInt(this.options.threads) * 4, 32));
    } else if (this.options.threads) {
      this.threadCount = Math.max(2, Math.min(parseInt(this.options.threads) * 2, 32));
    } else if (this.options.ultrafast) {
      this.threadCount = Math.max(2, Math.min(totalCores * 4, 32));
    } else {
      this.threadCount = Math.max(2, Math.min(totalCores * 2, 32));
    }
    if (!this.isQuiet) {
      console.log(chalk.gray(`🧵 Thread Manager: ${totalCores} CPU cores detected`));
      if (this.options.threads && this.options.ultrafast) {
        console.log(chalk.gray(`⚡ Using ${this.threadCount} worker threads (4x per thread, threads + ultrafast mode)`));
      } else if (this.options.threads) {
        console.log(chalk.gray(`⚡ Using ${this.threadCount} worker threads (2x per thread, threads)`));
      } else if (this.options.ultrafast) {
        console.log(chalk.gray(`⚡ Using ${this.threadCount} worker threads (4x per core, ultrafast mode)`));
      } else {
        console.log(chalk.gray(`⚡ Using ${this.threadCount} worker threads (2x per core)`));
      }
      if (this.threadCount > totalCores * 1.5) {
        console.log(chalk.yellow(`⚠️  Warning: Over-subscription detected (${this.threadCount} workers > ${totalCores} cores)`));
      }
    }
  }
  
  chunkFiles(files) {
    const chunks = [];
    const filesPerWorker = Math.ceil(files.length / this.threadCount);
    
    for (let i = 0; i < this.threadCount && i * filesPerWorker < files.length; i++) {
      const start = i * filesPerWorker;
      const end = Math.min(start + filesPerWorker, files.length);
      const chunk = files.slice(start, end);
      
      if (chunk.length > 0) {
        chunks.push({
          files: chunk,
          workerIndex: i
        });
      }
    }
    
    if (!this.isQuiet) {
      console.log(chalk.gray(`📦 Split ${files.length} files into ${chunks.length} chunks`));
    }
    
    return chunks;
  }
  
  async processFiles(files, options = {}) {
    if (files.length === 0) {
      return { processed: 0, errors: [], totalSizeReduction: 0 };
    }

    let filesToProcess = files;
    if (options.forceThreads) {
      const { splitLargeImagesIntoFragments } = require('./threadManager_imageFragmentation');
      filesToProcess = await splitLargeImagesIntoFragments(files, this.threadCount, options);
    }

    if (filesToProcess.length < 4 && !options.forceThreads) {
      if (!this.isQuiet) {
        console.log(chalk.gray(`🔄 Using single thread for ${filesToProcess.length} files (overhead optimization)`));
      }
      return this.processSingleThreaded(filesToProcess, options);
    }

    const chunks = this.chunkFiles(filesToProcess);
    const results = {
      processed: 0,
      errors: [],
      totalSizeReduction: 0,
      processingTimes: []
    };

    if (!this.isQuiet) {
      console.log(chalk.cyan(`🚀 Starting multi-threaded compression with ${chunks.length} workers...`));
    }

    try {
      await this.executeWorkers(chunks, options, results);
    } catch (error) {
      if (!this.isQuiet) {
        console.error(chalk.red(`💥 Thread manager error: ${error.message}`));
      }
      throw error;
    } finally {
      await this.cleanup();
    }

    if (!this.isQuiet) {
      this.printPerformanceStats(results);
    }

    return results;
  }
  
  async executeWorkers(chunks, options, results) {
    const workerPromises = chunks.map((chunk, index) => {
      return this.createWorker(chunk, options, results);
    });
    
    await Promise.all(workerPromises);
  }
  
  createWorker(chunk, options, results) {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, '../workers/compressionWorker.js');
      let ffmpegPath = null, ffprobePath = null, isLimited = false, hasFFprobe = false;
      const hasVideo = chunk.files.some(f => typeof f === 'string' && /\.(mp4|avi|mov|mkv|webm|flv|wmv)$/i.test(f));
      if (hasVideo) {
        const { VideoCompressor } = require('../compressors/videoCompressor');
        const ffmpegPaths = VideoCompressor.detectFFmpegPaths();
        ffmpegPath = ffmpegPaths.ffmpegPath;
        ffprobePath = ffmpegPaths.ffprobePath;
        isLimited = ffmpegPaths.isLimited;
        hasFFprobe = ffmpegPaths.hasFFprobe;
      }
      const worker = new Worker(workerPath, {
        workerData: {
          files: chunk.files,
          options: { ...this.options, ...options },
          workerIndex: chunk.workerIndex,
          ffmpegPath,
          ffprobePath,
          isLimited,
          hasFFprobe
        }
      });
      
      this.workers.push(worker);
      
      worker.on('message', (message) => {
        switch (message.type) {
          case 'progress':
            if (!this.isQuiet) {
              const reduction = ((message.result.originalSize - message.result.compressedSize) / message.result.originalSize * 100).toFixed(1);
              console.log(
                chalk.green(`✓[W${message.workerIndex}]`) +
                ` ${message.file} ` +
                chalk.gray(`-${reduction}%`)
              );
            }
            break;
            
          case 'error':
            results.errors.push({
              file: message.file,
              error: message.error,
              worker: message.workerIndex
            });
            if (!this.isQuiet) {
              console.log(chalk.red(`✗[W${message.workerIndex}]`) + ` ${message.file} - ${message.error}`);
            }
            break;
            
          case 'complete':
            message.results.forEach(result => {
              if (result.success) {
                results.processed++;
                results.totalSizeReduction += (result.originalSize - result.compressedSize);
                results.processingTimes.push(result.processingTime);
              }
            });
            resolve();
            break;
            
          case 'worker_error':
            reject(new Error(`Worker ${message.workerIndex} failed: ${message.error}`));
            break;
        }
      });
      
      worker.on('error', (error) => {
        reject(new Error(`Worker ${chunk.workerIndex} error: ${error.message}`));
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker ${chunk.workerIndex} exited with code ${code}`));
        }
      });
    });
  }
  
  async processSingleThreaded(files, options) {
    const { ImageCompressor } = require('../compressors/imageCompressor');
    const { VideoCompressor } = require('../compressors/videoCompressor');
    const mime = require('mime-types');
    
    const imageCompressor = new ImageCompressor({
      ...this.options,
      ...options,
      speedOptimized: options.ultrafast || false,
      skipOptimizations: options.noOptimize || false
    });
    
    const videoCompressor = new VideoCompressor({
      ...this.options,
      ...options,
      speedOptimized: options.ultrafast || false,
      skipOptimizations: options.noOptimize || false
    });
    
    const results = {
      processed: 0,
      errors: [],
      totalSizeReduction: 0,
      processingTimes: []
    };
    
    for (const file of files) {
      try {
        const startTime = Date.now();
        const mimeType = mime.lookup(file);
        
        let result;
        if (mimeType && mimeType.startsWith('image/')) {
          result = await imageCompressor.compress(file, options);
        } else if (mimeType && mimeType.startsWith('video/')) {
          result = await videoCompressor.compress(file, options);
        } else {
          throw new Error(`Unsupported file type: ${mimeType || 'unknown'}`);
        }
        
        const processingTime = Date.now() - startTime;
        
        results.processed++;
        results.totalSizeReduction += (result.originalSize - result.compressedSize);
        results.processingTimes.push(processingTime);
        
        if (!this.isQuiet) {
          const reduction = ((result.originalSize - result.compressedSize) / result.originalSize * 100).toFixed(1);
          console.log(
            chalk.green(`✓`) +
            ` ${path.basename(file)} ` +
            chalk.gray(`-${reduction}%`)
          );
        }
        
      } catch (error) {
        results.errors.push({
          file,
          error: error.message
        });
        
        if (!this.isQuiet) {
          console.log(chalk.red(`✗`) + ` ${path.basename(file)} - ${error.message}`);
        }
      }
    }
    
    return results;
  }
  
  printPerformanceStats(results) {
    if (results.processingTimes.length > 0) {
      const avgTime = results.processingTimes.reduce((a, b) => a + b, 0) / results.processingTimes.length;
      const maxTime = Math.max(...results.processingTimes);
      const minTime = Math.min(...results.processingTimes);
      
      console.log(chalk.cyan('\n📊 Thread Performance Stats:'));
      console.log(`${chalk.gray('⏱️  Average processing time:')} ${avgTime.toFixed(0)}ms`);
      console.log(`${chalk.gray('⚡ Fastest file:')} ${minTime.toFixed(0)}ms`);
      console.log(`${chalk.gray('🐌 Slowest file:')} ${maxTime.toFixed(0)}ms`);
      console.log(`${chalk.gray('🧵 Thread efficiency:')} ${(minTime/maxTime*100).toFixed(1)}%`);
    }
  }
  
  async cleanup() {
    const terminationPromises = this.workers.map(worker => {
      return worker.terminate();
    });
    
    await Promise.all(terminationPromises);
    this.workers = [];
  }
}

module.exports = { ThreadManager };