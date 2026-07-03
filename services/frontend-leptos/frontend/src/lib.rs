pub mod app;
pub mod ui;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    // Set up panic hook for better error messages in the browser console
    console_error_panic_hook::set_once();
    // Initialize logger
    wasm_logger::init(wasm_logger::Config::default());

    // Mount the Leptos app to the body
    leptos::mount::mount_to_body(app::App);
}
