import { activateLicense } from "./store";

function reasonToStatus(reason) {
  if (reason === "invalid_key") return 404;
  if (reason === "expired_unpaid") return 403;
  if (reason === "device_mismatch") return 403;
  return 400;
}

export async function requireEndpointManagerAccess({ licenseKey, deviceId }) {
  if (!licenseKey || !deviceId) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: "licenseKey and deviceId are required" },
    };
  }

  const activation = await activateLicense({ licenseKey, deviceId });
  if (!activation.ok) {
    return {
      ok: false,
      status: reasonToStatus(activation.reason),
      body: { ok: false, error: activation.reason || "license_auth_failed" },
    };
  }

  return { ok: true, license: activation.license };
}

