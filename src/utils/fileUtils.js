const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream').promises;

class FileUtils {
  /**
   * Check if a file exists
   */
  static async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  static async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Create directory recursively if it doesn't exist
   */
  static async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Copy file with progress tracking
   */
  static async copyFile(source, destination, onProgress) {
    await this.ensureDir(path.dirname(destination));
    
    const sourceSize = await this.getFileSize(source);
    let copiedBytes = 0;

    const sourceStream = createReadStream(source);
    const destStream = createWriteStream(destination);

    sourceStream.on('data', (chunk) => {
      copiedBytes += chunk.length;
      if (onProgress) {
        onProgress(copiedBytes, sourceSize);
      }
    });

    await pipeline(sourceStream, destStream);
  }

  /**
   * Move file
   */
  static async moveFile(source, destination) {
    await this.ensureDir(path.dirname(destination));
    await fs.rename(source, destination);
  }

  /**
   * Delete file safely
   */
  static async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get file extension
   */
  static getExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Get file name without extension
   */
  static getBaseName(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * Generate unique filename if file already exists
   */
  static async getUniqueFileName(filePath) {
    if (!await this.exists(filePath)) {
      return filePath;
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    let counter = 1;
    let newPath;
    
    do {
      newPath = path.join(dir, `${base}_${counter}${ext}`);
      counter++;
    } while (await this.exists(newPath));

    return newPath;
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Calculate compression ratio
   */
  static getCompressionRatio(originalSize, compressedSize) {
    if (originalSize === 0) return 0;
    return ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
  }

  /**
   * Validate file path
   */
  static validatePath(filePath) {
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(filePath)) {
      throw new Error(`Invalid characters in file path: ${filePath}`);
    }

    if (filePath.length > 260) {
      throw new Error(`File path too long: ${filePath}`);
    }

    return true;
  }

  /**
   * Get safe filename (remove invalid characters)
   */
  static getSafeFileName(fileName) {
    return fileName
      .replace(/[<>:"|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .trim();
  }

  /**
   * Get relative path
   */
  static getRelativePath(from, to) {
    return path.relative(from, to);
  }

  /**
   * Check if path is absolute
   */
  static isAbsolute(filePath) {
    return path.isAbsolute(filePath);
  }

  /**
   * Normalize path separators
   */
  static normalizePath(filePath) {
    return path.normalize(filePath);
  }

  /**
   * Get file stats with additional info
   */
  static async getFileStats(filePath) {
    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      permissions: stats.mode,
      formattedSize: this.formatFileSize(stats.size)
    };
  }

  /**
   * Read file in chunks for processing large files
   */
  static async readFileInChunks(filePath, chunkSize = 64 * 1024, processor) {
    const stream = createReadStream(filePath, { highWaterMark: chunkSize });
    
    for await (const chunk of stream) {
      await processor(chunk);
    }
  }

  /**
   * Get disk space info for a path
   */
  static async getDiskSpace(dirPath) {
    try {
      const stats = await fs.statvfs(dirPath);
      
      return {
        total: stats.f_blocks * stats.f_frsize,
        free: stats.f_bavail * stats.f_frsize,
        used: (stats.f_blocks - stats.f_bavail) * stats.f_frsize
      };
    } catch {
      return {
        total: 0,
        free: 0,
        used: 0
      };
    }
  }
}

module.exports = { FileUtils }; 