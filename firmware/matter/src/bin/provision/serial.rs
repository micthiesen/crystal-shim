//! Unix host transport. Only explicit open; no discovery, modem-line ioctls or reset.
use super::{files::Result, sender::Stream};
use p256::elliptic_curve::zeroize::Zeroize;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{FileTypeExt, MetadataExt, OpenOptionsExt},
    },
    path::Path,
    time::Instant,
};

pub struct Serial {
    file: File,
    original: libc::termios,
    epoch: Instant,
    input: [u8; 512],
    used: usize,
    next: usize,
}
impl Serial {
    /// Call only AFTER offline record verification and nonce generation succeed.
    pub fn open(path: &Path) -> Result<Self> {
        if !path.is_absolute() {
            return Err("--serial requires an explicit absolute device path");
        }
        let before =
            fs::symlink_metadata(path).map_err(|_| "cannot inspect explicit serial device")?;
        if !before.file_type().is_char_device() {
            return Err("serial path must be a character device, not a symlink or file");
        }
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .custom_flags(libc::O_NOCTTY | libc::O_NONBLOCK | libc::O_CLOEXEC | libc::O_NOFOLLOW)
            .open(path)
            .map_err(|_| "cannot open explicit serial device")?;
        let after = file
            .metadata()
            .map_err(|_| "cannot inspect opened serial device")?;
        if !after.file_type().is_char_device()
            || before.dev() != after.dev()
            || before.ino() != after.ino()
        {
            return Err("serial device changed during open");
        }
        let fd = file.as_raw_fd();
        // SAFETY: fd is live; zeroed termios is filled by tcgetattr before use.
        let mut original: libc::termios = unsafe { std::mem::zeroed() };
        if unsafe { libc::tcgetattr(fd, &mut original) } != 0 {
            return Err("serial device is not a supported terminal");
        }
        // Kernel exclusivity plus an advisory lock rejects cooperating senders;
        // an already-open terminal must still be closed by the operator.
        if unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) } != 0
            || unsafe { libc::ioctl(fd, libc::TIOCEXCL as _) } != 0
        {
            return Err("cannot claim exclusive serial access; close other terminal programs");
        }
        let mut raw = original;
        unsafe {
            libc::cfmakeraw(&mut raw);
        }
        raw.c_cflag |= libc::CLOCAL | libc::CREAD;
        raw.c_cflag &= !(libc::HUPCL | libc::CRTSCTS | libc::CSTOPB);
        raw.c_iflag &= !(libc::IXON | libc::IXOFF | libc::IXANY);
        raw.c_cc[libc::VMIN] = 0;
        raw.c_cc[libc::VTIME] = 0;
        if unsafe { libc::cfsetispeed(&mut raw, libc::B115200) } != 0
            || unsafe { libc::cfsetospeed(&mut raw, libc::B115200) } != 0
            || unsafe { libc::tcsetattr(fd, libc::TCSANOW, &raw) } != 0
        {
            return Err("cannot configure raw no-echo serial mode");
        }
        let port = Self {
            file,
            original,
            epoch: Instant::now(),
            input: [0; 512],
            used: 0,
            next: 0,
        };
        // POSIX permits a driver to apply only part of a requested termios
        // change. Read back security-relevant flags before sending any bytes.
        let mut applied = raw;
        if unsafe { libc::tcgetattr(fd, &mut applied) } != 0
            || applied.c_lflag & (libc::ECHO | libc::ECHONL | libc::ICANON | libc::ISIG) != 0
            || applied.c_iflag & (libc::IXON | libc::IXOFF | libc::IXANY) != 0
            || applied.c_cflag & (libc::HUPCL | libc::CRTSCTS | libc::CSTOPB | libc::PARENB) != 0
            || applied.c_cflag & libc::CSIZE != libc::CS8
            || applied.c_cflag & (libc::CREAD | libc::CLOCAL) != libc::CREAD | libc::CLOCAL
        {
            return Err("serial driver did not retain raw no-echo 8N1 settings");
        }
        Ok(port)
    }
    fn ready(&self, events: libc::c_short, deadline: u64) -> std::result::Result<bool, ()> {
        loop {
            let now = self.now_ms();
            if now >= deadline {
                return Ok(false);
            }
            let timeout = (deadline - now).min(i32::MAX as u64) as i32;
            let mut descriptor = libc::pollfd {
                fd: self.file.as_raw_fd(),
                events,
                revents: 0,
            };
            // SAFETY: pointer names one initialized pollfd and stays live.
            let count = unsafe { libc::poll(&mut descriptor, 1, timeout) };
            if count < 0 {
                if std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
                    continue;
                }
                return Err(());
            }
            if count == 0 {
                continue;
            }
            // Drain final readable bytes even with HUP, allowing the writer's
            // final reboot acknowledgement to be consumed before disconnect.
            if descriptor.revents & events != 0 {
                return Ok(true);
            }
            if descriptor.revents & (libc::POLLHUP | libc::POLLERR | libc::POLLNVAL) != 0 {
                return Err(());
            }
        }
    }
}
impl Stream for Serial {
    fn now_ms(&self) -> u64 {
        self.epoch.elapsed().as_millis().min(u64::MAX as u128) as u64
    }
    fn write(&mut self, mut bytes: &[u8], deadline_ms: u64) -> std::result::Result<(), ()> {
        while !bytes.is_empty() {
            if !self.ready(libc::POLLOUT, deadline_ms)? {
                return Err(());
            }
            match self.file.write(bytes) {
                Ok(0) => return Err(()),
                Ok(count) => bytes = &bytes[count..],
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock
                    ) =>
                {
                    continue;
                }
                Err(_) => return Err(()),
            }
        }
        // No blocking tcdrain: the reply proves delivery, and poll bounds writes.
        Ok(())
    }
    fn read(&mut self, deadline_ms: u64) -> std::result::Result<Option<u8>, ()> {
        loop {
            if self.now_ms() >= deadline_ms {
                return Ok(None);
            }
            if self.next < self.used {
                let byte = self.input[self.next];
                self.input[self.next] = 0;
                self.next += 1;
                return Ok(Some(byte));
            }
            if !self.ready(libc::POLLIN, deadline_ms)? {
                return Ok(None);
            }
            match self.file.read(&mut self.input) {
                Ok(0) => return Err(()),
                Ok(count) => {
                    self.used = count;
                    self.next = 0;
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock
                    ) =>
                {
                    continue;
                }
                Err(_) => return Err(()),
            }
        }
    }
}
impl Drop for Serial {
    fn drop(&mut self) {
        self.input.zeroize();
        // Restore line processing, but never restore HUPCL: that could toggle a
        // modem line when closing. We never request DTR/RTS changes or a break.
        self.original.c_cflag &= !libc::HUPCL;
        unsafe {
            libc::tcsetattr(self.file.as_raw_fd(), libc::TCSANOW, &self.original);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::fd::FromRawFd;

    #[test]
    fn pseudo_terminal_is_raw_no_echo_bounded_and_does_not_request_hangup() {
        let mut master = -1;
        let mut slave = -1;
        let mut name = [0 as libc::c_char; 256];
        // Test-only pseudo terminals; no enumerated or real serial devices.
        assert_eq!(
            unsafe {
                libc::openpty(
                    &mut master,
                    &mut slave,
                    name.as_mut_ptr(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            },
            0
        );
        let mut master = unsafe { File::from_raw_fd(master) };
        let slave = unsafe { File::from_raw_fd(slave) };
        let path = unsafe { std::ffi::CStr::from_ptr(name.as_ptr()) }
            .to_str()
            .unwrap();
        let mut before: libc::termios = unsafe { std::mem::zeroed() };
        assert_eq!(
            unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut before) },
            0
        );
        before.c_iflag |= libc::IXOFF | libc::IXANY;
        before.c_cflag |= libc::CSTOPB | libc::HUPCL;
        assert_eq!(
            unsafe { libc::tcsetattr(slave.as_raw_fd(), libc::TCSANOW, &before) },
            0
        );
        let mut port = Serial::open(Path::new(path)).unwrap();
        let mut attributes = port.original;
        assert_eq!(
            unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut attributes) },
            0
        );
        assert_eq!(
            attributes.c_lflag & (libc::ECHO | libc::ECHONL | libc::ICANON),
            0
        );
        assert_eq!(
            attributes.c_cflag & (libc::HUPCL | libc::CRTSCTS | libc::CSTOPB),
            0
        );
        assert_eq!(
            attributes.c_iflag & (libc::IXON | libc::IXOFF | libc::IXANY),
            0
        );
        master.write_all(b"frag").unwrap();
        for byte in b"frag" {
            assert_eq!(port.read(port.now_ms() + 100).unwrap(), Some(*byte));
        }
        let mut descriptor = libc::pollfd {
            fd: master.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        assert_eq!(
            unsafe { libc::poll(&mut descriptor, 1, 20) },
            0,
            "input must not echo to sender"
        );
        assert_eq!(port.read(port.now_ms() + 20), Ok(None));
        port.write(b"out\n", port.now_ms() + 100).unwrap();
        let mut output = [0; 4];
        master.read_exact(&mut output).unwrap();
        assert_eq!(&output, b"out\n");
        drop(port);
        assert_eq!(
            unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut attributes) },
            0
        );
        assert_eq!(attributes.c_cflag & libc::HUPCL, 0);
    }
}
