/**
 * GitHub webhook signature verification
 */

/**
 * Verify GitHub webhook signature
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  
  // Import the secret as a key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Compute HMAC
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  
  // Convert to hex string
  const expected = `sha256=${Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`;
  
  // Timing-safe comparison
  return timingSafeEqual(expected, signature);
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return mismatch === 0;
}

/**
 * Extract payload from webhook body
 */
export function extractWebhookPayload(body: string, contentType: string | null): string {
  // Handle form-encoded payloads
  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const payload = params.get('payload');
    if (payload) {
      return payload;
    }
  }
  
  // Otherwise assume JSON
  return body;
}
