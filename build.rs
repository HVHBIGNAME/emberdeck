use std::{env, fs, path::Path};

fn collect(root: &Path, directory: &Path, output: &mut String) -> std::io::Result<()> {
    let mut entries = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            collect(root, &path, output)?;
        } else {
            let name = path
                .strip_prefix(root)
                .expect("asset below root")
                .to_string_lossy()
                .replace('\\', "/");
            output.push_str(&format!(
                "({name:?}, include_bytes!({:?})),\n",
                path.canonicalize()?
            ));
        }
    }
    Ok(())
}

fn main() {
    println!("cargo:rerun-if-changed=web/dist");
    let root = Path::new("web/dist");
    let mut code = String::from("pub static ASSETS: &[(&str, &[u8])] = &[\n");
    if root.join("index.html").exists() {
        collect(root, root, &mut code).expect("read compiled web assets");
    } else {
        code.push_str("(\"index.html\", b\"<!doctype html><title>Emberdeck</title><h1>Emberdeck API is running.</h1><p>Build the interface with npm ci and npm run build, then rebuild the binary.</p>\"),\n");
        println!(
            "cargo:warning=Web assets missing. Run npm ci && npm run build before a release build."
        );
    }
    code.push_str("];\n");
    let destination = Path::new(&env::var("OUT_DIR").expect("Cargo OUT_DIR")).join("assets.rs");
    fs::write(destination, code).expect("write asset index");
}
