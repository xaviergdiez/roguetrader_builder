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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((user) => setMe(user ?? (import.meta.env.DEV ? DEV_USER : null)));
  }, []);

  if (me === undefined) return null;
  if (me === null) return <Login />;
  return <RogueTraderBuilder me={me} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
