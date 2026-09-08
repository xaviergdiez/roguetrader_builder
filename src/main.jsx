import React from "react";
import ReactDOM from "react-dom/client";
import RogueTraderBuilder from "./RogueTraderBuilder.jsx";

// ponytail: no router, no auth, no /api — one self-contained component. Add the
// hash router + Login/CharacterList split when characters need to persist.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RogueTraderBuilder />
  </React.StrictMode>
);
