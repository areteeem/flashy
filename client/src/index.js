import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { installToastLifecycleOptimizations } from "./common/lib/toastLifecycle";

installToastLifecycleOptimizations();

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <BrowserRouter basename={routerBasename}>
            <App />
            <ToastContainer
              autoClose={2600}
              closeOnClick
              limit={3}
              newestOnTop
              pauseOnFocusLoss={false}
              toastStyle={{
                border: "1.5px solid var(--border-color, #111)",
                borderRadius: "3px",
                boxShadow: "none",
                background: "var(--card-bg, #fff)",
                color: "var(--fg, #111)",
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
