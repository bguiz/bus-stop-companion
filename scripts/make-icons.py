#!/usr/bin/env python3
"""Generate icons/icon-{180,192,512}.png using only the standard library."""
import os, struct, zlib

BG = (27, 42, 74)        # #1b2a4a
SIGN = (255, 180, 84)    # #ffb454 accent
DARK = (14, 20, 36)      # #0e1424
WHITE = (246, 247, 251)


def rrect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x < x1 and y0 <= y < y1):
        return False
    cx = min(max(x, x0 + r), x1 - r - 1)
    cy = min(max(y, y0 + r), y1 - r - 1)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def pixel(x, y, n):
    u = n / 100.0
    # bus-stop sign: pole + rounded sign plate with a bus glyph
    if 47 * u <= x < 53 * u and 62 * u <= y < 90 * u:
        return WHITE
    if rrect(x, y, 22 * u, 12 * u, 78 * u, 64 * u, 8 * u):
        # bus body
        if rrect(x, y, 30 * u, 22 * u, 70 * u, 52 * u, 5 * u):
            # windows band
            if 34 * u <= x < 66 * u and 26 * u <= y < 38 * u:
                return SIGN
            # wheels
            for wx in (38, 62):
                if (x - wx * u) ** 2 + (y - 52 * u) ** 2 <= (4.5 * u) ** 2:
                    return WHITE
            return DARK
        for wx in (38, 62):
            if (x - wx * u) ** 2 + (y - 52 * u) ** 2 <= (4.5 * u) ** 2:
                return WHITE
        return SIGN
    return BG


def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, n):
    rows = bytearray()
    for y in range(n):
        rows.append(0)
        for x in range(n):
            rows.extend(pixel(x, y, n))
    ihdr = struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
                + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    for size in (180, 192, 512):
        write_png(os.path.join(out, 'icon-%d.png' % size), size)
