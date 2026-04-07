//! Native desktop entry (`cargo run --features native`).

fn main() -> eframe::Result<()> {
    env_logger::init();
    let native_options = eframe::NativeOptions::default();
    eframe::run_native(
        "MuniCoins viewer",
        native_options,
        Box::new(|cc| Ok(Box::new(muni_viewer_egui::app::ViewerApp::new(cc)))),
    )
}
