import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resourceAllowed } from './urls.mjs';

export function publicAddress(address) {
  const value = address.toLowerCase();
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b))
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
  }
  // Only native global-unicast IPv6; reject mapped, link-local, multicast and unique-local addresses.
  return isIP(value) === 6 && /^[23][0-9a-f]{3}:/.test(value) && !/^2001:(?:db8|0):/.test(value);
}

export function createResourcePolicy(platform, { fixtureOrigin, resolve = lookup } = {}) {
  const hosts = new Map();
  return async input => {
    if (!resourceAllowed(input, fixtureOrigin, platform)) return false;
    const url = new URL(input);
    if (['data:', 'blob:', 'about:'].includes(url.protocol) || (fixtureOrigin && url.origin === fixtureOrigin)) return true;
    if (!hosts.has(url.hostname)) {
      hosts.set(url.hostname, Promise.race([
        resolve(url.hostname, { all: true, verbatim: true }).then(addresses => addresses.length > 0 && addresses.every(a => publicAddress(a.address))),
        new Promise(resolveTimeout => { const timer = setTimeout(() => resolveTimeout(false), 5000); timer.unref(); })
      ]).catch(() => false));
    }
    return hosts.get(url.hostname);
  };
}
