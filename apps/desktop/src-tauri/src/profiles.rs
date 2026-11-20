//! QA launch flags must never silently fall back to personal data.
use crate::db::Result;
use std::path::{Path, PathBuf};
pub fn qa_directory(
    enabled: bool,
    requested: Option<PathBuf>,
    root: &Path,
) -> Result<Option<PathBuf>> {
    if !enabled && requested.is_none() {
        return Ok(None);
    }
    if !enabled {
        return Err("QA data directory requires explicit test-profile mode".into());
    }
    let requested = requested.ok_or(
        "QA profile mode requires an isolated test directory; personal data will not be opened",
    )?;
    let root = root.canonicalize().map_err(|_| "QA root unavailable")?;
    let directory = requested
        .canonicalize()
        .map_err(|_| "QA directory must already exist")?;
    if directory.parent() != Some(root.as_path())
        || directory
            .file_name()
            .and_then(|s| s.to_str())
            .and_then(|s| {
                uuid::Uuid::parse_str(
                    s.strip_prefix("overview-")
                        .or_else(|| s.strip_prefix("benchmark-"))
                        .unwrap_or(s),
                )
                .ok()
            })
            .is_none()
    {
        return Err(
            "QA directory must be a UUID profile directly inside the repository QA root".into(),
        );
    }
    Ok(Some(directory))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qa_never_falls_back_to_personal_data() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&root).unwrap();
        let qa = root.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&qa).unwrap();
        assert!(qa_directory(false, None, &root).unwrap().is_none());
        assert!(qa_directory(true, None, &root).is_err());
        assert!(qa_directory(false, Some(qa.clone()), &root).is_err());
        assert_eq!(
            qa_directory(true, Some(qa.clone()), &root).unwrap(),
            Some(qa.canonicalize().unwrap())
        );
        assert!(qa_directory(true, Some(root.clone()), &root).is_err());
        std::fs::remove_dir(&qa).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
