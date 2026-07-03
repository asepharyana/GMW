/// PCM Frame decoded from binary WebSocket data
/// Format: [u32 userId (4 bytes)][i16 samples (N bytes)]
pub struct PcmFrame {
    pub user_id: u32,
    pub samples: Vec<f32>, // Normalized to [-1.0, 1.0]
}

/// Decode a binary WebSocket message into PCM frames
/// Returns None if data is too short or malformed
pub fn decode_pcm_frame(data: &[u8]) -> Option<PcmFrame> {
    if data.len() < 4 {
        return None;
    }

    let user_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let sample_bytes = &data[4..];
    let sample_count = sample_bytes.len() / 2;

    if sample_count == 0 {
        return None;
    }

    let samples = decode_i16_samples(sample_bytes);
    Some(PcmFrame { user_id, samples })
}

/// Decode raw i16 PCM bytes to normalized f32 samples [-1.0, 1.0]
pub fn decode_i16_samples(data: &[u8]) -> Vec<f32> {
    let count = data.len() / 2;
    let mut out = Vec::with_capacity(count);

    for i in 0..count {
        let offset = i * 2;
        if offset + 1 < data.len() {
            let sample = i16::from_le_bytes([data[offset], data[offset + 1]]);
            out.push((sample as f32) / 32768.0);
        }
    }

    out
}

/// Encode f32 samples [-1.0, 1.0] to base64 for WebSocket transmission
/// Uses JavaScript btoa for encoding
pub fn encode_samples_to_base64(samples: &[f32]) -> String {
    // Convert f32 samples to i16 bytes
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let int_sample = (clamped * 32767.0) as i16;
        bytes.extend_from_slice(&int_sample.to_le_bytes());
    }
    encode_bytes_base64(&bytes)
}

/// Encode raw bytes to base64 using JavaScript's btoa
fn encode_bytes_base64(data: &[u8]) -> String {
    // Build binary string for btoa
    let binary: String = data.iter().map(|&b| b as char).collect();

    // Call btoa from JavaScript via js_sys::eval
    let js_code = format!("btoa('{}')", binary.replace('\'', "\\'"));
    js_sys::eval(&js_code)
        .ok()
        .and_then(|r| r.as_string())
        .unwrap_or_default()
}
