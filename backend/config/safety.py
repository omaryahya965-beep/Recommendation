"""Guards shared by the test runner and the local E2E backend settings.

Kept free of Django imports so a settings module can use it while settings are
still being loaded.
"""
from __future__ import annotations

import ipaddress
import socket

# Hosts an automated run may use for its database. Anything else is treated
# as a shared or production server.
SAFE_DB_HOSTS = {"", "localhost", "127.0.0.1", "::1", "postgres", "db"}

CLOUDINARY_ENV = (
    "CLOUDINARY_URL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
)


class UnsafeTestConfiguration(RuntimeError):
    """Raised when an automated run could reach a non-local system."""


class OutboundNetworkBlocked(ConnectionError):
    """Raised when guarded code opens a non-loopback connection."""


def assert_local_databases(databases) -> None:
    for alias, config in databases.items():
        host = str(config.get("HOST") or "").strip().lower()
        if host in SAFE_DB_HOSTS:
            continue
        raise UnsafeTestConfiguration(
            f"Refusing to run: database '{alias}' points to host '{host}'. "
            "Automated tests and the E2E backend may only use a local or CI "
            "database (see backend/scripts/start_test_db.ps1)."
        )


def _is_loopback(host) -> bool:
    if host is None:
        return False
    if isinstance(host, bytes):
        host = host.decode(errors="ignore")
    host = str(host).strip().lower()
    if host in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(host.split("%", 1)[0]).is_loopback
    except ValueError:
        return False


_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex


def _address_host(address):
    if isinstance(address, tuple) and address:
        return address[0]
    # AF_UNIX sockets pass a path; those never leave the machine.
    return "localhost"


def _guarded_connect(sock, address):
    if not _is_loopback(_address_host(address)):
        raise OutboundNetworkBlocked(
            f"Blocked outbound connection to {address!r}. "
            "Mock the HTTP call instead of reaching a real service."
        )
    return _real_connect(sock, address)


def _guarded_connect_ex(sock, address):
    if not _is_loopback(_address_host(address)):
        raise OutboundNetworkBlocked(f"Blocked outbound connection to {address!r}.")
    return _real_connect_ex(sock, address)


def install_network_guard() -> None:
    socket.socket.connect = _guarded_connect
    socket.socket.connect_ex = _guarded_connect_ex


def uninstall_network_guard() -> None:
    socket.socket.connect = _real_connect
    socket.socket.connect_ex = _real_connect_ex
