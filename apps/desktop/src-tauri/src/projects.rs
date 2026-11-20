use crate::db::Result;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
pub fn permitted(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if name.starts_with('.')
        || name.contains("secret")
        || name.contains("credential")
        || name.contains("token")
        || name.contains("password")
        || name.ends_with(".key")
        || name.ends_with(".pem")
    {
        return false;
    }
    if [
        "appdata",
        "windows",
        "programdata",
        "system volume information",
        "$recycle.bin",
        "node_modules",
        "target",
        "dist",
        "build",
        "vendor",
        "venv",
        "__pycache__",
    ]
    .contains(&name.as_str())
    {
        return false;
    }
    path.is_dir()
        || [
            "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "go", "html", "css", "scss", "md",
            "json", "toml", "yaml", "yml", "sql", "txt", "cs", "c", "cpp", "h",
        ]
        .contains(
            &path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase()
                .as_str(),
        )
}
pub fn copy_destination(root: &Path, relative: &str) -> Result<PathBuf> {
    let path = PathBuf::from(relative);
    if relative.len() > 600
        || relative.contains(['\0', ':'])
        || path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Use a relative destination inside the authorized project".into());
    }
    let root = approved_root(root)?;
    let parent = root
        .join(path.parent().unwrap_or(Path::new("")))
        .canonicalize()
        .map_err(|_| "Destination folder must already exist")?;
    if !parent.starts_with(&root) {
        return Err("Destination escapes authorized project".into());
    }
    let mut current = root.clone();
    for component in path.components() {
        current.push(component);
        if !permitted(&current)
            || fs::symlink_metadata(&current).is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err("Sensitive, generated or linked destination is excluded".into());
        }
    }
    let destination = parent.join(path.file_name().ok_or("Destination file name required")?);
    if destination.exists() {
        return Err("Destination already exists; copying never overwrites files".into());
    }
    Ok(destination)
}
pub fn copy_new(
    root: &Path,
    source: &str,
    destination: &str,
    expected_hash: &str,
) -> Result<Value> {
    use std::io::Write;
    let content = read(root, source)?;
    if content_hash(&content) != expected_hash {
        return Err("Source changed; prepare a new copy request".into());
    }
    let target = copy_destination(root, destination)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|_| "Could not create a new destination; no existing file was overwritten")?;
    file.write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "Copy failed; a partial new destination may remain")?;
    drop(file);
    let saved = read(root, destination)?;
    if content_hash(&saved) != expected_hash {
        return Err("Destination verification failed; inspect the new file".into());
    }
    Ok(json!({"verified":true,"bytes":content.len(),"path":destination}))
}
fn walk(root: &Path, path: &Path, files: &mut Vec<String>, budget: &mut usize, depth: usize) {
    if depth > 14 || *budget == 0 || files.len() >= 1500 {
        return;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let path = entry.path();
        if path.canonicalize().is_ok_and(|p| !p.starts_with(root)) {
            continue;
        }
        if entry.file_type().is_ok_and(|t| t.is_symlink()) || !permitted(&path) {
            continue;
        }
        if path.is_dir() {
            walk(root, &path, files, budget, depth + 1);
        } else if entry.metadata().is_ok_and(|m| m.len() <= 256000) {
            if let Ok(relative) = path.strip_prefix(root) {
                files.push(relative.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}
pub fn approved_root(path: &Path) -> Result<PathBuf> {
    let root = path
        .canonicalize()
        .map_err(|_| "Authorized folder unavailable")?;
    if root.ancestors().any(|p| {
        let name = p
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        [
            "appdata",
            "windows",
            "programdata",
            ".ssh",
            ".aws",
            ".codex",
            ".gnupg",
        ]
        .contains(&name.as_str())
            || ["credential", "secret", "token", "password"]
                .iter()
                .any(|t| name.contains(t))
    }) {
        return Err("Sensitive or system roots are excluded".into());
    }
    Ok(root)
}
pub fn inspect(id: &str, root: &Path) -> Result<Value> {
    let root = root
        .canonicalize()
        .map_err(|_| "Authorized folder is unavailable")?;
    approved_root(&root)?;
    let mut files = Vec::new();
    walk(&root, &root, &mut files, &mut 12000, 0);
    files.sort();
    let git = |args: &[&str]| -> String {
        let mut command = Command::new("git.exe");
        command
            .arg("--no-optional-locks")
            .args([
                "-c",
                "core.fsmonitor=false",
                "-c",
                "core.untrackedCache=false",
            ])
            .args(args)
            .current_dir(&root);
        crate::windows::run(&mut command, Duration::from_secs(8)).unwrap_or_else(|_| {
            "Git information unavailable (missing Git, untrusted ownership, or no repository)."
                .into()
        })
    };
    Ok(
        json!({"id":id,"name":root.file_name().unwrap_or_default().to_string_lossy(),"files":files,"branch":git(&["rev-parse","--abbrev-ref","HEAD"]),"changes":git(&["status","--short","--untracked-files=normal"]),"commits":git(&["log","-5","--format=%h %s"])}),
    )
}
pub fn read(root: &Path, relative: &str) -> Result<String> {
    if relative.len() > 600 || relative.contains('\0') {
        return Err("Invalid source path".into());
    }
    let path = PathBuf::from(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Use a relative source file path".into());
    }
    let root = root
        .canonicalize()
        .map_err(|_| "Authorized folder unavailable")?;
    approved_root(&root)?;
    approved_root(&root)?;
    let target = root
        .join(&path)
        .canonicalize()
        .map_err(|_| "Source file unavailable")?;
    if !target.starts_with(&root) || !target.is_file() {
        return Err("Path escapes authorized project".into());
    }
    let mut current = root.clone();
    for component in path.components() {
        current.push(component);
        if !permitted(&current)
            || fs::symlink_metadata(&current).is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err("Sensitive, generated, or linked paths are excluded".into());
        }
    }
    if fs::metadata(&target)
        .map_err(|_| "Cannot read source file")?
        .len()
        > 256000
    {
        return Err("File exceeds 256 KB limit".into());
    }
    fs::read_to_string(target).map_err(|_| "Not a supported UTF-8 source file".into())
}
pub fn search(root: &Path, query: &str) -> Result<Value> {
    let query = query.trim();
    if query.chars().count() < 2 || query.len() > 200 {
        return Err("Search text must contain 2–200 characters".into());
    }
    let root = root
        .canonicalize()
        .map_err(|_| "Authorized folder unavailable")?;
    approved_root(&root)?;
    let mut files = Vec::new();
    walk(&root, &root, &mut files, &mut 12000, 0);
    let needle = query.to_lowercase();
    let mut matches = Vec::new();
    let mut read_bytes = 0usize;
    for file in files {
        if read_bytes > 16 * 1024 * 1024 || matches.len() >= 100 {
            break;
        }
        if let Ok(text) = read(&root, &file) {
            read_bytes += text.len();
            for (index, line) in text.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    matches.push(json!({"path":file,"line":index+1,"text":line.chars().take(220).collect::<String>()}));
                    if matches.len() >= 100 {
                        break;
                    }
                }
            }
        }
    }
    Ok(json!(matches))
}
pub fn content_hash(text: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
/// Existing UTF-8 files only. A Windows exclusive handle prevents competing writers.
/// A durable DPAPI backup is written before touching the target; failures restore the bytes.
pub fn write_reviewed(
    root: &Path,
    relative: &str,
    expected: &str,
    content: &str,
    backups: &Path,
) -> Result<Value> {
    use std::io::{Read, Seek, SeekFrom, Write};
    use std::os::windows::fs::OpenOptionsExt;
    if content.len() > 24_000 {
        return Err("Replacement exceeds review limit".into());
    }
    let old = read(root, relative)?;
    if content_hash(&old) != expected {
        return Err("File changed; reload and review a fresh diff".into());
    }
    let root = root
        .canonicalize()
        .map_err(|_| "Authorized root unavailable")?;
    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "File unavailable")?;
    if !target.starts_with(&root) {
        return Err("Path escapes authorized folder".into());
    }
    let mut file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(0)
        .open(&target)
        .map_err(|_| "File is locked or read-only; no change applied")?;
    let mut current = String::new();
    std::io::Read::by_ref(&mut file)
        .take(256_001)
        .read_to_string(&mut current)
        .map_err(|_| "Cannot read locked UTF-8 file")?;
    if content_hash(&current) != expected {
        return Err("File changed while acquiring its lock".into());
    }
    fs::create_dir_all(backups).map_err(|_| "Cannot create recovery folder")?;
    if fs::read_dir(backups)
        .map_err(|_| "Recovery folder unavailable")?
        .count()
        >= 100
    {
        return Err("100 edit backups retained; review them before more edits".into());
    }
    let backup_id = uuid::Uuid::new_v4().to_string();
    let encrypted = crate::windows::protect(current.as_bytes())?;
    let mut backup = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(backups.join(format!("{backup_id}.jedit")))
        .map_err(|_| "Cannot create recovery backup")?;
    backup
        .write_all(&encrypted)
        .and_then(|_| backup.sync_all())
        .map_err(|_| "Cannot persist recovery backup; original unchanged")?;
    let result = (|| -> std::io::Result<()> {
        file.seek(SeekFrom::Start(0))?;
        file.write_all(content.as_bytes())?;
        file.set_len(content.len() as u64)?;
        file.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let restored = file
            .seek(SeekFrom::Start(0))
            .and_then(|_| file.write_all(current.as_bytes()))
            .and_then(|_| file.set_len(current.len() as u64))
            .and_then(|_| file.sync_all());
        return Err(if restored.is_ok() {
            "Write failed; original restored"
        } else {
            "Write interrupted; encrypted recovery backup retained"
        }
        .into());
    }
    Ok(json!({"backupId":backup_id,"hash":content_hash(content)}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_are_create_only_verified_and_conflict_checked() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&root).unwrap();
        fs::write(root.join("source.ts"), "export const value=1;\n").unwrap();
        let original = read(&root, "source.ts").unwrap();
        let hash = content_hash(&original);
        assert!(
            copy_new(&root, "source.ts", "copy.ts", &hash).unwrap()["verified"]
                .as_bool()
                .unwrap()
        );
        assert_eq!(read(&root, "copy.ts").unwrap(), original);
        assert!(copy_new(&root, "source.ts", "copy.ts", &hash).is_err());
        assert!(copy_new(&root, "source.ts", "../outside.ts", &hash).is_err());
        assert!(copy_new(&root, "source.ts", "secret.ts", &hash).is_err());
        assert!(copy_new(&root, "source.ts", "copy.txt:stream.ts", &hash).is_err());
        fs::write(root.join("source.ts"), "changed").unwrap();
        assert!(copy_new(&root, "source.ts", "other.ts", &hash).is_err());
        assert!(!root.join("other.ts").exists());
        fs::remove_file(root.join("source.ts")).unwrap();
        fs::remove_file(root.join("copy.ts")).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn reviewed_edits_detect_conflicts_and_preserve_recovery_bytes() {
        let root = std::env::temp_dir().join(format!("jarvis-edit-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("sample.rs");
        fs::write(&path, "original").unwrap();
        let backups = root.join("recovery");
        assert!(write_reviewed(
            &root,
            "sample.rs",
            &content_hash("stale"),
            "changed",
            &backups
        )
        .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        assert!(write_reviewed(
            &root,
            "../sample.rs",
            &content_hash("original"),
            "changed",
            &backups
        )
        .is_err());
        let result = write_reviewed(
            &root,
            "sample.rs",
            &content_hash("original"),
            "changed",
            &backups,
        )
        .unwrap();
        let bytes =
            fs::read(backups.join(format!("{}.jedit", result["backupId"].as_str().unwrap())))
                .unwrap();
        assert_eq!(crate::windows::unprotect(&bytes).unwrap(), b"original");
        assert_eq!(fs::read_to_string(&path).unwrap(), "changed");
        let held = fs::OpenOptions::new().read(true).open(&path).unwrap();
        assert!(write_reviewed(
            &root,
            "sample.rs",
            &content_hash("changed"),
            "again",
            &backups
        )
        .is_err());
        drop(held);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn blocks_traversal_and_sensitive_files() {
        let root = std::env::temp_dir().join(format!("jarvis-project-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("safe.ts"), "export const n=1").unwrap();
        fs::write(root.join("secrets.json"), "{}").unwrap();
        assert!(read(&root, "../other.ts").is_err());
        assert!(read(&root, "secrets.json").is_err());
        assert_eq!(read(&root, "safe.ts").unwrap(), "export const n=1");
        assert_eq!(
            search(&root, "export").unwrap().as_array().unwrap().len(),
            1
        );
        assert!(search(&root, "e").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
