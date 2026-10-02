use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub family: String,
    pub description: String,
    pub docker_type: String,
    pub loaders: Vec<String>,
    pub experimental: bool,
}

pub fn all() -> Vec<Template> {
    [
        (
            "paper",
            "Paper",
            "plugins",
            "Fast, familiar, and built for your community.",
            "PAPER",
            vec!["paper", "spigot", "bukkit"],
            false,
        ),
        (
            "purpur",
            "Purpur",
            "plugins",
            "Paper performance with more ways to make it yours.",
            "PURPUR",
            vec!["purpur", "paper", "spigot", "bukkit"],
            false,
        ),
        (
            "folia",
            "Folia",
            "plugins",
            "Region-threaded worlds. Requires Folia-compatible plugins.",
            "FOLIA",
            vec!["folia"],
            false,
        ),
        (
            "vanilla",
            "Vanilla",
            "vanilla",
            "Minecraft, just as it comes.",
            "VANILLA",
            vec![],
            false,
        ),
        (
            "fabric",
            "Fabric",
            "mods",
            "Lightweight modding for ambitious worlds.",
            "FABRIC",
            vec!["fabric"],
            false,
        ),
        (
            "forge",
            "Forge",
            "mods",
            "The classic home for large modpacks.",
            "FORGE",
            vec!["forge"],
            false,
        ),
        (
            "neoforge",
            "NeoForge",
            "mods",
            "A modern foundation for the next generation of mods.",
            "NEOFORGE",
            vec!["neoforge"],
            false,
        ),
        (
            "quilt",
            "Quilt",
            "mods",
            "Community-driven, open modding.",
            "QUILT",
            vec!["quilt", "fabric"],
            false,
        ),
        (
            "arclight",
            "Arclight",
            "hybrid",
            "Forge mods and Bukkit plugins in one world. Experimental compatibility.",
            "ARCLIGHT",
            vec!["forge", "bukkit", "spigot"],
            true,
        ),
    ]
    .into_iter()
    .map(
        |(id, name, family, description, docker_type, loaders, experimental)| Template {
            id: id.into(),
            name: name.into(),
            family: family.into(),
            description: description.into(),
            docker_type: docker_type.into(),
            loaders: loaders.into_iter().map(String::from).collect(),
            experimental,
        },
    )
    .collect()
}

pub fn get(id: &str) -> Result<Template> {
    all()
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| Error::bad("Unknown server blueprint"))
}

pub fn package_loaders(template: &Template, kind: &str) -> Result<Vec<String>> {
    match kind {
        "plugin" if matches!(template.family.as_str(), "plugins" | "hybrid") => Ok(template
            .loaders
            .iter()
            .filter(|l| !["forge", "fabric", "neoforge", "quilt"].contains(&l.as_str()))
            .cloned()
            .collect()),
        "mod" | "modpack" if matches!(template.family.as_str(), "mods" | "hybrid") => Ok(template
            .loaders
            .iter()
            .filter(|l| ["forge", "fabric", "neoforge", "quilt"].contains(&l.as_str()))
            .cloned()
            .collect()),
        _ => Err(Error::bad(
            "This package type is incompatible with the server blueprint",
        )),
    }
}
