// services/frontend/frontend/src/logger.rs
// Structured logging for WASM browser console with levels, timestamps, and styled output.

/// Log level with numeric priority (lower = more verbose).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warn = 3,
    Error = 4,
}

impl LogLevel {
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }

    /// CSS color for the browser console label.
    fn console_style(&self) -> &'static str {
        match self {
            LogLevel::Trace => "color:#888",
            LogLevel::Debug => "color:#54a2ff",
            LogLevel::Info => "color:#23a1eb;font-weight:bold",
            LogLevel::Warn => "color:#f59e0b;font-weight:bold",
            LogLevel::Error => "color:#e4405f;font-weight:bold",
        }
    }
}

/// A per-module logger that produces styled, timestamped console output.
#[derive(Clone)]
pub struct Logger {
    module: &'static str,
    min_level: LogLevel,
}

impl Logger {
    /// Create a logger for a given module path (call with `module_path!()`).
    pub const fn new(module: &'static str, min_level: LogLevel) -> Self {
        Self { module, min_level }
    }

    /// Create a logger that shows everything (min_level = Trace).
    pub const fn verbose(module: &'static str) -> Self {
        Self::new(module, LogLevel::Trace)
    }

    /// Format an ISO-like timestamp from `Date.now()`.
    fn timestamp() -> String {
        let d = js_sys::Date::new_0();
        // HH:MM:SS.mmm
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            d.get_hours(),
            d.get_minutes(),
            d.get_seconds(),
            d.get_milliseconds()
        )
    }

    fn should_log(&self, level: LogLevel) -> bool {
        level >= self.min_level
    }

    fn log_inner(&self, level: LogLevel, message: &str) {
        if !self.should_log(level) {
            return;
        }
        let ts = Self::timestamp();
        let lvl_str = level.as_str();
        let style = level.console_style();
        let styled = format!("%c{:.7} [{}] {}", ts, self.module, message);
        match level {
            LogLevel::Error => {
                web_sys::console::error_3(
                    &styled.into(),
                    &style.into(),
                    &"".into(),
                );
            }
            LogLevel::Warn => {
                web_sys::console::warn_3(
                    &styled.into(),
                    &style.into(),
                    &"".into(),
                );
            }
            _ => {
                web_sys::console::log_3(
                    &styled.into(),
                    &style.into(),
                    &"".into(),
                );
            }
        }
    }

    pub fn trace(&self, msg: &str) {
        self.log_inner(LogLevel::Trace, msg);
    }

    pub fn debug(&self, msg: &str) {
        self.log_inner(LogLevel::Debug, msg);
    }

    pub fn info(&self, msg: &str) {
        self.log_inner(LogLevel::Info, msg);
    }

    pub fn warn(&self, msg: &str) {
        self.log_inner(LogLevel::Warn, msg);
    }

    pub fn error(&self, msg: &str) {
        self.log_inner(LogLevel::Error, msg);
    }

    /// Log with a dynamic format string.
    pub fn info_fmt(&self, fmt: &str, args: &[&dyn std::fmt::Display]) {
        let msg = if args.is_empty() {
            fmt.to_string()
        } else {
            let mut s = String::new();
            let mut iter = args.iter();
            for part in fmt.split("{}") {
                s.push_str(part);
                if let Some(arg) = iter.next() {
                    s.push_str(&arg.to_string());
                }
            }
            s
        };
        self.log_inner(LogLevel::Info, &msg);
    }
}

/// Macro to create a module-level logger at `Info` level.
/// Usage: `log::module!()` at the top of a source file (after imports).
#[macro_export]
macro_rules! make_logger {
    () => {
        static LOGGER: std::sync::LazyLock<$crate::logger::Logger> =
            std::sync::LazyLock::new(|| {
                $crate::logger::Logger::new(module_path!(), $crate::logger::LogLevel::Trace)
            });
    };
}

/// Convenience macros that log through the module's static LOGGER.
/// Usage: `log_info!("something happened")`.
#[macro_export]
macro_rules! log_trace {
    ($($arg:tt)*) => { LOGGER.trace(&format!($($arg)*)); };
}
#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => { LOGGER.debug(&format!($($arg)*)); };
}
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => { LOGGER.info(&format!($($arg)*)); };
}
#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => { LOGGER.warn(&format!($($arg)*)); };
}
#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => { LOGGER.error(&format!($($arg)*)); };
}
