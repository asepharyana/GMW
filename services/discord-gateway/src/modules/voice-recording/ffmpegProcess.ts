import { spawn } from "child_process";

export interface MuxFfmpegArgsOptions {
  inputs: string[];
  filter: string;
  output: string;
  codec: string;
  audioFrequency?: number;
  audioChannels?: number;
}

/**
 * Builds ffmpeg argument array for muxing audio clips.
 */
export function buildMuxFfmpegArgs(options: MuxFfmpegArgsOptions): string[] {
  const args: string[] = ["-y"];

  for (const input of options.inputs) {
    args.push("-i", input);
  }

  args.push("-filter_complex", options.filter);
  args.push("-map", "[out]");
  args.push("-codec:a", options.codec);

  if (options.audioFrequency !== undefined) {
    args.push("-ar", String(options.audioFrequency));
  }

  if (options.audioChannels !== undefined) {
    args.push("-ac", String(options.audioChannels));
  }

  args.push(options.output);

  return args;
}

/**
 * Runs ffmpeg with the given arguments.
 * Resolves on successful (code 0) exit, rejects on error or non-zero exit.
 */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "inherit", "inherit"],
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}
