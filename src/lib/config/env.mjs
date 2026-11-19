export function readEnv(name) {
  return process.env[name];
}

export function isAllowedOrigin(origin) {
  if (origin === null) return true;
  if (origin === "null") return false;

  const configuredOrigin = readEnv("APP_ORIGIN");
  const isDevelopmentOrTest = ["development", "test"].includes(readEnv("NODE_ENV"));
  return origin === configuredOrigin ||
    (isDevelopmentOrTest && origin === "http://localhost:3000");
}
