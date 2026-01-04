async function generatePresignedUrl(env, filePath, expiresIn = 3600) {
  let endpoint = env.S3_ENDPOINT;
  if (!endpoint.includes(env.S3_REGION)) {
    endpoint = `s3.${env.S3_REGION}.${endpoint}`
  }

  // Build base URL
  const urlString = `https://${env.S3_BUCKET}.${endpoint}/${filePath}`
  const url = new URL(urlString);
  const host = url.host;

  // Create timestamp
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Create credential scope
  const credentialScope = `${dateStamp}/${env.S3_REGION}/s3/aws4_request`;
  const credential = `${env.S3_ACCESS_KEY}/${credentialScope}`;

  // Add query parameters
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', credential);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', expiresIn.toString());
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  // Create canonical request
  const canonicalUri = `/${filePath}`;
  const canonicalQueryString = url.searchParams.toString();
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Create string to sign
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  // Calculate signature
  const signature = await getSignature(env.S3_SECRET_KEY, dateStamp, env.S3_REGION, stringToSign);

  // Add signature to URL
  url.searchParams.set('X-Amz-Signature', signature);

  return url.toString();
}

async function readFromS3(env, filePath) {
  let endpoint = env.S3_ENDPOINT;
  if (!endpoint.includes(env.S3_REGION)) {
    endpoint = `s3.${env.S3_REGION}.${endpoint}`
  }

  const urlString = `https://${env.S3_BUCKET}.${endpoint}/${filePath}`
  // Build URL
  const url = new URL(urlString);

  // Create AWS Signature V4
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const host = url.host;
  const method = 'GET';
  const canonicalUri = `/${filePath}`;

  // Create canonical request
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // empty payload

  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${env.S3_REGION}/s3/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  // Calculate signature
  const signature = await getSignature(env.S3_SECRET_KEY, dateStamp, env.S3_REGION, stringToSign);

  // Create authorization header
  const authHeader = `${algorithm} Credential=${env.S3_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
      headers: {
          'Authorization': authHeader,
          'x-amz-date': amzDate
      }
  });

  return response;
}

// Helper functions for AWS Signature V4
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
      'raw',
      typeof key === 'string' ? new TextEncoder().encode(key) : key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function getSignature(secretKey, dateStamp, region, stringToSign) {
  const kDate = await hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = await hmac(kSigning, stringToSign);
  return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
}

import share from "./share.html"
import service from "./share-sw.js.txt"
import zstdJs from "./zstd.js.txt"
import zstdWasm from "./zstd.wasm.bin"

export default {
  async fetch(request, env, ctx) {
      try {
          const missing = [];
          if (!env.S3_ENDPOINT) missing.push('S3_ENDPOINT');
          if (!env.S3_REGION) missing.push('S3_REGION');
          if (!env.S3_BUCKET) missing.push('S3_BUCKET');
          if (!env.S3_ACCESS_KEY) missing.push('S3_ACCESS_KEY');
          if (!env.S3_SECRET_KEY) missing.push('S3_SECRET_KEY');
          if (missing.length > 0) {
              return new Response(
                  `Missing required environment variables: ${missing.join(', ')}\n\n` +
                  'Please configure them in Settings > Variables\n\n' +
                  'Example values:\n' +
                  'S3_ENDPOINT: backblazeb2.com\n' +
                  'S3_REGION: us-west-002\n' +
                  'S3_BUCKET: my-backup\n' +
                  'S3_ACCESS_KEY: AKIAIOSFODNN7EXAMPLE\n' +
                  'S3_SECRET_KEY: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                  { status: 500 }
              );
          }

          const url = new URL(request.url);
          if (url.pathname.startsWith('/share-data/')) {
            const key = url.pathname.slice("/share-data/".length);
            const response = await readFromS3(env, `share/${key}`)
            if (!response.ok) {
              if (response.status == 404) {
                return new Response("404", { status: 404 })
              }
              return new Response(`Error reading from S3: ${response.status} ${response.statusText}`, { status: 500 });
            }
            let json = await response.json();
            json.url = await generatePresignedUrl(env, json.path);
            return new Response(JSON.stringify(json), { headers: { "Content-Type": "application/json" } });
          }

          const path = url.pathname.slice(1); // remove leading "/"
          if (path === "zstd/zstd.js") {
            return new Response(zstdJs, { headers: { 'Content-Type': "application/javascript; charset=utf-8" }})
          }
          if (path === "zstd/zstd.wasm") {
            return new Response(new Uint8Array(zstdWasm), { headers: { 'Content-Type': "application/wasm" }})
          }
          if (path === "share-sw.js") {
            return new Response(service,  { headers: {
              'Content-Type': "application/javascript; charset=utf-8",
              'Content-Length': String(share.length)
              //'Cache-Control': 'public, max-age=3600'
            }});
          }
          return new Response(share,  { headers: {
            'Content-Type': "text/html; charset=utf-8",
            'Content-Length': String(share.length)
            //'Cache-Control': 'public, max-age=3600'
          }});
      } catch (e) {
          console.error("Crash:", e);
          return new Response(String(e), { status: 500 });
      }
  }
};
