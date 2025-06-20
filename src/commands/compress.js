const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const ora = require('ora');
const { glob } = require('glob');
const { filesize } = require('filesize');
const mime = require('mime-types');
const os = require('os');

const { ImageCompressor } = require('../compressors/imageCompressor');
const { VideoCompressor } = require('../compressors/videoCompressor');
const { FileUtils } = require('../utils/fileUtils');
const { ProgressManager } = require('../utils/progressManager');
const { ThreadManager } = require('../utils/threadManager');
const { SystemWarnings } = require('../utils/systemWarnings');

async function compressCommand(files, options) {
  const isQuiet = options.skip;
  const spinner = !isQuiet ? ora('Initializing compression...').start() : null;
  
  try {
    const resolvedFiles = await resolveFiles(files, options.recursive);
    
    if (resolvedFiles.length === 0) {
      if (isQuiet) {
        console.log('ERROR: No files found');
        return;
      }
      spinner.fail(chalk.red('No files found matching the pattern'));
      return;
    }

    if (!isQuiet) {
      spinner.succeed(chalk.green(`Found ${resolvedFiles.length} files to compress`));
    }

    if (!options.parallel) {
      const cpuCores = os.cpus().length;
      options.parallel = Math.max(cpuCores * 2, 8);
      if (!isQuiet) {
        console.log(chalk.gray(`⚡ Auto-detected ${options.parallel} parallel processes`));
      }
    }

    const fileGroups = await groupFilesByType(resolvedFiles);
    
    const progressManager = new ProgressManager(resolvedFiles.length);
    
    const imageCompressor = new ImageCompressor({
      ...options,
      speedOptimized: options.ultrafast || false,
      skipOptimizations: options.noOptimize || false
    });
    const videoCompressor = new VideoCompressor({
      ...options,
      speedOptimized: options.ultrafast || false,
      skipOptimizations: options.noOptimize || false
    });
    
    const results = {
      processed: 0,
      totalSizeReduction: 0,
      errors: []
    };

    const hasLargeFiles = await checkForLargeFiles(resolvedFiles);
    
    const useMultiThread = options.multiThread || 
                           options.forceThreads || 
                           (resolvedFiles.length >= 4 && !options.parallel) ||
                           hasLargeFiles;
    
    if (useMultiThread) {
      await SystemWarnings.checkSystemOptimization(options);
      
      if (!isQuiet && hasLargeFiles) {
        const largeFiles = checkForLargeFiles.largeFiles || [];
        console.log(chalk.yellow('📦 Large files detected (>3GB) - auto-enabling multi-threading'));
        largeFiles.forEach(({file, size}) => {
          console.log(chalk.gray(`   • ${file}: ${filesize(size)}`));
        });
      }
    }
    
    if (!isQuiet) {
      if (useMultiThread) {
        console.log(chalk.cyan('\n🧵 Starting multi-threaded compression...\n'));
      } else {
        console.log(chalk.cyan('\n🚀 Starting compression...\n'));
      }
    }

    if (fileGroups.videos.length > 0 && options.overwrite && !isQuiet) {
      console.log(chalk.yellow('⚠️  Warning: The --overwrite flag is not supported for video files.'));
    }

    if (options.keepDimensions || options.k) {
      delete options.width;
      delete options.height;
      if (!isQuiet) {
        console.log(chalk.cyan('🖼️  Keeping original dimensions (width, height)'));
      }
    }

    if (useMultiThread) {
      const threadManager = new ThreadManager(options);
      
      if (fileGroups.images.length > 0) {
        if (!isQuiet) {
          console.log(chalk.yellow(`📸 Processing ${fileGroups.images.length} images with worker threads...`));
        }
        const imageResults = await threadManager.processFiles(fileGroups.images, options);
        results.processed += imageResults.processed;
        results.totalSizeReduction += imageResults.totalSizeReduction;
        results.errors.push(...imageResults.errors);
      }

      if (fileGroups.videos.length > 0) {
        if (!isQuiet) {
          console.log(chalk.yellow(`🎥 Processing ${fileGroups.videos.length} videos with worker threads...`));
        }
        const videoResults = await threadManager.processFiles(fileGroups.videos, options);
        results.processed += videoResults.processed;
        results.totalSizeReduction += videoResults.totalSizeReduction;
        results.errors.push(...videoResults.errors);
      }
    } else {
      if (fileGroups.images.length > 0) {
        if (!isQuiet) {
          console.log(chalk.yellow(`📸 Processing ${fileGroups.images.length} images...`));
        }
        await processFiles(fileGroups.images, imageCompressor, options, progressManager, results);
      }

      if (fileGroups.videos.length > 0) {
        if (!isQuiet) {
          console.log(chalk.yellow(`🎥 Processing ${fileGroups.videos.length} videos...`));
        }
        await processFiles(fileGroups.videos, videoCompressor, options, progressManager, results);
      }
    }

    if (fileGroups.other.length > 0 && !isQuiet) {
      console.log(chalk.yellow(`📄 ${fileGroups.other.length} other files detected (not yet supported)`));
    }

    showSummary(results, isQuiet);

  } catch (error) {
    if (isQuiet) {
      console.log(`ERROR: ${error.message}`);
    } else {
      spinner.fail(chalk.red(`Compression failed: ${error.message}`));
      console.error(error);
    }
    process.exit(1);
  }
}

async function resolveFiles(patterns, recursive) {
  const allFiles = [];
  
  for (const pattern of patterns) {
    try {
      const stat = await fs.stat(pattern);
      
      if (stat.isDirectory()) {
        const globPattern = recursive 
          ? path.join(pattern, '**/*')
          : path.join(pattern, '*');
        
        const dirFiles = await glob(globPattern, { nodir: true });
        allFiles.push(...dirFiles);
      } else {
        allFiles.push(pattern);
      }
    } catch (error) {
      const globFiles = await glob(pattern, { nodir: true });
      allFiles.push(...globFiles);
    }
  }
  
  return [...new Set(allFiles)].sort();
}

async function checkForLargeFiles(files) {
  const LARGE_FILE_THRESHOLD = 3 * 1024 * 1024 * 1024;
  const largeFiles = [];
    
  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      if (stats.size > LARGE_FILE_THRESHOLD) {
        largeFiles.push({
          file: path.basename(file),
          size: stats.size
        });
      }
    } catch (error) {
      continue;
    }
  }
  
  checkForLargeFiles.largeFiles = largeFiles;
  
  return largeFiles.length > 0;
}

async function groupFilesByType(files) {
  const groups = {
    images: [],
    videos: [],
    other: []
  };

  for (const file of files) {
    const mimeType = mime.lookup(file);
    
    if (mimeType) {
      if (mimeType.startsWith('image/')) {
        groups.images.push(file);
      } else if (mimeType.startsWith('video/')) {
        groups.videos.push(file);
      } else {
        groups.other.push(file);
      }
    } else {
      groups.other.push(file);
    }
  }

  return groups;
}

async function processFiles(files, compressor, options, progressManager, results) {
  const parallel = parseInt(options.parallel) || 8;
  const isQuiet = options.skip;

  let currentlyProcessing = 0;
  const maxConcurrent = parallel;
  
  const processFile = async (file) => {
    while (currentlyProcessing >= maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    currentlyProcessing++;
    
    try {
      const result = await compressor.compress(file, options);
      
      progressManager.update(file, result);
      results.processed++;
      results.totalSizeReduction += (result.originalSize - result.compressedSize);
      
      if (!isQuiet) {
        const reduction = ((result.originalSize - result.compressedSize) / result.originalSize * 100).toFixed(1);
        console.log(
          chalk.green('✓') +
          ` ${path.basename(file)} ` +
          chalk.gray(`(${filesize(result.originalSize)} → ${filesize(result.compressedSize)}) `) +
          chalk.cyan(`-${reduction}%`)
        );
      }
      
    } catch (error) {
      results.errors.push({ file, error: error.message });
      if (!isQuiet) {
        console.log(chalk.red('✗') + ` ${path.basename(file)} - ${error.message}`);
      }
    } finally {
      currentlyProcessing--;
    }
  };

  const promises = files.map(processFile);
  await Promise.all(promises);
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function showSummary(results, isQuiet = false) {
  if (isQuiet) {
    const errorText = results.errors.length > 0 ? `, Errors: ${results.errors.length}` : '';
    console.log(`Processed: ${results.processed}, Saved: ${filesize(results.totalSizeReduction)}${errorText}`);
    return;
  }

  console.log(chalk.cyan('\n📊 Compression Summary\n'));
  console.log(`${chalk.green('✓')} Files processed: ${chalk.bold(results.processed)}`);
  console.log(`${chalk.red('✗')} Errors: ${chalk.bold(results.errors.length)}`);
  console.log(`💾 Total space saved: ${chalk.bold(filesize(results.totalSizeReduction))}`);
  
  if (results.errors.length > 0) {
    console.log(chalk.red('\n❌ Errors:'));
    results.errors.forEach(({ file, error }) => {
      console.log(`  ${chalk.red('•')} ${path.basename(file)}: ${error}`);
    });
  }
  
  console.log(chalk.green('\n🎉 Compression completed!\n'));
}

module.exports = { compressCommand }; 