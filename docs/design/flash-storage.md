# Flash storage and output exclusion

Implemented in `firmware/app/src/storage.rs`, `firmware/app/src/flash_gate.rs`
and the independently testable `firmware/core/src/flash_gate.rs`. It loads saved
configuration, repairs retained safety records at boot and services the
[runtime coordinator](runtime-transactions.md)'s ticketed configuration and retained
writes. The same store implements the actual Matter `KvBlobStore` load/store/remove
interface. Application transactions use its shared SDK access; see the
[Matter integration contract](matter-integration.md). Authenticated network settings,
radio ownership and factory reset remain integration work.

## Ownership and timing

The Priority3 control task starts before the flash driver is constructed. Thread
mode requests a unique ticket, which immediately inhibits relay eligibility.
Control reads the ticket, writes the relay GPIO low, publishes status, feeds its
watchdog and acknowledges that exact ticket. Only then may the requesting owner
access flash. A stale acknowledgement or release cannot authorize another request.
The permit remains alive over a complete sequential-storage operation, including
repair and garbage collection. Its destructor releases the matching ticket on
normal return or error. Counter exhaustion permanently inhibits the output.

Before every 256-byte read, at-most-256-byte page-contained write, or one-sector
4 KiB erase, the owner replaces its ticket without lifting the inhibit and waits
for another complete control iteration. This prevents a long series of flash calls
from starving the only watchdog feeder. The pinned `esp-storage` has its
`critical-section` feature enabled, because cache-disabled ROM calls cannot safely
execute the flash-backed interrupt/task code. The wrapper never uses its 64 KiB
block erase path. Whole ranges are checked before partial writes or erases.

The control task still runs every 20 ms while the CPU can service interrupts.
TIMG1's system-reset timeout is now 1,500 ms. Each gated sector erase has a published
C6 planning maximum of 500 ms, while a 256-byte program has a 5 ms planning maximum.
The output is already commanded low throughout those masked intervals. A stalled
flash call or control loop receives no watchdog service from storage. Actual WROOM
flash identification, timing and relay-pin observations remain CTL-12 commissioning
work; the planning numbers are not measured results. See the
[Espressif timing table](https://documentation.espressif.com/esp32-c6_datasheet_en.html)
and [cache-concurrency guidance](https://docs.espressif.com/projects/esp-idf/en/v5.1.2/esp32c6/api-reference/peripherals/spi_flash/spi_flash_concurrency.html).

The synchronous gate waits at most 100 ms for each acknowledgement, with interrupts
enabled. It requires both HAL thread run level and the CPU's `mstatus.MIE` bit.
C6 critical sections clear that bit without changing the run-level threshold, so
testing run level alone would allow an unserviceable wait. Flash callers must not hold a lock
that masks interrupts or invoke it from an interrupt executor. The actual pinned
`rs-matter 0.2.0` KV trait is synchronous. Its default mutex is `NoopRawMutex`;
enabling `sync-mutex` on bare metal changes it to `CriticalSectionRawMutex` and is
incompatible with waiting for control from inside KV access. The implemented adapter
preserves the single thread-mode owner. `scripts/check_matter_features.py` rejects
that resolved feature and mismatched rs-matter versions across both workspaces.

The store directly uses the same `sequential-storage 3.0.1` map operations as
Stillair's pinned `SeqMapKvBlobStore`, with a fresh borrowed gated driver for each
operation. It deliberately has no raw-byte debug/trace output. The upstream
`SeqMapKvBlobStore` trace path dumps values, including credentials; it must not be
introduced when adding Matter logging. No second raw flash handle may bypass this
owner.

## Region and records

The bootloader library reads and MD5-validates the actual partition table, using
a 3,072-byte slice of the shared scratch buffer. Selection scans raw type/subtype
tags: the upstream typed decoder can panic on legal custom entries before NVS.
The first
NVS partition must be writable, unencrypted, sector-aligned, at least three sectors,
within physical flash capacity and non-overlapping with every other table entry.
The app does not invent an NVS offset or erase storage on a parse error. Its scratch
buffer is 4,096 bytes. Missing/invalid storage leaves configuration unpublished and
the output off, with a credential-free USB error classification.

| Key | Content |
| --- | --- |
| `0x4346` | Canonical `CSCF` device configuration, format 1, at most 2,048 bytes |
| `0x4353` | Canonical `CSRT` retained safety state, format 1, 32 bytes |

Both keys are in rs-matter's vendor range, above `0x1000`. Configuration decoding
validates CRC, canonical representation and all cross-field rules. The retained
loader compares its nonzero revision with the configuration revision. Missing,
corrupt or mismatched retained state produces maintenance recovery; a previously
eligible window becomes suppressed. Required replacement records are stored before
publishing boot settings. A reset during repair repeats the same safe policy.

No configuration plus no retained record is an uncommissioned first boot. A retained
record without configuration is inconsistent storage. A malformed configuration is
an error, not a request to install defaults. Calibration is optional in a valid
configuration; its absence still produces invalid readings and keeps the relay off.
The sensor receives the boot calibration, and control restores saved maintenance
before its first configured output decision. Runtime configuration replacement
first stores the new revision's maintenance record, then its configuration. Only
both exact acknowledgements publish the new revision to control and sensor. Old
sensor frames retain their previous revision and cannot enable output. The output
stays in maintenance until an explicit durable exit; a reset between the two writes
recovers through the revision-mismatch policy above.

## Evidence and remaining work

Host tests exercise ticket freshness, cancellation/release races, busy ownership,
chunk renewal and counter exhaustion. Configuration and retained-record tests cover
malformed records and revision/reset recovery. `firmware/partition-tests` compiles the actual selection function against
the same pinned parser's host backend and checks custom/unknown tags, scratch sizing,
MD5 corruption, protected regions, flags, alignment, overflow and overlapping regions.
It cannot write or erase the fake storage. There are three regression tests.
Two Matter storage tests compile the actual app store against deterministic NOR
and permit adapters, exercising shared keys, removal, garbage collection, bounded
access and error release. Fake permits cannot prove actual interrupt or GPIO timing.
The adapter passes target
checks; no physical flash, power-cut, page-erase or output timing test has run.
The complete commissioning matrix remains authoritative for those results.
