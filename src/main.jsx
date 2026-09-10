import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import RogueTraderBuilder from "./RogueTraderBuilder.jsx";
import Login from "./Login.jsx";

// ponytail: plain `vite dev` has no /api, so sign-in is stubbed locally and the
// roster stays in localStorage. Run `vercel dev` to exercise the real Google +
// Upstash path. In a production build DEV is false, so a signed-out visitor
// gets the login screen.
const DEV_USER = { email: "local@dev", name: "Local dev" };

function Root() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  // Whether the roster can live on the server. Not the same as `me` being set:
  // under `vite dev` DEV_USER stands in with no API behind it. A 2xx is not
  // enough either — the SPA fallback answers /api/auth/me with HTML at 200 —
  // so this turns on only for a parsed user record that carries an email.
  const [cloud, setCloud] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((user) => {
        if (user && user.email) {
          setMe(user);
          setCloud(true);
        } else {
          setMe(import.meta.env.DEV ? DEV_USER : null);
        }
      });
  }, []);

  if (me === undefined) return null;
  if (me === null) return <Login />;
  return <RogueTraderBuilder me={me} cloud={cloud} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
