const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { ImageCompressor } = require('../compressors/imageCompressor');
const { VideoCompressor } = require('../compressors/videoCompressor');
const fs = require('fs').promises;
const path = require('path');

if (!isMainThread) {
  async function processChunk() {
    try {
      const { files, options, workerIndex } = workerData;
      
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
      
      const results = [];
      
      for (const file of files) {
        try {
          const startTime = Date.now();
          
          const isImage = /\.(jpg|jpeg|png|webp|avif|bmp|tiff)$/i.test(file);
          const isVideo = /\.(mp4|avi|mov|mkv|webm|flv|wmv)$/i.test(file);
          
          let result;
          if (isImage) {
            result = await imageCompressor.compress(file, options);
          } else if (isVideo) {
            result = await videoCompressor.compress(file, options);
          } else {
            throw new Error(`Unsupported file type: ${path.extname(file)}`);
          }
          
          const processingTime = Date.now() - startTime;
          
          results.push({
            ...result,
            processingTime,
            workerIndex,
            success: true
          });
          
          parentPort.postMessage({
            type: 'progress',
            file: path.basename(file),
            result,
            workerIndex
          });
          
        } catch (error) {
          results.push({
            file,
            error: error.message,
            workerIndex,
            success: false
          });
          
          parentPort.postMessage({
            type: 'error',
            file: path.basename(file),
            error: error.message,
            workerIndex
          });
        }
      }
      
      parentPort.postMessage({
        type: 'complete',
        results,
        workerIndex
      });
      
    } catch (error) {
      parentPort.postMessage({
        type: 'worker_error',
        error: error.message,
        workerIndex: workerData.workerIndex
      });
    }
  }
  
  processChunk();
}

module.exports = { Worker }; 