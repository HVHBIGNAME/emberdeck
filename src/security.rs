use crate::{
    catalog::{Catalog, PackageRecord, installed},
    error::{Error, Result, require},
    files::Files,
    models::Server,
    store::{Store, now},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Read, Seek},
};

#[derive(Clone, Serialize, Deserialize)]
pub struct Finding {
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub evidence: Vec<String>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Addon {
    pub id: String,
    pub dependencies: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct JarReport {
    pub path: String,
    pub sha256: String,
    pub findings: Vec<Finding>,
    pub addon: Addon,
    pub maven: Vec<(String, String)>,
    pub scanned_entries: usize,
}

const RULES: [(&str, &str, &str, &[&[u8]]); 5] = [
    (
        "review",
        "Process execution",
        "Can launch operating-system processes. This can be legitimate; review the source.",
        &[b"java/lang/ProcessBuilder", b"java/lang/Runtime"],
    ),
    (
        "info",
        "Outbound network access",
        "Contains networking APIs; this alone is not evidence of malicious behavior.",
        &[b"java/net/Socket", b"java/net/URL", b"okhttp3/"],
    ),
    (
        "review",
        "Dynamic code loading",
        "Can load code at runtime, outside this static scan.",
        &[
            b"java/net/URLClassLoader",
            b"defineClass",
            b"javax/script/ScriptEngine",
        ],
    ),
    (
        "high",
        "Credential-path references",
        "References credential locations unrelated to ordinary Minecraft server data.",
        &[
            b".ssh/id_rsa",
            b".aws/credentials",
            b"Local Storage/leveldb",
            b"Login Data",
        ],
    ),
    (
        "review",
        "Native code",
        "Contains native loading APIs. Native binaries are not analyzed by this scanner.",
        &[b"loadLibrary", b"com/sun/jna/"],
    ),
];

pub fn scan_jar<R: Read + Seek>(reader: R, path: &str, hash: &str) -> Result<JarReport> {
    let mut archive = zip::ZipArchive::new(reader).map_err(anyhow::Error::from)?;
    require(archive.len() <= 50_000, "JAR has too many ZIP entries")?;
    let mut expanded = 0_u64;
    let mut signals: BTreeMap<usize, BTreeSet<String>> = BTreeMap::new();
    let mut addon = Addon {
        id: path
            .rsplit('/')
            .next()
            .unwrap_or(path)
            .trim_end_matches(".jar")
            .into(),
        dependencies: Vec::new(),
    };
    let mut maven = BTreeSet::new();
    let mut scanned = 0;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(anyhow::Error::from)?;
        expanded = expanded.saturating_add(entry.size());
        require(
            expanded <= 256 * 1024 * 1024,
            "JAR expanded size exceeds 256 MiB",
        )?;
        require(
            entry.size() <= 16 * 1024 * 1024
                && entry.size()
                    <= entry
                        .compressed_size()
                        .saturating_mul(300)
                        .saturating_add(1024 * 1024),
            "Suspicious ZIP compression or oversized entry",
        )?;
        require(
            entry.enclosed_name().is_some(),
            "JAR contains a path-traversal entry",
        )?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_owned();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        scanned += 1;
        if name.ends_with(".class") {
            for (rule, (_, _, _, patterns)) in RULES.iter().enumerate() {
                if patterns.iter().any(|pattern| {
                    bytes
                        .windows(pattern.len())
                        .any(|window| window == *pattern)
                }) {
                    signals.entry(rule).or_default().insert(name.clone());
                }
            }
        }
        if name.ends_with("pom.properties") && name.starts_with("META-INF/maven/") {
            let text = String::from_utf8_lossy(&bytes);
            let properties: BTreeMap<_, _> = text
                .lines()
                .filter_map(|line| line.split_once('='))
                .collect();
            if let (Some(group), Some(artifact), Some(version)) = (
                properties.get("groupId"),
                properties.get("artifactId"),
                properties.get("version"),
            ) {
                maven.insert((format!("{group}:{artifact}"), version.to_string()));
            }
        }
        if [
            "plugin.yml",
            "paper-plugin.yml",
            "fabric.mod.json",
            "quilt.mod.json",
            "META-INF/mods.toml",
            "META-INF/neoforge.mods.toml",
        ]
        .contains(&name.as_str())
            && let Some(metadata) = addon_metadata(&name, &bytes)
        {
            addon = metadata;
        }
    }
    let findings = signals
        .into_iter()
        .map(|(rule, evidence)| {
            let (severity, title, detail, _) = RULES[rule];
            Finding {
                severity: severity.into(),
                title: title.into(),
                detail: detail.into(),
                evidence: evidence.into_iter().take(5).collect(),
            }
        })
        .collect();
    Ok(JarReport {
        path: path.into(),
        sha256: hash.into(),
        findings,
        addon,
        maven: maven.into_iter().collect(),
        scanned_entries: scanned,
    })
}

fn addon_metadata(name: &str, bytes: &[u8]) -> Option<Addon> {
    if name.ends_with(".yml") {
        let value: Value = serde_yaml_ng::from_slice(bytes).ok()?;
        let dependencies = value["depend"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        return Some(Addon {
            id: value["name"].as_str()?.into(),
            dependencies,
        });
    }
    if name == "fabric.mod.json" {
        let value: Value = serde_json::from_slice(bytes).ok()?;
        return Some(Addon {
            id: value["id"].as_str()?.into(),
            dependencies: value["depends"]
                .as_object()
                .map(|v| v.keys().cloned().collect())
                .unwrap_or_default(),
        });
    }
    if name == "quilt.mod.json" {
        let value: Value = serde_json::from_slice(bytes).ok()?;
        return Some(Addon {
            id: value["quilt_loader"]["id"].as_str()?.into(),
            dependencies: value["quilt_loader"]["depends"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|v| v["id"].as_str().map(String::from))
                .collect(),
        });
    }
    let value: Value = toml::from_str(std::str::from_utf8(bytes).ok()?).ok()?;
    let id = value["mods"].as_array()?.first()?["modId"]
        .as_str()?
        .to_owned();
    let dependencies = value["dependencies"][&id]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|d| d["mandatory"] == true || d["type"] == "required")
        .filter_map(|d| d["modId"].as_str().map(String::from))
        .collect();
    Some(Addon { id, dependencies })
}

pub async fn scan(
    server: &Server,
    files: &Files,
    store: &Store,
    catalog: &Catalog,
    check_osv: bool,
) -> Result<Value> {
    let packages = installed(files, store, server)?;
    let mut reports = Vec::new();
    for package in packages["packages"].as_array().into_iter().flatten() {
        let path = package["path"]
            .as_str()
            .ok_or_else(|| Error::bad("Package is missing its path"))?;
        let file = files.dir.open(path)?;
        let hash = crate::files::file_hash(&file)?;
        let mut report = scan_jar(files.dir.open(path)?, path, &hash)?;
        let key = format!("{}:{}", server.id, path.trim_end_matches(".disabled"));
        if let Some(record) = store.get::<PackageRecord>("package", &key)?
            && record.sha256 != hash
        {
            report.findings.push(Finding {
                severity: "high".into(),
                title: "Integrity changed".into(),
                detail:
                    "This JAR no longer matches the bytes originally installed from its publisher."
                        .into(),
                evidence: vec![record.sha256, hash],
            });
        }
        reports.push(report);
    }
    let mut osv = Value::Null;
    if check_osv {
        let coordinates: BTreeSet<_> = reports
            .iter()
            .flat_map(|r| r.maven.iter().cloned())
            .collect();
        let queries: Vec<_>=coordinates.iter().take(100).map(|(name,version)|json!({"package":{"name":name,"ecosystem":"Maven"},"version":version})).collect();
        if !queries.is_empty() {
            let response = catalog
                .client
                .post("https://api.osv.dev/v1/querybatch")
                .json(&json!({"queries":queries}))
                .send()
                .await?;
            if !response.status().is_success() {
                return Err(Error::Upstream(format!(
                    "OSV returned {}",
                    response.status()
                )));
            }
            let results: Value = serde_json::from_slice(
                &crate::catalog::bounded_bytes(response, 4 * 1024 * 1024).await?,
            )?;
            osv = json!({"coordinates":coordinates.iter().take(100).collect::<Vec<_>>(),"results":results["results"]});
        }
    }
    let report = json!({"at":now(),"jars":reports,"osv":osv,"osv_requested":check_osv,"verdict":"Static review, not an antivirus guarantee","limitations":["Behavior is inferred from bytecode strings; legitimate plugins may trigger findings.","Native binaries, nested JARs and downloaded code are not analyzed.","OSV only checks Maven coordinates present in embedded pom.properties (up to 100)."]});
    store.put("scan", &server.id, &report)?;
    Ok(report)
}

pub fn analyze_logs(log: &str) -> Value {
    let rules = [
        (
            "OutOfMemoryError",
            "Not enough Java heap",
            "Increase the memory limit or reduce view distance. Inspect plugins retaining chunks.",
        ),
        (
            "UnsupportedClassVersionError",
            "Java version mismatch",
            "Choose a Java runtime compatible with the core and installed plugins.",
        ),
        (
            "Address already in use",
            "Port is occupied",
            "Choose an unused game port and restart the container.",
        ),
        (
            "UnknownDependencyException",
            "Missing plugin dependency",
            "Install the declared dependency for the same Minecraft version.",
        ),
        (
            "MixinApplyError",
            "Mod compatibility failure",
            "Check the named mod, exact game version, and loader version.",
        ),
        (
            "NoClassDefFoundError",
            "Missing or incompatible class",
            "Check dependencies and remove plugins built for another core/version.",
        ),
        (
            "Could not load",
            "Package failed to load",
            "Inspect the next Caused by line and the package's dependency list.",
        ),
        (
            "Can't keep up!",
            "Server tick overload",
            "Inspect CPU saturation, entities and view distance; compare before and after plugin changes.",
        ),
    ];
    let findings: Vec<_>=rules.into_iter().filter_map(|(signature,title,advice)|{
        let evidence: Vec<_>=log.lines().filter(|line|line.contains(signature)).take(4).collect();
        if evidence.is_empty() {None} else {Some(json!({"signature":signature,"title":title,"advice":advice,"evidence":evidence}))}
    }).collect();
    json!({"findings":findings,"error_lines":log.lines().filter(|l|l.contains("ERROR")||l.contains("Exception")||l.contains("Caused by")).take(30).collect::<Vec<_>>()})
}

pub fn redact(input: &str) -> String {
    let token =
        regex::Regex::new(r"(?i)(password|api[_-]?key|token|authorization)(\s*[:=]\s*)[^\s,;]+")
            .expect("constant redaction pattern");
    let redacted = token.replace_all(input, "$1$2[redacted]");
    let ember = regex::Regex::new(r"ed_[A-Za-z0-9_-]{40,}").expect("constant token pattern");
    ember.replace_all(&redacted, "[redacted]").into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    #[test]
    fn flags_process_execution_without_claiming_malware() {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("Example.class", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"java/lang/ProcessBuilder").unwrap();
        zip.start_file("plugin.yml", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"name: Example\ndepend: [Vault]\n").unwrap();
        let report = scan_jar(zip.finish().unwrap(), "plugins/example.jar", "hash").unwrap();
        assert_eq!(report.findings[0].severity, "review");
        assert_eq!(report.addon.dependencies, vec!["Vault"]);
    }
    #[test]
    fn redacts_credentials_in_assistant_context() {
        let log = "rcon.password=secret API_KEY: abc token=def public information";
        let output = redact(log);
        assert!(
            !output.contains("secret")
                && !output.contains("abc")
                && output.contains("public information")
        );
    }
}
