#!/usr/bin/env node

const os = require('os');
const shcl = require('@impulsedev/shcl');

console.log(shcl.cyan('🧵 SHPCK Multi-Threading Demo\n'));

const cpuCores = os.cpus().length;
const totalMemory = Math.round(os.totalmem() / 1024 / 1024 / 1024);

console.log(`💻 System Info:`);
console.log(`   CPU Cores: ${cpuCores}`);
console.log(`   Total RAM: ${totalMemory}GB`);
console.log(`   Platform: ${os.platform()}`);

console.log(shcl.yellow('\n🚀 Multi-Threading Modes:\n'));

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
  console.log(`${i + 1}. ${shcl.bold(scenario.name)}`);
  console.log(`   Threads: ${scenario.threads}`);
  console.log(`   Usage: ${scenario.description}`);
  console.log(`   Command: ${shcl.gray(`--threads ${scenario.threads}`)}\n`);
});

console.log(shcl.green('📋 Example Commands:\n'));

console.log(shcl.white('Single large file:'));
console.log(shcl.gray('node src/index.js compress video.mp4 --ultrafast --threads 8\n'));

console.log(shcl.white('Batch image processing:'));
console.log(shcl.gray('node src/index.js compress photos/*.jpg --ultrafast --threads 16 -s\n'));

console.log(shcl.white('Force multi-threading for small batches:'));
console.log(shcl.gray('node src/index.js compress file1.jpg file2.png --force-threads\n'));

console.log(shcl.white('SPEED DEMON MODE (16-core CPU):'));
console.log(shcl.red('node src/index.js compress *.* --ultrafast --no-optimize --threads 16 -s\n'));

console.log(shcl.yellow('⚠️  Potential Issues:\n'));

console.log(shcl.red('🔴 Over-subscription:'));
console.log('   • Too many workers can cause context switching');
console.log('   • Monitor CPU usage with Task Manager');
console.log('   • Use --threads <number> to limit workers\n');

console.log(shcl.yellow('🟡 I/O Bottleneck:'));
console.log('   • HDD may become bottleneck with many parallel operations');
console.log('   • SSD recommended for large batch processing');
console.log('   • CPU may idle waiting for disk reads\n');

console.log(shcl.blue('🔵 Memory Management:'));
console.log('   • Each worker loads file into memory');
console.log('   • Large files × many workers = high RAM usage');
console.log('   • Monitor memory usage during processing\n');

console.log(shcl.gray('💡 Tips:'));
console.log('• Start with default settings, then optimize');
console.log('• Use quiet mode (-s) for batch processing');
console.log('• Process similar file sizes together');
console.log('• Close other applications for maximum performance');

console.log(shcl.cyan('\n🎯 Auto-Threading Triggers:'));
console.log('• 4 or more files in batch');
console.log('• Any single file larger than 3GB');
console.log('• Manual --multi-thread flag');

console.log(shcl.cyan('\n✨ Auto-detection will choose optimal settings based on your system!')); 