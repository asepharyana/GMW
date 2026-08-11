/**
 * BaseMediaStream — pacing/sync for GoLive frames. Ported from
 * @dank074/discord-video-stream BaseMediaStream.js, minus node-av's
 * AVFrame (frames are plain objects here) and debug-level (uses the GMW
 * logger instead).
 */

import { Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

export interface GoLiveFrame {
  data: Buffer | null;
  pts: number;
  duration: number;
  timeBase: { num: number; den: number };
  free?: () => void;
}

export class BaseMediaStream extends Writable {
  _pts: number | undefined;
  _syncTolerance = 20;
  _noSleep: boolean;
  _startTime: number | undefined;
  _startPts: number | undefined;
  _sync = true;
  _syncStream: BaseMediaStream | undefined;
  _type: string;

  constructor(type: string, noSleep = false) {
    super({ objectMode: true, highWaterMark: 0 });
    this._type = type;
    this._noSleep = noSleep;
  }

  get sync(): boolean {
    return this._sync;
  }

  set sync(val: boolean) {
    this._sync = val;
  }

  get syncStream(): BaseMediaStream | undefined {
    return this._syncStream;
  }

  set syncStream(stream: BaseMediaStream | undefined) {
    if (stream !== undefined && this === stream.syncStream) {
      throw new Error("Cannot sync 2 streams with eachother");
    }
    this._syncStream = stream;
  }

  get noSleep(): boolean {
    return this._noSleep;
  }

  set noSleep(val: boolean) {
    this._noSleep = val;
    if (!val) this.resetTimingCompensation();
  }

  get pts(): number | undefined {
    return this._pts;
  }

  get syncTolerance(): number {
    return this._syncTolerance;
  }

  set syncTolerance(n: number) {
    if (n < 0) return;
    this._syncTolerance = n;
  }

  async _sendFrame(_frame: Buffer, _frametime: number): Promise<void> {
    throw new Error("Not implemented");
  }

  ptsDelta(): number | undefined {
    if (this.pts !== undefined && this.syncStream?.pts !== undefined) {
      return this.pts - this.syncStream.pts;
    }
    return undefined;
  }

  isAhead(): boolean {
    const delta = this.ptsDelta();
    return (
      this.syncStream?.writableEnded === false &&
      delta !== undefined &&
      delta > this.syncTolerance
    );
  }

  isBehind(): boolean {
    const delta = this.ptsDelta();
    return (
      this.syncStream?.writableEnded === false &&
      delta !== undefined &&
      delta < -this.syncTolerance
    );
  }

  resetTimingCompensation(): void {
    this._startTime = this._startPts = undefined;
  }

  async _write(
    frame: GoLiveFrame,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): Promise<void> {
    const { data, pts, duration, timeBase } = frame;
    if (!data) {
      frame.free?.();
      callback();
      return;
    }
    const frametime = (Number(duration) / timeBase.den) * timeBase.num * 1000;
    const start_sendFrame = performance.now();
    await this._sendFrame(Buffer.from(data), frametime);
    const end_sendFrame = performance.now();
    this._pts = (Number(pts) / timeBase.den) * timeBase.num * 1000;
    this.emit("pts", this._pts);
    const sendTime = end_sendFrame - start_sendFrame;
    const ratio = sendTime / frametime;
    if (ratio > 1) {
      // Frame takes longer to send than its frametime — warn once per 100
      if (
        this._lastWarnedRatio === undefined ||
        ratio > this._lastWarnedRatio
      ) {
        this._lastWarnedRatio = ratio;
      }
    }
    this._startTime ??= start_sendFrame;
    this._startPts ??= this._pts;
    const sleepMs = Math.max(
      0,
      this._pts -
        this._startPts +
        frametime -
        (end_sendFrame - this._startTime),
    );
    if (this._noSleep || sleepMs === 0) {
      callback(null);
    } else if (this.sync && this.isBehind()) {
      // Stream is behind — don't sleep for this frame
      this.resetTimingCompensation();
      callback(null);
    } else if (this.sync && this.isAhead()) {
      // Stream is ahead — wait until the sync stream catches up
      do {
        await sleep(frametime);
      } while (this.sync && this.isAhead());
      this.resetTimingCompensation();
      callback(null);
    } else {
      await sleep(sleepMs);
      callback(null);
    }
    frame.free?.();
  }

  _lastWarnedRatio: number | undefined;

  _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    super._destroy(error, callback);
    this.syncStream = undefined;
  }
}
