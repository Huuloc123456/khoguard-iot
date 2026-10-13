// DEC-041: demo passwords may be short (e.g. 1234). Letters/digits only, because the same values are
// written into C++ (kg_secrets.h) and SQL literals; that restriction is what keeps them injection-safe.
export const SECRET_PATTERN = /^[A-Za-z0-9]{4,128}$/;

export function readConfig(env, { migration = false } = {}) {
  const fail = key => { throw Object.assign(new Error(`Missing or invalid ${key}`),{code:'CONFIG'}); };
  const fixed = (key, value) => { if (env[key] !== value) fail(key); return value; };
  const port = (key, fallback) => {
    const value = env[key] ?? fallback;
    if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) fail(key);
    return Number(value);
  };
  const secret = key => {
    if (typeof env[key] !== 'string' || !SECRET_PATTERN.test(env[key])) fail(key);
    return env[key];
  };
  if (env.HTTP_HOST !== undefined && env.HTTP_HOST !== '127.0.0.1') fail('HTTP_HOST');
  const config = { host:'127.0.0.1', port:port('HTTP_PORT','3001'), db:{
    host:fixed('DB_HOST','127.0.0.1'), port:port('DB_PORT'), database:fixed('DB_NAME','khoguard_demo'),
    user:fixed(migration ? 'DB_MIGRATION_USER' : 'DB_USER', migration ? 'khoguard_migrate' : 'khoguard_runtime'),
    password:secret(migration ? 'DB_MIGRATION_PASSWORD' : 'DB_PASSWORD'),
    connectTimeout:1500, charset:'utf8mb4', timezone:'Z', multipleStatements:false,
  } };
  if (!migration) config.mqtt = {
    host:fixed('MQTT_HOST','127.0.0.1'), port:['18884','18885'].includes(env.MQTT_PORT) ? Number(env.MQTT_PORT) : fail('MQTT_PORT'),
    // 18885 is MQTT/TLS with the project demo CA (M12); 18884 stays as the localhost-only plain listener.
    tls:env.MQTT_PORT==='18885',
    username:fixed('MQTT_USERNAME','khoguard-backend'), password:secret('MQTT_PASSWORD'),
  };
  return config;
}
