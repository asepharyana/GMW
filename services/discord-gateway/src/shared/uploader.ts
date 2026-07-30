import { createChildLogger } from "@/shared/logger/index";
import { retryWithBackoff } from "@/shared/utils/index";

const logger = createChildLogger("tele-upload");

export interface TeleUploadResponse {
  download_url: string;
  public_id?: string;
  file_name?: string;
  size_bytes?: number;
}

export interface TeleUploadResult {
  url: string;
  publicId?: string;
  filename?: string;
  sizeBytes?: number;
}

export function parseTeleUploadResponse(
  response: TeleUploadResponse,
): TeleUploadResult {
  if (!response.download_url) {
    throw new Error("Missing download_url in response");
  }

  return {
    url: response.download_url,
    publicId: response.public_id,
    filename: response.file_name,
    sizeBytes: response.size_bytes,
  };
}

export async function uploadToTele(input: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  uploadUrl: string;
  timeoutMs?: number;
  retries: number;
}): Promise<TeleUploadResult> {
  const { buffer, filename, contentType, uploadUrl, timeoutMs, retries } =
    input;

  logger.debug({ filename, uploadUrl }, "Starting tele upload");

  const response = await retryWithBackoff(
    async () => {
      const fileBlob = new Blob([new Uint8Array(buffer)], {
        type: contentType,
      });
      const formData = new FormData();
      formData.append("file", fileBlob, filename);
      formData.append("fileName", filename);

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
        },
        body: formData,
        ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!res.ok) {
        throw new Error(`Upload failed: Status ${res.status}`);
      }

      return (await res.json()) as TeleUploadResponse;
    },
    {
      retries,
      minTimeout: 1000,
      maxTimeout: 10000,
    },
  );

  return parseTeleUploadResponse(response);
}
