import "dotenv/config";
import { config as sharedConfig } from "@bete/shared/config";

export const config = sharedConfig;
export type Config = typeof config;
