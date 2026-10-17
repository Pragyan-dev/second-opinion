"""Domain and address helpers shared by the fraud steps. Owner B."""

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

import phonenumbers
import tldextract

from app.config import settings

# Bundled public suffix snapshot only; never fetch the list over the network.
_extract = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)


class BlockedURL(Exception):
    pass


def host_of(url: str) -> str:
    if "://" not in url:
        url = f"//{url}"
    return (urlsplit(url).hostname or "").lower().rstrip(".")


def registered_domain(value: str) -> str:
    """Registered domain for a URL, host, or email address.

    Hosts without a public suffix (.example, .test, localhost) fall back to the last two labels.
    """
    value = (value or "").strip().lower()
    if "@" in value and "://" not in value:
        value = value.rsplit("@", 1)[1]
    host = host_of(value) if ("/" in value or ":" in value) else value.rstrip(".")
    if not host:
        return ""
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    parts = _extract(host)
    if parts.suffix and parts.domain:
        return f"{parts.domain}.{parts.suffix}"
    labels = host.split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else host


def normalize_phone(raw: str, region: str = "US") -> str | None:
    try:
        number = phonenumbers.parse(raw, region)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_possible_number(number):
        return None
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


def host_port(url: str) -> str:
    parts = urlsplit(url)
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return f"{(parts.hostname or '').lower()}:{port}"


def _blocked_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def resolve(host: str) -> list[str]:
    """Resolve a hostname to IP strings. Tests replace this function."""
    infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return sorted({info[4][0] for info in infos})


async def check_url_allowed(url: str) -> None:
    """Raise BlockedURL unless the URL is http(s) to a public address or an allowlisted host."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise BlockedURL(f"Only http and https URLs are crawled: {url}")
    if host_port(url) in settings.crawl_allow_hosts:
        return
    host = parts.hostname.lower()
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        try:
            addresses = await resolve(host)
        except OSError as exc:
            raise BlockedURL(f"Could not resolve {host}") from exc
    if not addresses or any(_blocked_ip(address) for address in addresses):
        raise BlockedURL(f"Refusing to crawl a private or local address: {host}")
