#!/usr/bin/env node

const { program } = require('commander');
const shcl = require('@impulsedev/shcl');
const pkg = require('../package.json');
const { compressCommand } = require('./commands/compress');
const { analyzeCommand } = require('./commands/analyze');
const { configCommand } = require('./commands/config');

const hasQuietFlag = process.argv.includes('-s') || process.argv.includes('--skip');

if (!hasQuietFlag) {
  console.log(shcl.cyan(`
 ███████╗██╗  ██╗██████╗  ██████╗██╗  ██╗
 ██╔════╝██║  ██║██╔══██╗██╔════╝██║ ██╔╝
 ███████╗███████║██████╔╝██║     █████╔╝ 
 ╚════██║██╔══██║██╔═══╝ ██║     ██╔═██╗ 
 ███████║██║  ██║██║     ╚██████╗██║  ██╗
 ╚══════╝╚═╝  ╚═╝╚═╝      ╚═════╝╚═╝  ╚═╝
`));

  console.log(shcl.yellow(`🚀 SHPCK v${pkg.version} - Wish Packer`));
  console.log(shcl.gray('Fast file compression for images, videos & media\n'));
}

program
  .name('shpck')
  .description(pkg.description)
  .version(pkg.version);

program
  .command('compress')
  .description('Compress files (images, videos, etc.)')
  .argument('<files...>', 'Files or patterns to compress')
  .option('-q, --quality <number>', 'Compression quality (1-100)', '85')
  .option('-s, --skip', 'Skip errors, logging and shpck ascii logo', false)
  .option('-o, --output <path>', 'Output directory or file')
  .option('-f, --format <format>', 'Output format (auto, jpg, png, webp, mp4, etc.)')
  .option('-t, --target-size <size>', 'Target file size (e.g., 200MB, 5MB)')
  .option('-st, --strategy <strategy>', 'Compression strategy: auto (intelligent), size (smallest), quality (best quality), speed (fastest)', 'auto')
  .option('-w, --width <number>', 'Target width for images/videos')
  .option('-h, --height <number>', 'Target height for images/videos')
  .option('-b, --bitrate <bitrate>', 'Video bitrate (e.g., 1000k, 2M)')
  .option('-c, --codec <codec>', 'Video codec (h264, h265, vp9)')
  .option('-r, --recursive', 'Process directories recursively')
  .option('--progressive', 'Enable progressive encoding for images')
  .option('--overwrite', 'Overwrite existing files')
  .option('--parallel <number>', 'Number of parallel processes (default: auto-detect)', null)
  .option('--threads <number>', 'Number of worker threads for multi-core processing')
  .option('--ultrafast', 'Ultra-fast mode (sacrifices quality for speed)')
  .option('--no-optimize', 'Skip advanced optimizations for maximum speed')
  .option('--multi-thread', 'Enable multi-threaded processing (auto-enabled for 4+ files or files larger than 3GB)')
  .option('--force-threads', 'Force multi-threading even for small file counts')
  .option('-k, --keep-dimensions', 'Keep original image/video dimensions (ignore --width/--height/--target-size)', false)
  .action(compressCommand);

program
  .command('analyze')
  .description('Analyze files and estimate compression potential')
  .argument('<files...>', 'Files or patterns to analyze')
  .option('-r, --recursive', 'Analyze directories recursively')
  .option('--detailed', 'Show detailed analysis')
  .action(analyzeCommand);

program
  .command('config')
  .description('Manage configuration settings')
  .option('--init', 'Initialize default configuration')
  .option('--show', 'Show current configuration')
  .option('--set <key=value>', 'Set configuration value')
  .action(configCommand);

process.on('uncaughtException', (error) => {
  if (!hasQuietFlag) {
    console.error(shcl.red('Error:'), error.message);
  }
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  if (!hasQuietFlag) {
    console.error(shcl.red('Unhandled promise rejection:'), error.message);
  }
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length && !hasQuietFlag) {
  program.outputHelp();
} 