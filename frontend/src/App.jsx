import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import About from './pages/About';
import Tool from './pages/Tool';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tool" element={<Tool />} />
        <Route path="about" element={<About />} />
      </Route>
    </Routes>
  );
}
