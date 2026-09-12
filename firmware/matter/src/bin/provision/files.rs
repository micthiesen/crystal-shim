//! Private, bounded filesystem artifacts. No record/key contents in errors.
use p256::elliptic_curve::zeroize::Zeroize;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

pub type Result<T> = std::result::Result<T, &'static str>;
pub struct Bytes(pub Vec<u8>);
impl Drop for Bytes {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}
pub fn read(path: &Path, private: bool, maximum: usize) -> Result<Bytes> {
    let before = fs::symlink_metadata(path).map_err(|_| "cannot inspect input file")?;
    // Reject pipes/devices before open: opening a FIFO can otherwise wait for a
    // writer forever, before the descriptor's regular-file check can run.
    if !before.is_file() || before.len() > maximum as u64 {
        return Err("input must be a bounded regular file, not a symlink");
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC)
        .open(path)
        .map_err(|_| "cannot open input file")?;
    let metadata = file
        .metadata()
        .map_err(|_| "cannot inspect opened input file")?;
    if !metadata.is_file()
        || metadata.len() > maximum as u64
        || metadata.dev() != before.dev()
        || metadata.ino() != before.ino()
    {
        return Err("input must be a bounded regular file, not a symlink");
    }
    if private && metadata.permissions().mode() & 0o077 != 0 {
        return Err("private input must have no group/other permissions (use chmod 600)");
    }
    let mut bytes = Bytes(Vec::with_capacity(maximum + 1));
    file.take(maximum as u64 + 1)
        .read_to_end(&mut bytes.0)
        .map_err(|_| "cannot read input file")?;
    if bytes.0.len() > maximum {
        return Err("input exceeds size limit");
    }
    Ok(bytes)
}

pub struct Directory(pub PathBuf);
impl Directory {
    pub fn create(path: &Path) -> Result<Self> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let parent = parent
            .canonicalize()
            .map_err(|_| "output parent must already exist")?;
        // Keep key-bearing output outside every working tree, including this one.
        if parent.ancestors().any(|dir| dir.join(".git").exists()) {
            return Err("private output must be outside a git working tree");
        }
        let name = path
            .file_name()
            .ok_or("output needs a new directory name")?;
        let path = parent.join(name);
        DirBuilder::new()
            .mode(0o700)
            .create(&path)
            .map_err(|_| "output directory must be new and writable")?;
        Ok(Self(path))
    }
    pub fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    pub fn write(&self, name: &str, bytes: &[u8]) -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(self.path(name))
            .map_err(|_| "cannot create a private output file without overwriting")?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "cannot finish private output file")
    }
    pub fn sync(&self) -> Result<()> {
        File::open(&self.0)
            .and_then(|file| file.sync_all())
            .map_err(|_| "cannot sync output directory")
    }
    pub fn publish_record(&self, bytes: &[u8]) -> Result<()> {
        // Never expose a partially written final record, even after interruption.
        self.write("record.pending", bytes)?;
        fs::hard_link(self.path("record.pending"), self.path("record.bin"))
            .map_err(|_| "cannot publish completed record without overwriting")?;
        self.sync()?;
        fs::remove_file(self.path("record.pending"))
            .map_err(|_| "cannot remove completed record staging file")?;
        self.sync()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interrupted_staging_never_publishes_and_completed_records_never_overwrite() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "crystal-shim-record-publish-{}-{nonce}",
            std::process::id()
        ));
        let directory = Directory::create(&path).unwrap();
        directory.write("record.pending", b"interrupted").unwrap();
        assert!(directory.publish_record(b"complete").is_err());
        assert!(!directory.path("record.bin").exists());
        fs::remove_file(directory.path("record.pending")).unwrap();
        directory.publish_record(b"complete").unwrap();
        assert_eq!(fs::read(directory.path("record.bin")).unwrap(), b"complete");
        assert!(!directory.path("record.pending").exists());
        assert!(directory.publish_record(b"replacement").is_err());
        assert_eq!(fs::read(directory.path("record.bin")).unwrap(), b"complete");
        fs::remove_dir_all(path).unwrap();
    }
}
