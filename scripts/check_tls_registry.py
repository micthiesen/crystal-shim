"""Pinned registry identities outside the deliberately patched Rust wrapper."""

REGISTRY = "registry+https://github.com/rust-lang/crates.io-index"
PACKAGES = {
    "edge-nal": ("0.7.0", "590182a48668fa4988cd97b9b500bcc9a213e9b122b4e0008e934b3916c64031"),
    "edge-nal-tls": ("0.2.0", "e228606ce81ed55ff2d6854f2b418a1838dfbfe3f09f8455f8b9c38b9c92e11a"),
    "mbedtls-rs-sys": ("0.2.0", "d49d6c43db5aae2ef895972de7a9414cafb649fab288933e74bf7739c0fffe55"),
}


def check_registry_identity(package, *, locked):
    name = package["name"]
    version, checksum = PACKAGES[name]
    if package["version"] != version or package.get("source") != REGISTRY:
        raise SystemExit(f"TLS dependency is not the pinned registry package: {name}")
    if locked and package.get("checksum") != checksum:
        raise SystemExit(f"TLS registry checksum changed: {name}")
