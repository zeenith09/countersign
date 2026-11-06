const expectedSpikeEndpointId = "ep-winter-wave-b5uo4p26";

export function assertSpikeTarget(connectionString: string, variable: string) {
  let hostname: string;
  try {
    hostname = new URL(connectionString).hostname.toLowerCase();
  } catch {
    throw new Error(`${variable} must be a valid Neon connection URL.`);
  }

  if (!hostname.endsWith(".neon.tech")) {
    throw new Error(`${variable} must use a Neon endpoint.`);
  }

  const normalizedHostname = hostname.replace(/-pooler(?=\.)/, "");
  const endpointId = normalizedHostname.split(".")[0];
  if (endpointId !== expectedSpikeEndpointId) {
    throw new Error(
      `${variable} resolves to endpoint ${endpointId}; expected spike endpoint ${expectedSpikeEndpointId}.`,
    );
  }

  const expectsPooled = variable === "SPIKE_DATABASE_URL";
  if (hostname.includes("-pooler.") !== expectsPooled) {
    const expectedMode = expectsPooled ? "pooled" : "direct";
    throw new Error(`${variable} must use the ${expectedMode} Neon connection host.`);
  }
}
