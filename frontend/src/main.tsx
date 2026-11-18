import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import "./index.css";
import { Dashboard } from "./pages/Dashboard";

// Component gallery, dev server only. import.meta.env.DEV is replaced at build
// time, so this route and its chunk do not ship to the Pi or the Vercel demo.
const Components = import.meta.env.DEV
  ? lazy(() => import("./pages/Components").then((m) => ({ default: m.Components })))
  : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {Components && (
            <Route
              path="/components"
              element={
                <Suspense fallback={null}>
                  <Components />
                </Suspense>
              }
            />
          )}
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
