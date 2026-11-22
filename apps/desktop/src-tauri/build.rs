fn main() {
    // Re-embed the Windows icon whenever it is regenerated; otherwise Cargo reuses a stale resource.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
