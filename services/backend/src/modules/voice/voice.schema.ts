import { z } from "zod";

export const connectVoiceSchema = z.object({
  guildId: z.string().min(1, "guildId is required"),
  channelId: z.string().min(1, "channelId is required"),
});

export const voiceCommandSchema = z.object({
  command: z.string().min(1, "command is required"),
});

export type ConnectVoiceInput = z.infer<typeof connectVoiceSchema>;
export type VoiceCommandInput = z.infer<typeof voiceCommandSchema>;
