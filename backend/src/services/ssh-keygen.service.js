import crypto from "node:crypto";

/**
 * Generates an Ed25519 SSH keypair in memory.
 * The private key is returned once for browser download and NEVER persisted on the server.
 */
function encodeSshString(input) {
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(String(input), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(buf.length, 0);
  return Buffer.concat([header, buf]);
}

function uint32BE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0, 0);
  return buf;
}

export function generateEd25519Keypair(comment = "portal-user@iaas") {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  // RFC 8410: Ed25519 SPKI DER ends with the 32-byte public key; PKCS#8 DER ends with the 32-byte private seed
  const rawPublicKey = publicKey.subarray(-32);
  const rawPrivateSeed = privateKey.subarray(-32);

  // OpenSSH public key line for authorized_keys / OpenNebula CONTEXT
  const pubBlob = Buffer.concat([
    encodeSshString("ssh-ed25519"),
    encodeSshString(rawPublicKey),
  ]);
  const formattedPublicKey = `ssh-ed25519 ${pubBlob.toString("base64")} ${comment}`;

  // OpenSSH private key ("openssh-key-v1\0") binary structure
  const checkInt = crypto.randomBytes(4).readUInt32BE(0);
  const privKey64 = Buffer.concat([rawPrivateSeed, rawPublicKey]);

  let privateSection = Buffer.concat([
    uint32BE(checkInt),
    uint32BE(checkInt),
    encodeSshString("ssh-ed25519"),
    encodeSshString(rawPublicKey),
    encodeSshString(privKey64),
    encodeSshString(comment),
  ]);

  // Pad private section to an 8-byte boundary (block size for cipher "none")
  const padLen = (8 - (privateSection.length % 8)) % 8;
  if (padLen > 0) {
    const padding = Buffer.alloc(padLen);
    for (let i = 0; i < padLen; i += 1) {
      padding[i] = i + 1;
    }
    privateSection = Buffer.concat([privateSection, padding]);
  }

  const fullBlob = Buffer.concat([
    Buffer.from("openssh-key-v1\0", "binary"),
    encodeSshString("none"), // ciphername
    encodeSshString("none"), // kdfname
    encodeSshString(Buffer.alloc(0)), // kdfoptions
    uint32BE(1), // number of keys
    encodeSshString(pubBlob),
    encodeSshString(privateSection),
  ]);

  const wrappedBody = fullBlob
    .toString("base64")
    .match(/.{1,70}/g)
    .join("\n");
  const formattedPrivateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrappedBody}\n-----END OPENSSH PRIVATE KEY-----\n`;

  return {
    publicKey: formattedPublicKey,
    privateKey: formattedPrivateKey,
    privateKeyPem: formattedPrivateKey,
  };
}

export const generateEd25519KeyPair = generateEd25519Keypair;
