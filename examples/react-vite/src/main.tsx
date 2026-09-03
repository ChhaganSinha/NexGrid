import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// One stylesheet, shared verbatim by the React, Angular and vanilla adapters.
// Import it once, anywhere in the app.
import "@nexgrid/react/styles.css";
import "./index.css";

import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
