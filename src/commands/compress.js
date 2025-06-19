const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const ora = require('ora');
const { glob } = require('glob');
const { filesize } = require('filesize');
const mime = require('mime-types');

const { ImageCompressor } = require('../compressors/imageCompressor');
const { VideoCompressor } = require('../compressors/videoCompressor');
const { FileUtils } = require('../utils/fileUtils');
const { ProgressManager } = require('../utils/progressManager');

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

    const fileGroups = await groupFilesByType(resolvedFiles);
    
    const progressManager = new ProgressManager(resolvedFiles.length);
    
    const imageCompressor = new ImageCompressor(options);
    const videoCompressor = new VideoCompressor(options);
    
    const results = {
      processed: 0,
      totalSizeReduction: 0,
      errors: []
    };

    if (!isQuiet) {
      console.log(chalk.cyan('\n🚀 Starting compression...\n'));
    }

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
  const parallel = parseInt(options.parallel) || 4;
  const chunks = chunkArray(files, parallel);
  const isQuiet = options.skip;

  for (const chunk of chunks) {
    const promises = chunk.map(async (file) => {
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
      }
    });

    await Promise.all(promises);
  }
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