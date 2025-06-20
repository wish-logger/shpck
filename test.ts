import shpck from './src/api'

shpck.compress('test.mp4', {
  quality: 50,
  format: 'mp4',
  targetSize: '100MB',
  strategy: 'quality',
  width: 1920,
  height: 1080,
  bitrate: '1000k',
})