// Dummy test file to trigger ts-rs generation
#[test]
fn generate_bindings() {
    // This file just needs to exist so `cargo test` processes #[ts(export)]
    assert!(true);
}
