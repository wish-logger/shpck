export interface CompressOptions {
  /** Compression quality (1-100). */
  quality?: number;
  /** Enable ultra-fast mode (sacrifices quality for speed). */
  ultrafast?: boolean;
  /** Number of worker threads to use. */
  threads?: number;
  /** Target file size, e.g. '50MB', '500KB'. */
  targetSize?: string;
  /** Suppress all output (quiet mode, disables logo and logs). */
  skip?: boolean;
  /** Output file or directory path. */
  output?: string;
  /** Output format (jpg, png, webp, mp4, etc.). */
  format?: string;
  /** Target width for images/videos. */
  width?: number;
  /** Target height for images/videos. */
  height?: number;
  /** Video bitrate, e.g. '1000k'. */
  bitrate?: string;
  /** Video codec (h264, h265, vp9, etc.). */
  codec?: string;
  /** Process directories recursively. */
  recursive?: boolean;
  /** Overwrite existing files. */
  overwrite?: boolean;
  /** Skip advanced optimizations for maximum speed. */
  noOptimize?: boolean;
  /** Enable multi-threaded processing. */
  multiThread?: boolean;
  /** Force multi-threading even for small file counts. */
  forceThreads?: boolean;
}

export function compress(
  files: string | string[],
  options?: CompressOptions
): Promise<void>;

export function analyze(files: string | string[], options?: any): Promise<void>;
export function config(options?: any): Promise<void>; 