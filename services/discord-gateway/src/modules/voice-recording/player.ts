import type { Readable } from "node:stream";
import {
  type AudioPlayer,
  AudioPlayerStatus,
  type AudioResource,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  type VoiceConnection,
} from "@discordjs/voice";
import { createChildLogger } from "@/shared/logger/index";
import type { DiscordPlayerOwner, DiscordPlayOptions } from "./mediaTypes.js";

const logger = createChildLogger("player");

export class DiscordPlayer {
  private player: AudioPlayer;
  private connection: VoiceConnection | null = null;
  private owner: DiscordPlayerOwner = "none";
  private resource: AudioResource | null = null;
  private musicVolume = 1;
  private idleCallback: (() => void) | null = null;
  /** Set before manual stop() calls to distinguish from natural track end. */
  private manualStop = false;

  constructor() {
    this.player = createAudioPlayer();

    this.player.on(AudioPlayerStatus.Playing, () => {
      logger.info("Audio player is now playing!");
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      // manualStop guards against both sync & async idle emission from stop()
      if (this.manualStop || this.owner === "none") {
        this.manualStop = false;
        return;
      }
      // Natural track end — queue auto-advance
      logger.info("Audio player finished — advancing queue");
      this.owner = "none";
      this.resource = null;
      this.idleCallback?.();
    });

    this.player.on("error", (error) => {
      logger.error({ error: error.message }, "Audio player error");
      this.owner = "none";
      this.resource = null;
    });
  }

  /** Register a callback fired when the player goes idle after a natural track end. */
  public onIdle(cb: () => void): void {
    this.idleCallback = cb;
  }

  public setConnection(connection: VoiceConnection) {
    this.connection = connection;
    this.connection.subscribe(this.player);
  }

  public getOwner(): DiscordPlayerOwner {
    return this.owner;
  }

  public isConnected(): boolean {
    return this.connection !== null;
  }

  public playStream(
    stream: Readable,
    owner: DiscordPlayerOwner,
    options: DiscordPlayOptions = {},
  ) {
    if (owner === "none") {
      throw new Error("Discord audio player owner is required");
    }
    this.assertOwnerAvailable(owner);

    const resource = createAudioResource(stream, {
      inputType: options.inputType ?? StreamType.OggOpus,
      // Default to true so setMusicVolume/setResourceVolume works
      inlineVolume: options.inlineVolume ?? true,
    });

    if (this.owner === owner) {
      this.manualStop = true;
      this.player.stop();
    }
    this.resource = resource;
    this.owner = owner;
    if (owner === "music") {
      const nextVolume =
        options.volume !== undefined
          ? this.normalizeVolume(options.volume)
          : this.musicVolume;
      this.musicVolume = nextVolume;
      this.setResourceVolume(nextVolume);
    }
    this.player.play(resource);
    this.unpause(owner);
    this.connection?.subscribe(this.player);
  }

  public getStatus(): AudioPlayerStatus {
    return this.player.state.status;
  }

  public pause(owner?: DiscordPlayerOwner) {
    if (!this.canControl(owner)) return;
    this.player.pause(true);
  }

  public unpause(owner?: DiscordPlayerOwner): boolean {
    if (!this.canControl(owner)) return false;
    return this.player.unpause();
  }

  public stop(owner?: DiscordPlayerOwner) {
    if (!this.canControl(owner)) return;
    this.manualStop = true;
    this.player.stop();
    this.owner = "none";
    this.resource = null;
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setMusicVolume(volume: number): void {
    const nextVolume = this.normalizeVolume(volume);
    this.musicVolume = nextVolume;
    if (this.owner === "music") {
      this.setResourceVolume(nextVolume);
    }
  }

  private assertOwnerAvailable(owner: DiscordPlayerOwner): void {
    if (this.owner !== "none" && this.owner !== owner) {
      throw new Error(`Discord audio player is owned by ${this.owner}`);
    }
  }

  private canControl(owner?: DiscordPlayerOwner): boolean {
    return !owner || this.owner === "none" || this.owner === owner;
  }

  private normalizeVolume(volume: number): number {
    if (!Number.isFinite(volume)) return this.musicVolume;
    return Math.max(0, Math.min(1, volume));
  }

  private setResourceVolume(volume: number): void {
    if (!this.resource?.volume) return;
    this.resource.volume.setVolume(volume);
  }
}

export const discordPlayer = new DiscordPlayer();
