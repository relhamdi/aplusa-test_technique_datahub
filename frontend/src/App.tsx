import { Navigate, Route, Routes } from "react-router-dom";

import { HomePage } from "./pages/HomePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {/* The import page (/imports/:id) is added with the data table. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
