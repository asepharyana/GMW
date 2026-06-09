import { z } from "zod";

export const voiceCommandSchema = z.object({
  command: z.string().min(1, "command is required"),
});

export const connectVoiceSchema = z.object({
  guildId: z.string().min(1, "guildId is required"),
  channelId: z.string().min(1, "channelId is required"),
});

export const guildIdParamSchema = z.object({
  guildId: z.string().min(1),
});

export const guildSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
});

export const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["voice", "text"]),
});

export const voiceStatusSchema = z.object({
  connected: z.boolean(),
  activeGuildId: z.string().nullable(),
  activeChannelId: z.string().nullable(),
  activeChannelName: z.string().nullable(),
});

export type VoiceCommand = z.infer<typeof voiceCommandSchema>;
export type ConnectVoice = z.infer<typeof connectVoiceSchema>;
export type Guild = z.infer<typeof guildSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type VoiceStatus = z.infer<typeof voiceStatusSchema>;
