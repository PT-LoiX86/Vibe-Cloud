import crypto from 'node:crypto';
import xmlrpc from 'xmlrpc';

const XMLRPC_URL = process.env.OPENNEBULA_XMLRPC_URL || 'http://127.0.0.1:2633/RPC2';
const SERVER_USER = process.env.OPENNEBULA_SERVER_AUTH_USER || 'portal_server';
const SERVER_SECRET = process.env.OPENNEBULA_SERVER_AUTH_SECRET || '';

const url = new URL(XMLRPC_URL);
const client = xmlrpc.createClient({
  host: url.hostname,
  port: Number(url.port || 2633),
  path: url.pathname || '/RPC2',
});

export function buildServerCipherSession(targetUser = SERVER_USER, ttlSeconds = 300) {
  if (!SERVER_SECRET) {
    throw new Error('OPENNEBULA_SERVER_AUTH_SECRET is not configured');
  }

  const sha256Hex = crypto.createHash('sha256').update(SERVER_SECRET.trim()).digest('hex');
  const key = Buffer.from(sha256Hex.slice(0, 32), 'utf8');
  const iv = key.subarray(0, 16);

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${SERVER_USER}:${targetUser}:${expires}`;

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]).toString('base64');

  return `${SERVER_USER}:${targetUser}:${encrypted}`;
}

export function callOne(method, params = [], targetUser = SERVER_USER) {
  const session = buildServerCipherSession(targetUser);

  return new Promise((resolve, reject) => {
    client.methodCall(method, [session, ...params], (err, value) => {
      if (err) {
        const transportErr = new Error(`XML-RPC transport error (${method}): ${err.message}`);
        transportErr.oneMethod = method;
        transportErr.faultCode = err.faultCode ?? null;
        transportErr.faultString = err.faultString ?? err.message;
        transportErr.rawDetails = JSON.stringify(
          {
            method,
            targetUser,
            faultCode: err.faultCode ?? null,
            faultString: err.faultString ?? null,
            message: err.message,
          },
          null,
          2
        );
        return reject(transportErr);
      }

      const [success, payload, errorCode] = value;
      if (!success) {
        const oneErr = new Error(`OpenNebula API error (${method}) [${errorCode}]: ${payload}`);
        oneErr.oneMethod = method;
        oneErr.oneErrorCode = errorCode;
        oneErr.rawDetails = JSON.stringify(
          {
            method,
            targetUser,
            oneErrorCode: errorCode,
            payload,
          },
          null,
          2
        );
        return reject(oneErr);
      }

      resolve(payload);
    });
  });
}
