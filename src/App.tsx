import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Lab from './pages/lab/index'
import DrawUrslf from './pages/lab/draw-urslf/index'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/lab/draw-urslf" element={<DrawUrslf />} />
      </Routes>
    </BrowserRouter>
  )
}
