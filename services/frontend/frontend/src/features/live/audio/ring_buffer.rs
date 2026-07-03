use std::sync::{Arc, Mutex};

/// AudioRingBuffer — Fixed-size circular buffer for real-time PCM streaming
/// Provides thread-safe write/read with automatic overwrite protection
pub struct AudioRingBuffer {
    buffer: Vec<f32>,
    capacity: usize,
    write_pos: usize,
    read_pos: usize,
    available: usize,
}

impl AudioRingBuffer {
    /// Create a new ring buffer with given capacity (in samples)
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: vec![0.0; capacity],
            capacity,
            write_pos: 0,
            read_pos: 0,
            available: 0,
        }
    }

    /// Write samples to the ring buffer. Overwrites oldest data if full.
    pub fn write(&mut self, samples: &[f32]) {
        let mut written = 0;
        while written < samples.len() {
            let chunk = (samples.len() - written).min(self.capacity - self.write_pos);
            let src = &samples[written..written + chunk];
            let dest = &mut self.buffer[self.write_pos..self.write_pos + chunk];
            dest.copy_from_slice(src);
            written += chunk;
            self.write_pos = (self.write_pos + chunk) % self.capacity;
            self.available = (self.available + chunk).min(self.capacity);
            // If we overwrote unread data, advance read_pos
            if self.available == self.capacity {
                self.read_pos = self.write_pos;
            }
        }
    }

    /// Read up to `max_samples` from the buffer. Returns the samples read.
    pub fn read(&mut self, max_samples: usize) -> Vec<f32> {
        let to_read = max_samples.min(self.available);
        let mut out = Vec::with_capacity(to_read);
        let mut remaining = to_read;

        while remaining > 0 {
            let chunk = remaining.min(self.capacity - self.read_pos);
            out.extend_from_slice(&self.buffer[self.read_pos..self.read_pos + chunk]);
            remaining -= chunk;
            self.read_pos = (self.read_pos + chunk) % self.capacity;
        }

        self.available -= to_read;
        out
    }

    /// Number of samples available to read
    pub fn available_samples(&self) -> usize {
        self.available
    }

    /// Clear all buffered data
    pub fn clear(&mut self) {
        self.write_pos = 0;
        self.read_pos = 0;
        self.available = 0;
    }
}

/// Thread-safe wrapper around AudioRingBuffer
pub struct SharedRingBuffer {
    inner: Arc<Mutex<AudioRingBuffer>>,
}

impl SharedRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AudioRingBuffer::new(capacity))),
        }
    }

    pub fn write(&self, samples: &[f32]) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.write(samples);
        }
    }

    pub fn read(&self, max_samples: usize) -> Vec<f32> {
        if let Ok(mut guard) = self.inner.lock() {
            guard.read(max_samples)
        } else {
            Vec::new()
        }
    }

    pub fn available_samples(&self) -> usize {
        if let Ok(guard) = self.inner.lock() {
            guard.available_samples()
        } else {
            0
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.clear();
        }
    }

    pub fn clone_inner(&self) -> Arc<Mutex<AudioRingBuffer>> {
        self.inner.clone()
    }
}

impl Clone for SharedRingBuffer {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}
