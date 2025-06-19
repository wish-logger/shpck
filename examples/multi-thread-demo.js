#!/usr/bin/env node

const os = require('os');
const chalk = require('chalk');

console.log(chalk.cyan('🧵 SHPCK Multi-Threading Demo\n'));

const cpuCores = os.cpus().length;
const totalMemory = Math.round(os.totalmem() / 1024 / 1024 / 1024);

console.log(`💻 System Info:`);
console.log(`   CPU Cores: ${cpuCores}`);
console.log(`   Total RAM: ${totalMemory}GB`);
console.log(`   Platform: ${os.platform()}`);

console.log(chalk.yellow('\n🚀 Multi-Threading Modes:\n'));

const scenarios = [
  {
    name: 'Conservative Mode',
    threads: Math.floor(cpuCores * 0.75),
    description: 'Safe for most systems, leaves cores for OS'
  },
  {
    name: 'Ultra-Fast Mode',
    threads: cpuCores,
    description: '50% cores × 2 workers = maximum speed'
  },
  {
    name: 'Aggressive Mode', 
    threads: cpuCores * 2,
    description: 'Risk of over-subscription, but maximum throughput'
  }
];

scenarios.forEach((scenario, i) => {
  console.log(`${i + 1}. ${chalk.bold(scenario.name)}`);
  console.log(`   Threads: ${scenario.threads}`);
  console.log(`   Usage: ${scenario.description}`);
  console.log(`   Command: ${chalk.gray(`--threads ${scenario.threads}`)}\n`);
});

console.log(chalk.green('📋 Example Commands:\n'));

console.log(chalk.white('Single large file:'));
console.log(chalk.gray('node src/index.js compress video.mp4 --ultrafast --threads 8\n'));

console.log(chalk.white('Batch image processing:'));
console.log(chalk.gray('node src/index.js compress photos/*.jpg --ultrafast --threads 16 -s\n'));

console.log(chalk.white('Force multi-threading for small batches:'));
console.log(chalk.gray('node src/index.js compress file1.jpg file2.png --force-threads\n'));

console.log(chalk.white('SPEED DEMON MODE (16-core CPU):'));
console.log(chalk.red('node src/index.js compress *.* --ultrafast --no-optimize --threads 16 -s\n'));

console.log(chalk.yellow('⚠️  Potential Issues:\n'));

console.log(chalk.red('🔴 Over-subscription:'));
console.log('   • Too many workers can cause context switching');
console.log('   • Monitor CPU usage with Task Manager');
console.log('   • Use --threads <number> to limit workers\n');

console.log(chalk.yellow('🟡 I/O Bottleneck:'));
console.log('   • HDD may become bottleneck with many parallel operations');
console.log('   • SSD recommended for large batch processing');
console.log('   • CPU may idle waiting for disk reads\n');

console.log(chalk.blue('🔵 Memory Management:'));
console.log('   • Each worker loads file into memory');
console.log('   • Large files × many workers = high RAM usage');
console.log('   • Monitor memory usage during processing\n');

console.log(chalk.gray('💡 Tips:'));
console.log('• Start with default settings, then optimize');
console.log('• Use quiet mode (-s) for batch processing');
console.log('• Process similar file sizes together');
console.log('• Close other applications for maximum performance');

console.log(chalk.cyan('\n🎯 Auto-Threading Triggers:'));
console.log('• 4 or more files in batch');
console.log('• Any single file larger than 3GB');
console.log('• Manual --multi-thread flag');

console.log(chalk.cyan('\n✨ Auto-detection will choose optimal settings based on your system!')); 