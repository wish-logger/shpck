const { compressCommand } = require('./commands/compress');
const { analyzeCommand } = require('./commands/analyze');
const { configCommand } = require('./commands/config');

/**
 * Compress files (images, videos, etc.).
 * @param {string|string[]} files - File path, glob, or array of paths/globs.
 * @param {Object} options - Compression options.
 * @param {number} [options.quality] - Compression quality (1-100).
 * @param {boolean} [options.ultrafast] - Enable ultra-fast mode.
 * @param {number} [options.threads] - Number of worker threads.
 * @param {string} [options.targetSize] - Target file size (e.g., '50MB', '500KB').
 * @param {boolean} [options.quiet] - Suppress output.
 * @param {string} [options.output] - Output file or directory.
 * @param {string} [options.format] - Output format (jpg, png, webp, mp4, etc.).
 * @param {number} [options.width] - Target width.
 * @param {number} [options.height] - Target height.
 * @param {string} [options.bitrate] - Video bitrate (e.g., '1000k').
 * @param {string} [options.codec] - Video codec (h264, h265, vp9).
 * @param {boolean} [options.recursive] - Process directories recursively.
 * @param {boolean} [options.overwrite] - Overwrite existing files.
 * @param {boolean} [options.noOptimize] - Skip advanced optimizations.
 * @param {boolean} [options.multiThread] - Enable multi-threaded processing.
 * @param {boolean} [options.forceThreads] - Force multi-threading.
 * @returns {Promise<void>}
 */
async function compress(files, options) {
  return compressCommand(Array.isArray(files) ? files : [files], options || {});
}

module.exports = {
  compress,
  analyze: analyzeCommand,
  config: configCommand,
};  