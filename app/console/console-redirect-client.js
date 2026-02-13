"use client";

import { useEffect, useMemo, useState } from "react";

const LOCAL_CONSOLE_URL = "http://localhost:11434/console";
const AUTH_COOKIE = "llmhotspot_remote_console_key";
const LOCAL_ADMIN_COOKIE = "llmhotspot_local_admin_key";

function targetUrl(localAdminKey) {
  if (!localAdminKey) return LOCAL_CONSOLE_URL;
  return `${LOCAL_CONSOLE_URL}?admin_key=${encodeURIComponent(localAdminKey)}`;
}

export default function ConsoleRedirectClient({ remoteAccessKey, localAdminKey }) {
  const [offline, setOffline] = useState(false);
  const localConsoleUrl = useMemo(() => targetUrl(localAdminKey), [localAdminKey]);

  useEffect(() => {
    if (remoteAccessKey) {
      document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(remoteAccessKey)}; Max-Age=2592000; Path=/; SameSite=Lax; Secure`;
    }
    if (localAdminKey) {
      document.cookie = `${LOCAL_ADMIN_COOKIE}=${encodeURIComponent(localAdminKey)}; Max-Age=2592000; Path=/; SameSite=Lax; Secure`;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      try {
        window.location.href = localConsoleUrl;
      } catch {
        if (!cancelled) setOffline(true);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [remoteAccessKey, localAdminKey, localConsoleUrl]);

  return (
    <>
      {offline ? (
        <p>
          Could not open local console. Start desktop runtime, then use{" "}
          <a href={localConsoleUrl}>Open Local Console</a>.
        </p>
      ) : null}
    </>
  );
}
