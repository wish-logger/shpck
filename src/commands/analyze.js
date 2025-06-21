const path = require('path');
const fs = require('fs').promises;
const shcl = require('@impulsedev/shcl');
const ora = require('ora');
const { glob } = require('glob');
const { filesize } = require('filesize');
const mime = require('mime-types');

async function analyzeCommand(files, options) {
  const spinner = ora('Analyzing files...').start();
  
  try {
    const resolvedFiles = await resolveFiles(files, options.recursive);
    
    if (resolvedFiles.length === 0) {
      spinner.fail(shcl.red('No files found matching the pattern'));
      return;
    }

    spinner.succeed(shcl.green(`Found ${resolvedFiles.length} files to analyze`));

    const fileGroups = await groupFilesByType(resolvedFiles);
    
    console.log(shcl.cyan('\n📊 File Analysis Report\n'));
    
    const analysis = {
      images: await analyzeImages(fileGroups.images, options),
      videos: await analyzeVideos(fileGroups.videos, options),
      other: await analyzeOther(fileGroups.other, options)
    };
    
    displayAnalysisSummary(analysis, options);

  } catch (error) {
    spinner.fail(shcl.red(`Analysis failed: ${error.message}`));
    console.error(error);
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

async function analyzeImages(imageFiles, options) {
  if (imageFiles.length === 0) return null;
  
  console.log(shcl.yellow(`🖼️  Analyzing ${imageFiles.length} images...`));
  
  const analysis = {
    count: imageFiles.length,
    totalSize: 0,
    estimatedReduction: 0,
    files: []
  };
  
  for (const file of imageFiles) {
    try {
      const stats = await fs.stat(file);
      const ext = path.extname(file).toLowerCase();
      
      let estimatedReduction = getImageCompressionEstimate(ext, stats.size);
      
      const fileAnalysis = {
        path: file,
        size: stats.size,
        format: ext,
        estimatedReduction,
        estimatedSize: stats.size * (1 - estimatedReduction / 100),
        recommendations: getImageRecommendations(ext, stats.size)
      };
      
      analysis.files.push(fileAnalysis);
      analysis.totalSize += stats.size;
      analysis.estimatedReduction += (stats.size * estimatedReduction / 100);
      
      if (options.detailed) {
        console.log(
          `  ${shcl.blue(path.basename(file))} ` +
          shcl.gray(`(${filesize(stats.size)}) `) +
          shcl.green(`~${estimatedReduction}% reduction`)
        );
      }
      
    } catch (error) {
      console.log(shcl.red(`  ✗ ${path.basename(file)} - ${error.message}`));
    }
  }
  
  return analysis;
}

async function analyzeVideos(videoFiles, options) {
  if (videoFiles.length === 0) return null;
  
  console.log(shcl.yellow(`🎥 Analyzing ${videoFiles.length} videos...`));
  
  const analysis = {
    count: videoFiles.length,
    totalSize: 0,
    estimatedReduction: 0,
    files: []
  };
  
  for (const file of videoFiles) {
    try {
      const stats = await fs.stat(file);
      const ext = path.extname(file).toLowerCase();
      
      let estimatedReduction = getVideoCompressionEstimate(ext, stats.size);
      
      const fileAnalysis = {
        path: file,
        size: stats.size,
        format: ext,
        estimatedReduction,
        estimatedSize: stats.size * (1 - estimatedReduction / 100),
        recommendations: getVideoRecommendations(ext, stats.size)
      };
      
      analysis.files.push(fileAnalysis);
      analysis.totalSize += stats.size;
      analysis.estimatedReduction += (stats.size * estimatedReduction / 100);
      
      if (options.detailed) {
        console.log(
          `  ${shcl.blue(path.basename(file))} ` +
          shcl.gray(`(${filesize(stats.size)}) `) +
          shcl.green(`~${estimatedReduction}% reduction`)
        );
      }
      
    } catch (error) {
      console.log(shcl.red(`  ✗ ${path.basename(file)} - ${error.message}`));
    }
  }
  
  return analysis;
}

async function analyzeOther(otherFiles, options) {
  if (otherFiles.length === 0) return null;
  
  console.log(shcl.yellow(`📄 Found ${otherFiles.length} other files (not supported for compression)`));
  
  return {
    count: otherFiles.length,
    totalSize: 0,
    estimatedReduction: 0,
    files: []
  };
}

function getImageCompressionEstimate(format, size) {
  const estimates = {
    '.png': size > 5 * 1024 * 1024 ? 35 : 25,
    '.jpg': 15,
    '.jpeg': 15,
    '.bmp': 80,
    '.tiff': 60,
    '.webp': 5,
    '.gif': 25,
    '.avif': 3
  };
  
  return estimates[format] || 20;
}

function getVideoCompressionEstimate(format, size) {
  const estimates = {
    '.avi': 60,
    '.mov': 50,
    '.mkv': 30,
    '.mp4': 20,
    '.webm': 15,
    '.wmv': 55,
    '.flv': 65
  };
  
  return estimates[format] || 35;
}

function getImageRecommendations(format, size) {
  const recommendations = [];
  
  if (format === '.png' && size > 1024 * 1024) {
    recommendations.push('Consider converting to JPEG or WebP for better compression');
  }
  
  if (format === '.bmp') {
    recommendations.push('BMP format is uncompressed - convert to JPEG/PNG for significant savings');
  }
  
  if (size > 10 * 1024 * 1024) {
    recommendations.push('Large file - consider reducing resolution or quality');
  }
  
  if (format === '.jpg' || format === '.jpeg') {
    recommendations.push('Try progressive JPEG or WebP format');
  }
  
  return recommendations;
}

function getVideoRecommendations(format, size) {
  const recommendations = [];
  
  if (format === '.avi' || format === '.mov') {
    recommendations.push('Convert to MP4 with H.264 codec for better compression');
  }
  
  if (size > 1024 * 1024 * 1024) {
    recommendations.push('Large file - consider reducing bitrate or resolution');
  }
  
  if (format === '.wmv' || format === '.flv') {
    recommendations.push('Legacy format - convert to modern codec (H.264/H.265)');
  }
  
  return recommendations;
}

function displayAnalysisSummary(analysis, options) {
  console.log(shcl.cyan('\n📋 Summary\n'));
    
  let totalFiles = 0;
  let totalSize = 0;
  let totalEstimatedSavings = 0;
  
  if (analysis.images) {
    totalFiles += analysis.images.count;
    totalSize += analysis.images.totalSize;
    totalEstimatedSavings += analysis.images.estimatedReduction;
    
    console.log(`🖼️  Images: ${shcl.bold(analysis.images.count)} files, ${shcl.bold(filesize(analysis.images.totalSize))}`);
    console.log(`   Estimated savings: ${shcl.green(filesize(analysis.images.estimatedReduction))} (${((analysis.images.estimatedReduction / analysis.images.totalSize) * 100).toFixed(1)}%)`);
  }
  
  if (analysis.videos) {
    totalFiles += analysis.videos.count;
    totalSize += analysis.videos.totalSize;
    totalEstimatedSavings += analysis.videos.estimatedReduction;
    
    console.log(`🎥 Videos: ${shcl.bold(analysis.videos.count)} files, ${shcl.bold(filesize(analysis.videos.totalSize))}`);
    console.log(`   Estimated savings: ${shcl.green(filesize(analysis.videos.estimatedReduction))} (${((analysis.videos.estimatedReduction / analysis.videos.totalSize) * 100).toFixed(1)}%)`);
  }
  
  if (analysis.other) {
    totalFiles += analysis.other.count;
    console.log(`📄 Other files: ${shcl.bold(analysis.other.count)} files (not supported)`);
  }
  
  console.log(shcl.gray('─'.repeat(50)));
  console.log(`📊 Total: ${shcl.bold(totalFiles)} files, ${shcl.bold(filesize(totalSize))}`);
  console.log(`💾 Estimated total savings: ${shcl.bold.green(filesize(totalEstimatedSavings))} (${((totalEstimatedSavings / totalSize) * 100).toFixed(1)}%)`);
  
  console.log(shcl.green('\n💡 Run compression to achieve these savings!'));
  console.log(shcl.gray('   Use: shpck compress <files> --quality 80'));
}

module.exports = { analyzeCommand }; 