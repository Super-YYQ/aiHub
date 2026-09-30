// 生成测试用的 RSA 密钥对与一批已签名的 JWT（运行一次，产物提交进仓库供测试使用）。
// 这些是只用于测试的假密钥，不含任何真实凭据。
// 运行：node test/fixtures/generate.mjs
import { generateKeyPair, SignJWT, exportJWK, importPKCS8, exportPKCS8 } from 'jose';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEAM = 'https://test-team.cloudflareaccess.com';
const AUD = 'test-aud-tag';
const ISSUER_EMAIL = 'owner@example.com';

const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
const publicJwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig' };

const key = await importPKCS8(await exportPKCS8(privateKey), 'RS256');
async function sign(payload, expiresIn, expOverride) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(payload.iss ?? TEAM)
    .setAudience(payload.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(expOverride ?? expiresIn)
    .sign(key);
}

const tokens = {
  owner: await sign({ email: ISSUER_EMAIL }, '8760h'),
  otherEmail: await sign({ email: 'stranger@example.com' }, '8760h'),
  agent: await sign({ common_name: 'test-agent-client-id' }, '8760h'),
  capture: await sign({ common_name: 'test-capture-client-id' }, '8760h'),
  backup: await sign({ common_name: 'test-backup-client-id' }, '8760h'),
  unknownService: await sign({ common_name: 'unknown-client-id' }, '8760h'),
  expired: await sign({ email: ISSUER_EMAIL }, '1h', Math.floor(Date.now() / 1000) - 3600),
  wrongAud: await sign({ email: ISSUER_EMAIL, aud: 'other-aud' }, '8760h'),
  noEmailNoCn: await sign({ sub: 'x' }, '8760h'),
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(resolve(here, 'jwks.json'), JSON.stringify({ keys: [publicJwk] }, null, 2));
writeFileSync(
  resolve(here, 'tokens.json'),
  JSON.stringify(
    {
      team: TEAM,
      aud: AUD,
      allowedEmail: ISSUER_EMAIL,
      serviceRoles: {
        'test-agent-client-id': 'agent',
        'test-capture-client-id': 'capture',
        'test-backup-client-id': 'backup',
      },
      tokens,
    },
    null,
    2,
  ),
);
console.log('fixtures 已生成：jwks.json + tokens.json');
