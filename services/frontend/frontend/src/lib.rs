pub mod api;
pub mod app;
pub mod auth;
pub mod features;
pub mod layout;
pub mod logger;
pub mod ui;
pub mod ws;


use wasm_bindgen::prelude::*;

make_logger!();

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    wasm_logger::init(wasm_logger::Config::default());
    log_info!("IMPHNEN frontend starting...");
    leptos::mount::mount_to_body(app::App);
}
