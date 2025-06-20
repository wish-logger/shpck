const { compressCommand } = require('./commands/compress');
const { analyzeCommand } = require('./commands/analyze');
const { configCommand } = require('./commands/config');

/**
 * @typedef {Object} CompressionOptions
 * @property {number} [quality=85] - Compression quality (1-100). Higher values = better quality but larger files.
 * @property {boolean} [skip=false] - Skip errors, logging and shpck ascii logo. Quiet mode for automated scripts.
 * @property {string} [output] - Output directory or file path. If not specified, files are compressed in-place.
 * @property {string} [format] - Output format (auto, jpg, png, webp, avif, mp4, mkv, etc.). Auto-detects best format if not specified.
 * @property {string} [targetSize] - Target file size (e.g., "200MB", "5MB", "1GB"). Tool will adjust compression to reach this size.
 * @property {'auto'|'size'|'quality'|'speed'} [strategy='auto'] - Compression strategy: "auto" (intelligent), "size" (smallest file), "quality" (best quality), "speed" (fastest processing).
 * @property {number} [width] - Target width for images/videos in pixels. Maintains aspect ratio if only width or height specified.
 * @property {number} [height] - Target height for images/videos in pixels. Maintains aspect ratio if only width or height specified.
 * @property {string} [bitrate] - Video bitrate (e.g., "1000k", "2M", "500k"). Controls video quality vs file size.
 * @property {'h264'|'h265'|'vp9'|'av1'} [codec] - Video codec ("h264", "h265", "vp9", "av1"). h264 = compatibility, h265/vp9 = efficiency.
 * @property {boolean} [recursive=false] - Process directories recursively. Scans all subdirectories for files.
 * @property {boolean} [progressive=false] - Enable progressive encoding for images. Better for web loading.
 * @property {boolean} [overwrite=false] - Overwrite existing files. WARNING: Not supported for video files.
 * @property {number} [parallel] - Number of parallel processes (default: auto-detect based on CPU cores). Higher = faster but more resource usage.
 * @property {number} [threads] - Number of worker threads for multi-core processing. Enables true parallel compression.
 * @property {boolean} [ultrafast=false] - Ultra-fast mode. Sacrifices quality for maximum speed. Good for batch processing.
 * @property {boolean} [noOptimize=false] - Skip advanced optimizations for maximum speed. Faster but less efficient compression.
 * @property {boolean} [multiThread=false] - Enable multi-threaded processing. Auto-enabled for 4+ files or files >3GB.
 * @property {boolean} [forceThreads=false] - Force multi-threading even for small file counts. Useful for consistent performance.
 * @property {boolean} [keepDimensions=false] - Keep original image/video dimensions. Ignores width/height/targetSize scaling.
 */

/**
 * @typedef {Object} CompressionResult
 * @property {number} processed - Number of files successfully processed
 * @property {number} totalSizeReduction - Total bytes saved across all files
 * @property {Array<{file: string, error: string}>} errors - List of files that failed to process with error messages
 */

/**
 * Compress images, videos, and media files with advanced multi-threaded processing.
 * 
 * 
 * @param {string|string[]} files - File path, directory path, or array of paths/patterns to compress
 * @param {CompressionOptions} [options] - Compression configuration options
 * @returns {Promise<CompressionResult>} Promise resolving to compression results with statistics
 * 
 */
async function compress(files, options) {
  return await compressCommand(Array.isArray(files) ? files : [files], options || {});
}

/**
 * @typedef {Object} AnalysisOptions
 * @property {boolean} [recursive=false] - Analyze directories recursively
 * @property {boolean} [detailed=false] - Show detailed analysis with recommendations
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {number} totalFiles - Total number of files analyzed
 * @property {number} totalSize - Total size of all files in bytes
 * @property {number} estimatedSavings - Estimated bytes that could be saved
 * @property {Array<Object>} fileAnalysis - Detailed analysis per file
 */

/**
 * Analyze files and estimate compression potential without actually compressing them.
 * Provides insights into file sizes, formats, and potential space savings.
 * 
 * @param {string|string[]} files - File path, directory path, or array of paths/patterns to analyze
 * @param {AnalysisOptions} [options] - Analysis configuration options
 * @returns {Promise<AnalysisResult>} Promise resolving to analysis results with estimates
 * 

 */
async function analyze(files, options) {
  return await analyzeCommand(Array.isArray(files) ? files : [files], options || {});
}

/**
 * @typedef {Object} ConfigOptions
 * @property {boolean} [init=false] - Initialize default configuration
 * @property {boolean} [show=false] - Show current configuration
 * @property {string} [set] - Set configuration value (format: "key=value")
 */

/**
 * Manage shpck configuration settings. Set default compression options,
 * thread counts, and other preferences that persist across sessions.
 * 
 * @param {ConfigOptions} [options] - Configuration management options
 * @returns {Promise<void>} Promise resolving when configuration operation completes
 * 

 */
async function config(options) {
  return await configCommand(options || {});
}

module.exports = {
  compress,
  analyze,
  config,
};