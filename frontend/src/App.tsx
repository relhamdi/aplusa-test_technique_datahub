import { Navigate, Route, Routes } from "react-router-dom";

import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/imports/:id" element={<ImportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
