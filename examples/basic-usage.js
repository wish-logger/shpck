const { ImageCompressor } = require('../src/compressors/imageCompressor');
const { VideoCompressor } = require('../src/compressors/videoCompressor');

async function basicImageExample() {
  console.log('🖼️  Basic Image Compression Example');
  
  const compressor = new ImageCompressor();
  
  try {
    const result = await compressor.compress('example.jpg', {
      quality: 80,
      format: 'jpeg',
      progressive: true
    });
    
    console.log(`Original: ${result.originalSize} bytes`);
    console.log(`Compressed: ${result.compressedSize} bytes`);
    console.log(`Reduction: ${result.reduction}%`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function targetSizeImageExample() {
  console.log('🎯 Target Size Image Compression Example');
  
  const compressor = new ImageCompressor();
  
  try {
    const result = await compressor.compress('large-image.png', {
      targetSize: '500KB',
      format: 'jpeg'
    });
    
    console.log(`Target size achieved: ${result.compressedSize} bytes`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function basicVideoExample() {
  console.log('🎥 Basic Video Compression Example');
  
  const compressor = new VideoCompressor();
  
  try {
    const result = await compressor.compress('video.mp4', {
      codec: 'h264',
      quality: 'medium',
      bitrate: '1000k'
    });
    
    console.log(`Original: ${result.originalSize} bytes`);
    console.log(`Compressed: ${result.compressedSize} bytes`);
    console.log(`Reduction: ${result.reduction}%`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function targetSizeVideoExample() {
  console.log('🎯 Target Size Video Compression Example');
  
  const compressor = new VideoCompressor();
  
  try {
    const result = await compressor.compress('large-video.mov', {
      targetSize: '200MB',
      codec: 'h264',
      format: 'mp4'
    });
    
    console.log(`Original: ${(result.originalSize / 1024 / 1024 / 1024).toFixed(2)}GB`);
    console.log(`Compressed: ${(result.compressedSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Massive reduction: ${result.reduction}%`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function batchProcessingExample() {
  console.log('📦 Batch Processing Example');
  
  const imageCompressor = new ImageCompressor();
  const files = [
    'photo1.jpg',
    'photo2.png', 
    'photo3.jpeg'
  ];
  
  const results = [];
  
  for (const file of files) {
    try {
      const result = await imageCompressor.compress(file, {
        quality: 85,
        format: 'webp'
      });
      
      results.push(result);
      console.log(`✓ Processed ${file}: ${result.reduction}% reduction`);
      
    } catch (error) {
      console.log(`✗ Failed to process ${file}: ${error.message}`);
    }
  }
  
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
  const totalReduction = ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(2);
  
  console.log(`\nTotal space saved: ${totalReduction}%`);
}

// Run examples
async function runExamples() {
  console.log('🚀 SHPCK API Examples\n');
  
  try {
    await basicImageExample();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    await targetSizeImageExample();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    await basicVideoExample();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    await targetSizeVideoExample();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    await batchProcessingExample();
    
  } catch (error) {
    console.error('Example execution failed:', error.message);
  }
}

module.exports = {
  basicImageExample,
  targetSizeImageExample,
  basicVideoExample,
  targetSizeVideoExample,
  batchProcessingExample
};

if (require.main === module) {
  runExamples();
} 