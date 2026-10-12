#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      #[cfg(all(debug_assertions, feature = "debug-log"))]
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .build(),
      )?;
      let _ = app;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
